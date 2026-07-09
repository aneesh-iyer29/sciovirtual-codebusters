#!/usr/bin/env node
/* =========================================================================
   add-recording.mjs: create (or update) a "Day N" page under the
   Slides & Recordings tab from a Google Drive recording link and a Google
   Slides link, and wire it into the navigation.

   Interactive:  node tools/add-recording.mjs
   From a file:  node tools/add-recording.mjs --json path/to/recording.json
   Flags:        --dry   print what would happen; write nothing

   You paste the two share links (you host the files on Google; the tool only
   links to and embeds them). It derives the inline-preview and open-in-Drive
   URLs, fills tools/templates/recording.html, writes slides-recordings/day-N.html
   (deleting any existing one first), and adds/refreshes the nav entry.
   ========================================================================= */
import { readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readNav, writeNav, insertUnderPath } from "./navlib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NAV_PATH = join(ROOT, "assets/js/nav.js");
const TPL_PATH = join(ROOT, "tools/templates/recording.html");
const SR_DIR = join(ROOT, "slides-recordings");
const NAV_GROUP = "Slides & Recordings";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ""));

/** Pull a Google Drive file id from any of its share-link shapes. */
function driveFileId(url) {
  const u = String(url).trim();
  const m = u.match(/\/d\/([A-Za-z0-9_-]{10,})/) || u.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/** Pull a Google Slides id (and whether it's a published /d/e/ link). */
function slidesId(url) {
  const u = String(url).trim();
  const e = u.match(/\/presentation\/d\/e\/([A-Za-z0-9_-]{10,})/);
  if (e) return { id: e[1], pub: true };
  const m = u.match(/\/presentation\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? { id: m[1], pub: false } : null;
}

/** Highest N among existing slides-recordings/day-N.html, for a sensible default. */
async function nextDay() {
  try {
    const files = await readdir(SR_DIR);
    const nums = files.map((f) => (f.match(/^day-(\d+)\.html$/) || [])[1]).filter(Boolean).map(Number);
    return nums.length ? Math.max(...nums) + 1 : 1;
  } catch { return 1; }
}

const dayNumOf = (label) => {
  const m = String(label).match(/(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

async function collectInteractive(rl) {
  const ask = async (q, def) => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def || "";
  };
  let recording = "";
  while (!recording) recording = await ask("  Google Drive recording link");
  let slides = "";
  while (!slides) slides = await ask("  Google Slides link");
  const day = await ask("  Which day number is this?", String(await nextDay()));
  return { recording, slides, day };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const DRY = args.includes("--dry");
  const jsonPath = flag("--json");

  let f;
  if (jsonPath) {
    const p = JSON.parse(await readFile(resolve(jsonPath), "utf8"));
    f = {
      recording: p.recording || p.video || "",
      slides: p.slides || "",
      day: String(p.day ?? "").trim() || String(await nextDay()),
    };
  } else {
    const rl = createInterface({ input, output });
    try { f = await collectInteractive(rl); }
    finally { rl.close(); }
  }

  // ---- validate + derive ----
  const daySafe = String(f.day).replace(/[^0-9]/g, "");
  if (!daySafe) throw new Error(`Day must be a number, got "${f.day}".`);
  if (!f.recording) throw new Error("No recording link was provided.");
  if (!f.slides) throw new Error("No slides link was provided.");

  const fileId = driveFileId(f.recording);
  if (!fileId) throw new Error(`Couldn't find a Google Drive file id in the recording link:\n     ${f.recording}`);
  const sl = slidesId(f.slides);
  if (!sl) throw new Error(`Couldn't find a Google Slides id in the slides link:\n     ${f.slides}`);

  const videoEmbed = `https://drive.google.com/file/d/${fileId}/preview`;
  const videoView = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  const slidesEmbed = sl.pub
    ? `https://docs.google.com/presentation/d/e/${sl.id}/embed`
    : `https://docs.google.com/presentation/d/${sl.id}/embed`;
  const slidesView = sl.pub
    ? `https://docs.google.com/presentation/d/e/${sl.id}/pub`
    : `https://docs.google.com/presentation/d/${sl.id}/edit?usp=sharing`;

  const relPath = `slides-recordings/day-${daySafe}.html`;
  const href = `/${relPath}`;
  const absPath = join(ROOT, relPath);
  const existed = existsSync(absPath);

  const tpl = await readFile(TPL_PATH, "utf8");
  const html = fill(tpl, {
    DAY: esc(daySafe),
    VIDEO_EMBED: esc(videoEmbed),
    VIDEO_VIEW: esc(videoView),
    SLIDES_EMBED: esc(slidesEmbed),
    SLIDES_VIEW: esc(slidesView),
  });

  if (DRY) {
    console.log("\n  --- DRY RUN (nothing written) ---\n");
    console.log(`  Page:          ${relPath}${existed ? "  (would replace the existing page)" : "  (new)"}`);
    console.log(`  Video embed:   ${videoEmbed}`);
    console.log(`  Video open:    ${videoView}`);
    console.log(`  Slides embed:  ${slidesEmbed}`);
    console.log(`  Slides open:   ${slidesView}`);
    console.log(`  Nav:           ${NAV_GROUP} › Day ${daySafe}\n`);
    return;
  }

  // ---- write page (delete-then-write so an update is a clean replace) ----
  if (existed) await unlink(absPath);
  await writeFile(absPath, html, "utf8");

  // ---- wire into navigation, then keep the days in order ----
  const state = await readNav(NAV_PATH);
  insertUnderPath(state.NAV, [NAV_GROUP], { label: `Day ${daySafe}`, href }, []);
  const grp = state.NAV.find((n) => (n.label || "").toLowerCase() === NAV_GROUP.toLowerCase());
  if (grp && Array.isArray(grp.children)) grp.children.sort((a, b) => dayNumOf(a.label) - dayNumOf(b.label));
  await writeNav(NAV_PATH, state);

  console.log(`\n  ${existed ? "✓ Updated" : "✓ Created"}  ${relPath}`);
  console.log(`  ✓ Linked   ${NAV_GROUP} › Day ${daySafe}`);
  console.log(`\n  Preview:   http://localhost:8000${href}`);
  console.log(`  (run  npm start  to serve locally, then commit + push)\n`);
}

main().catch((e) => { console.error("\n  ✗ " + e.message + "\n"); process.exit(1); });
