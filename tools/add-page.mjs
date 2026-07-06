#!/usr/bin/env node
/* =========================================================================
   add-page.mjs: create a normal content page from an embed (a Google Form,
   Doc, Slides deck, YouTube/Drive video, or any pasted HTML) and wire it into
   the navigation.

   Interactive:  node tools/add-page.mjs
   From a file:  node tools/add-page.mjs --json path/to/page.json

   For pasted embed HTML, save the embed code to a file first and give its path
   when asked (or set "embedFile" in the JSON). For a simple iframe, just give
   the URL and pick an aspect ratio.
   ========================================================================= */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readNav, writeNav, insertUnderPath, listGroups, slugify } from "./navlib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NAV_PATH = join(ROOT, "assets/js/nav.js");
const TPL_PATH = join(ROOT, "tools/templates/page.html");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ""));

const ASPECTS = { video: "16 / 9", doc: "8.5 / 11", square: "1 / 1", form: "3 / 4" };

function embedFromUrl(url, kind, title) {
  const ar = ASPECTS[kind] || "16 / 9";
  const cls = kind === "video" ? "embed embed-video" : "embed";
  const extra = kind === "doc" || kind === "video" ? "" : ` style="aspect-ratio: ${ar};"`;
  const styleAttr = kind === "doc" ? "" : (kind === "video" ? "" : extra);
  const allow = kind === "video" ? ' allow="autoplay" allowfullscreen' : "";
  const base = kind === "doc" ? ' class="embed doc"' : (kind === "video" ? ' class="embed embed-video"' : ` class="embed"${extra}`);
  return `        <div${base}>
          <iframe src="${esc(url)}" title="${esc(title)}"${allow} loading="lazy"></iframe>
        </div>`;
}

function crumbsFrom(navPath, title) {
  const parts = [`<a href="/">Home</a>`, ...navPath.map((p) => esc(p)), esc(title)];
  return parts.join(" / ");
}

async function collectInteractive(rl) {
  const ask = async (q, def) => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def || "";
  };

  const title = await ask("  Page title");
  const lead = await ask("  One-line intro (optional)", "");
  const slug = slugify(await ask("  URL slug", slugify(title)));

  console.log("\n  Existing nav groups:");
  const groups = listGroups((await readNav(NAV_PATH)).NAV);
  groups.forEach((g, i) => console.log(`   ${i + 1}. ${g.path.join(" › ")}`));
  console.log("   0. Top level (no group)");
  const gp = await ask("\n  Put it under which group? (number, or type a new path like 'Course Info')", "0");
  let navPath = [];
  if (gp !== "0") {
    const byNum = groups[Number(gp) - 1];
    navPath = byNum ? byNum.path : gp.split("/").map((s) => s.trim()).filter(Boolean);
  }

  const folder = await ask("  Folder to save the page in (relative, blank = site root)",
    navPath.length ? slugify(navPath[navPath.length - 1]) : "");

  console.log("\n  Embed source:");
  console.log("   1. An iframe URL (Form, Doc, Slides, YouTube/Drive video)");
  console.log("   2. A file containing pasted embed HTML");
  const mode = await ask("  Choose", "1");

  let embed;
  if (mode === "2") {
    const p = await ask("  Path to the .html file with the embed code");
    embed = "        " + (await readFile(resolve(p), "utf8")).trim().replace(/\n/g, "\n        ");
  } else {
    const url = await ask("  Iframe URL");
    console.log("  Aspect: video | doc | form | square");
    const kind = (await ask("  Which kind of embed", "video")).toLowerCase();
    embed = embedFromUrl(url, kind, title);
  }

  return { title, lead, slug, navPath, folder, embed };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf("--json");
  let fields;

  if (jsonIdx >= 0) {
    const p = JSON.parse(await readFile(args[jsonIdx + 1], "utf8"));
    const navPath = p.nav ? (Array.isArray(p.nav) ? p.nav : String(p.nav).split("/").map((s) => s.trim()).filter(Boolean)) : [];
    let embed;
    if (p.embedFile) embed = "        " + (await readFile(resolve(p.embedFile), "utf8")).trim().replace(/\n/g, "\n        ");
    else if (p.embedHtml) embed = "        " + p.embedHtml.trim().replace(/\n/g, "\n        ");
    else embed = embedFromUrl(p.url, (p.kind || "video").toLowerCase(), p.title);
    fields = { title: p.title, lead: p.lead || "", slug: slugify(p.slug || p.title), navPath,
               folder: p.folder ?? (navPath.length ? slugify(navPath[navPath.length - 1]) : ""), embed };
  } else {
    const rl = createInterface({ input, output });
    try { fields = await collectInteractive(rl); }
    finally { rl.close(); }
  }

  const { title, lead, slug, navPath, folder, embed } = fields;
  // sanitize each folder segment so a crafted folder can't escape the site root
  const safeFolder = String(folder || "").split("/").map(slugify).filter(Boolean).join("/");
  const relPath = (safeFolder ? `${safeFolder}/` : "") + `${slug}.html`;
  const href = `/${relPath}`;
  const absPath = join(ROOT, relPath);

  const tpl = await readFile(TPL_PATH, "utf8");
  const html = fill(tpl, {
    TITLE: esc(title), DESC: esc(lead || title), CRUMBS: crumbsFrom(navPath, title),
    HEADING: esc(title), LEAD: esc(lead), EMBED: embed,
  });

  await mkdir(dirname(absPath), { recursive: true });
  if (existsSync(absPath)) console.log(`\n  ⚠  ${relPath} already exists, overwriting.`);
  await writeFile(absPath, html, "utf8");

  const state = await readNav(NAV_PATH);
  insertUnderPath(state.NAV, navPath, { label: title, href });
  await writeNav(NAV_PATH, state);

  console.log(`\n  ✓ Created  ${relPath}`);
  console.log(`  ✓ Linked   ${[...navPath, title].join(" › ")}`);
  console.log(`\n  Preview:   http://localhost:8000${href}\n`);
}

main().catch((e) => { console.error("\n  ✗ " + e.message + "\n"); process.exit(1); });
