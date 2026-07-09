#!/usr/bin/env node
/* =========================================================================
   add-homework.mjs: publish a homework assignment on the Homework page.

   Interactive:  node tools/add-homework.mjs
   From a file:  node tools/add-homework.mjs --json path/to/homework.json
   Flags:        --pdf <path>   source PDF (overrides the prompt / JSON)
                 --force        overwrite an existing PDF / reuse a used day
                 --dry          print what would happen; write nothing

   Unlike add-question / add-page, this does NOT create a new page or touch
   the nav. The Homework page already exists (with its own styles and nav
   entry); each assignment is one <article class="hw-item"> block. This tool:
     1. copies your PDF into assets/hw/ under a URL-safe filename,
     2. fills tools/templates/homework.html with the title/desc/day/form link,
     3. splices that block into course-information/homework.html at the
        "add:homework anchor" sentinel (newest assignment last).

   You supply the submission form's share URL; the tool only links to it. It
   does not create or edit the Google Form itself.
   ========================================================================= */
import { readFile, writeFile, copyFile, mkdir, rename, open } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PAGE_PATH = join(ROOT, "course-information/homework.html");
const TPL_PATH = join(ROOT, "tools/templates/homework.html");
const HW_DIR = join(ROOT, "assets/hw");
const HW_URL_BASE = "/assets/hw";
const ANCHOR = "<!-- add:homework anchor: new assignments are inserted above this line. Keep it here. -->";
const DEFAULT_DESC = "Preview the first page below, or open the full assignment to scroll and print.";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ""));
const expandHome = (p) => (p && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

/** Prefix every non-blank line with `indent` (blank lines stay empty). */
const indentBlock = (s, indent) =>
  s.split("\n").map((l) => (l.trim() === "" ? "" : indent + l)).join("\n");

/** Strip accents so "Vigenère" -> "Vigenere" instead of losing the letter. */
const deaccent = (s) => String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/** Force a name down to [A-Za-z0-9._-] and a .pdf extension, so links never
    need URL-encoding (this is what bit us with "Porta&Columnar.pdf"). */
function safeFilename(name) {
  let stem = deaccent(name).replace(/\.pdf$/i, "");
  stem = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (stem || "homework") + ".pdf";
}

/** Default stored filename: Sciovirtual-Day<N>-HW-<Topic>.pdf, topic from the
    title (the part after "Homework #N ·"), falling back to the source name. */
function defaultPdfName(day, title, srcBase) {
  let topic = deaccent(title || "").replace(/homework\s*#?\s*\d+/i, "").replace(/^[\s·:–—-]+/, "").trim();
  topic = topic.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!topic) topic = safeFilename(srcBase).replace(/\.pdf$/i, "");
  return safeFilename(`Sciovirtual-Day${day}-HW-${topic}`);
}

/** Read the current Homework page and infer the next day / homework number. */
function scanPage(html) {
  const days = [...html.matchAll(/<span class="badge">Day\s+(\d+)<\/span>/g)].map((m) => Number(m[1]));
  const count = (html.match(/class="hw-item"/g) || []).length;
  const usedDays = new Set(days);
  return {
    nextDay: days.length ? Math.max(...days) + 1 : 1,
    nextHw: count + 1,
    usedDays,
  };
}

async function isPdf(path) {
  try {
    const fh = await open(path, "r");
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    await fh.close();
    return buf.toString("latin1") === "%PDF-";
  } catch { return false; }
}

async function collectInteractive(rl, page, pdfFromFlag) {
  const ask = async (q, def) => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def || "";
  };

  let pdf = pdfFromFlag || "";
  while (!pdf) pdf = await ask("  Path to the homework PDF");
  const day = await ask("  Which day number is this homework for?", String(page.nextDay));
  const title = await ask("  Title (shown as the heading)", `Homework #${page.nextHw}`);
  const desc = await ask("  One-line description (optional)", DEFAULT_DESC);
  let formUrl = "";
  while (!formUrl) formUrl = await ask("  Submission form URL");
  const pdfName = await ask("  Stored filename (optional)", defaultPdfName(day, title, basename(expandHome(pdf))));

  return { pdf, day, title, desc, formUrl, pdfName };
}

