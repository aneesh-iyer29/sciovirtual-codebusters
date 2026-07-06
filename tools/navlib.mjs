/* =========================================================================
   navlib.mjs: read and rewrite assets/js/nav.js safely.
   Shared by add-question.mjs and add-page.mjs.
   nav.js is the single source of truth for navigation; these helpers import
   its current values, mutate them, and write it back in a stable format.
   ========================================================================= */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const HEADER = `/* =========================================================================
   Navigation: single source of truth for the whole site.
   Rendered at runtime by site.js. Edited by tools/add-question.mjs and
   tools/add-page.mjs, but it's plain data, so hand-editing is fine too.
   Each entry is { label, href } for a link, or { label, href?, children:[...] }
   for a group. A child that itself has children renders as a labelled sub-group.
   ========================================================================= */\n\n`;

/** Load the current exports from nav.js (cache-busted so repeated runs see fresh data). */
export async function readNav(navPath) {
  const url = pathToFileURL(navPath).href + "?t=" + Date.now();
  const mod = await import(url);
  return {
    SITE: mod.SITE,
    NAV: mod.NAV,
    NAV_CTA: mod.NAV_CTA,
    FOOTER: mod.FOOTER,
  };
}

/** Serialize the nav module back to source. JSON literals are valid JS. */
export function serializeNav({ SITE, NAV, NAV_CTA, FOOTER }) {
  if (!Array.isArray(NAV)) throw new Error("nav.js: NAV export is missing or not an array, refusing to rewrite.");
  SITE = SITE || {};
  NAV_CTA = NAV_CTA ?? null;
  FOOTER = FOOTER || [];
  const j = (v) => JSON.stringify(v, null, 2);
  return (
    HEADER +
    `export const SITE = ${j(SITE)};\n\n` +
    `export const NAV = ${j(NAV)};\n\n` +
    `export const NAV_CTA = ${j(NAV_CTA)};\n\n` +
    `export const FOOTER = ${j(FOOTER)};\n`
  );
}

export async function writeNav(navPath, state) {
  await writeFile(navPath, serializeNav(state), "utf8");
}

/** Walk/create a group path (array of labels) and return the deepest group node. */
export function ensureGroup(list, pathLabels, hrefs = []) {
  let cur = list;
  let node = null;
  pathLabels.forEach((label, i) => {
    node = cur.find((n) => (n.label || "").toLowerCase() === String(label).toLowerCase());
    if (!node) {
      node = { label };
      if (hrefs[i]) node.href = hrefs[i];
      node.children = [];
      cur.push(node);
    }
    if (!node.children) node.children = [];
    cur = node.children;
  });
  return node;
}

/** Insert a { label, href } entry under a group path, de-duping by href. */
export function insertUnderPath(NAV, pathLabels, entry, hrefs = []) {
  const target = pathLabels.length ? ensureGroup(NAV, pathLabels, hrefs).children : NAV;
  const existing = target.findIndex((n) => n.href && n.href === entry.href);
  if (existing >= 0) target[existing] = { ...target[existing], ...entry };
  else target.push(entry);
}

/** Flatten the nav tree into selectable group paths (for interactive pickers). */
export function listGroups(NAV) {
  const out = [];
  const walk = (nodes, path) => {
    for (const n of nodes) {
      if (n.children) {
        const p = [...path, n.label];
        out.push({ path: p, href: n.href || null });
        walk(n.children, p);
      }
    }
  };
  walk(NAV, []);
  return out;
}

export const slugify = (s) =>
  String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page";

export const titleCase = (s) =>
  String(s).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