function fieldsFromJson(p) {
  const day = String(p.day ?? "").trim();
  const title = p.title || "";
  return {
    pdf: p.pdf || "",
    day,
    title,
    desc: p.desc || DEFAULT_DESC,
    formUrl: p.formUrl || "",
    pdfName: p.pdfName || "",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const FORCE = args.includes("--force");
  const DRY = args.includes("--dry");
  const pdfFlag = flag("--pdf");
  const jsonPath = flag("--json");

  if (!existsSync(PAGE_PATH)) throw new Error(`Homework page not found at ${PAGE_PATH}`);
  const pageHtml = await readFile(PAGE_PATH, "utf8");
  if (!pageHtml.includes(ANCHOR)) {
    throw new Error(
      "The homework page is missing its insertion anchor. Add this line just before\n" +
      "     the closing </div> of <div class=\"hw-list\"> in course-information/homework.html:\n\n" +
      `       ${ANCHOR}`
    );
  }
  const page = scanPage(pageHtml);

  // ---- gather fields ----
  let f;
  if (jsonPath) {
    f = fieldsFromJson(JSON.parse(await readFile(resolve(jsonPath), "utf8")));
    if (pdfFlag) f.pdf = pdfFlag;
    if (!f.day) f.day = String(page.nextDay);
    if (!f.title) f.title = `Homework #${page.nextHw}`;
    if (!f.pdfName) f.pdfName = defaultPdfName(f.day, f.title, basename(expandHome(f.pdf || "hw")));
  } else {
    const rl = createInterface({ input, output });
    try { f = await collectInteractive(rl, page, pdfFlag); }
    finally { rl.close(); }
  }

  // ---- validate ----
  const daySafe = String(f.day).replace(/[^0-9]/g, "");
  if (!daySafe) throw new Error(`Day must be a number, got "${f.day}".`);
  if (!f.pdf) throw new Error("No PDF path was provided.");
  if (!f.formUrl) throw new Error("No submission form URL was provided.");
  if (!/^https?:\/\//i.test(f.formUrl))
    console.log(`  ⚠  Form URL "${f.formUrl}" doesn't look like an http(s) link.`);

  const src = resolve(expandHome(f.pdf));
  if (!existsSync(src) || !statSync(src).isFile()) throw new Error(`PDF not found: ${src}`);
  if (!(await isPdf(src))) {
    const msg = `File does not look like a PDF (no %PDF- header): ${src}`;
    if (!FORCE) throw new Error(msg + "\n     Re-run with --force to copy it anyway.");
    console.log(`  ⚠  ${msg} (continuing because --force)`);
  }

  const fileName = safeFilename(f.pdfName || defaultPdfName(daySafe, f.title, basename(src)));
  const destPath = join(HW_DIR, fileName);
  const href = encodeURI(`${HW_URL_BASE}/${fileName}`);
  const dayLabel = `Day ${daySafe}`;

  if (existsSync(destPath) && !FORCE)
    throw new Error(`assets/hw/${fileName} already exists. Choose another name or re-run with --force.`);
  if (page.usedDays.has(Number(daySafe)) && !FORCE)
    console.log(`  ⚠  ${dayLabel} already has a homework block; adding another. (--force silences this.)`);

  // ---- build the block ----
  const tpl = await readFile(TPL_PATH, "utf8");
  const block = fill(tpl, {
    DAYLABEL: esc(dayLabel),
    TITLE: esc(f.title),
    DESC: esc(f.desc),
    PDF_HREF: href,
    FORM_URL: esc(f.formUrl),
  }).trimEnd();

  // indent to match the sentinel's own indentation, then insert above it
  const idx = pageHtml.indexOf(ANCHOR);
  const lineStart = pageHtml.lastIndexOf("\n", idx) + 1;
  const indent = pageHtml.slice(lineStart, idx);
  const injected = indentBlock(block, indent) + "\n\n" + indent + ANCHOR;
  // splice from the START of the anchor's line, so the block's own indentation
  // isn't added on top of the indentation already sitting before the anchor.
  const nextHtml = pageHtml.slice(0, lineStart) + injected + pageHtml.slice(idx + ANCHOR.length);

  if (DRY) {
    console.log("\n  --- DRY RUN (nothing written) ---\n");
    console.log(indentBlock(block, indent));
    console.log(`\n  Would copy   ${src}\n            →  assets/hw/${fileName}`);
    console.log(`  Would link   Homework › ${f.title}\n`);
    return;
  }

  // ---- write (PDF first, then page atomically) ----
  await mkdir(HW_DIR, { recursive: true });
  await copyFile(src, destPath);

  const tmp = PAGE_PATH + ".tmp";
  await writeFile(tmp, nextHtml, "utf8");
  await rename(tmp, PAGE_PATH);

  console.log(`\n  ✓ Copied   ${src}`);
  console.log(`           → assets/hw/${fileName}`);
  console.log(`  ✓ Added    ${dayLabel} · ${f.title}  →  course-information/homework.html`);
  console.log(`\n  Preview:   http://localhost:8000/course-information/homework.html`);
  console.log(`  (run  npm start  to serve locally, then commit + push)\n`);
}

main().catch((e) => { console.error("\n  ✗ " + e.message + "\n"); process.exit(1); });
