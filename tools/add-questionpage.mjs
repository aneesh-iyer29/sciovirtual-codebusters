#!/usr/bin/env node
/* =========================================================================
   add-questionpage.mjs: create ONE page that holds several cipher questions,
   a live progress bar (Solved X / N), and a single global keyword that stays
   hidden until enough of the ciphers are solved — then wire it into the nav.

   Interactive:   node tools/add-questionpage.mjs
   From a file:   node tools/add-questionpage.mjs --json path/to/page.json

   It's the sibling of add-question.mjs: same per-cipher prompts (run once per
   question), but instead of one cipher per page it collects several, asks how
   many must be solved, and asks for the keyword to reveal at that threshold.
   The page/crumbs/nav/day-hub wiring is identical to add-question.mjs.
   ========================================================================= */
import { readFile, writeFile, copyFile, mkdir, open } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readNav, writeNav, insertUnderPath, ensureGroup, slugify } from "./navlib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NAV_PATH = join(ROOT, "assets/js/nav.js");
const TPL_PATH = join(ROOT, "tools/templates/questionpage.html");
const CRYPT_IMG_DIR = "assets/img/cryptarithms";

const CIPHERS = [
  "Aristocrat", "Patristocrat", "Xenocrypt", "Affine", "Caesar", "Atbash",
  "Vigenere", "Hill", "Porta", "Baconian", "Nihilist", "Checkerboard", "Fractionated Morse",
  "Homophonic", "Cryptarithm",
];
const ARISTO = new Set(["Aristocrat", "Patristocrat", "Xenocrypt"]);
const IMAGE_TYPES = new Set(["Cryptarithm"]);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ""));
const daySafeOf = (d) => String(d).replace(/[^A-Za-z0-9]/g, "") || "1"; // no path traversal / injection
const dayHubExists = (daySafe) => existsSync(join(ROOT, `daily-questions/day-${daySafe}`, "index.html"));
const expandHome = (p) => (p && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

// Answers/keyword are stored base64(UTF-8) so they aren't sitting in plain text
// in the page source (mirror of questionpage.js's decode; casual view-source only).
const packQuestion = (q) => Buffer.from(JSON.stringify(q), "utf8").toString("base64");
const packKeyword = (s) => Buffer.from(String(s), "utf8").toString("base64");
// Inline JSON into a <script> block, escaping "<" so a value can't break out.
const jsonInline = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

/* --- image-backed ciphers (Cryptarithm): mirrors tools/add-question.mjs --- */
async function imageKind(path) {
  try {
    const fh = await open(path, "r");
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(buf, 0, 1024, 0);
    await fh.close();
    const b = buf.slice(0, bytesRead);
    if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
    if (b.slice(0, 4).toString("latin1") === "GIF8") return "gif";
    if (b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP") return "webp";
    if (b.toString("latin1").toLowerCase().includes("<svg")) return "svg";
    return null;
  } catch { return null; }
}

/** Copy a cipher's image into assets/img/cryptarithms/<name>.<ext>; return its site URL. */
async function copyImage(srcRaw, name) {
  const src = resolve(expandHome(srcRaw));
  if (!existsSync(src) || !statSync(src).isFile()) throw new Error(`Image not found: ${src}`);
  const kind = await imageKind(src);
  if (!kind) throw new Error(`Not a recognized image (png/jpg/gif/webp/svg): ${src}`);
  const rel = `${CRYPT_IMG_DIR}/${name}${kind === "jpg" ? ".jpg" : "." + kind}`;
  await mkdir(join(ROOT, CRYPT_IMG_DIR), { recursive: true });
  await copyFile(src, join(ROOT, rel));
  return `/${rel}`;
}

function dayIndexHTML(label) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(label)} · Daily Questions · ScioVirtual Codebusters</title>
  <meta name="description" content="Interactive Codebusters questions for ${esc(label)}.">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Lato:wght@400;700&family=Space+Mono:wght@400;700&display=swap">
  <link rel="stylesheet" href="/assets/css/base.css">
  <script type="module" src="/assets/js/site.js"></script>
</head>
<body>
  <main id="main">
    <header class="page-head">
      <div class="wrap">
        <p class="crumbs"><a href="/">Home</a> / <a href="/daily-questions/">Daily Questions</a> / ${esc(label)}</p>
        <h1>${esc(label)}</h1>
        <p class="lead">Work through ${esc(label)}'s questions below; each one checks live and reveals a keyword when you solve it.</p>
      </div>
    </header>
    <section class="section"><div class="wrap"><div data-day-list></div></div></section>
  </main>
</body>
</html>
`;
}

/* --- collect one cipher (same prompts as add-question / add-relay-round) --- */
async function collectQuestion(ask, idx, total) {
  console.log(`\n  ── Question ${idx + 1} of ${total} ──`);
  CIPHERS.forEach((c, i) => process.stdout.write(`   ${String(i + 1).padStart(2)}. ${c}` + ((i + 1) % 2 ? "" : "\n")));
  if (CIPHERS.length % 2) process.stdout.write("\n");
  let cipherType = "";
  while (!cipherType) {
    const pick = await ask("  Cipher (number or name)", "Aristocrat");
    cipherType = CIPHERS[Number(pick) - 1] || CIPHERS.find((c) => c.toLowerCase() === pick.toLowerCase()) || "";
    if (!cipherType) console.log("  ↳ not a valid choice, try again.");
  }
  const data = { cipherType };
  if (ARISTO.has(cipherType)) {
    const t = (await ask("  Aristocrat type (K1 / K2 / Normal)", "K1")).toUpperCase();
    data.aristoType = ["K1", "K2"].includes(t) ? t : "Normal";
  }
  data.questionText = await ask("  Question prompt (shown above the grid)");
  data.cipherText = await ask("  Cipher text (exactly as students see it)");
  data.correctAnswer = await ask("  Correct answer (the decoded plaintext)");
  data.revealKeyword = await ask("  Keyword revealed when this one is solved");
  // Cryptarithm (image-backed): raw path here, copied into assets in main().
  if (IMAGE_TYPES.has(cipherType)) {
    let img = "";
    while (!img) img = await ask("  Image path (the cryptarithm picture, copied into assets)");
    data.image = img;
    data.imageAlt = await ask("  Image alt text (optional)", "Cryptarithm to solve");
  }
  return data;
}

/** Normalize one question from JSON (batch mode), same shape as collectQuestion. */
function normalizeQ(q) {
  const data = { cipherType: q.cipherType };
  if (ARISTO.has(q.cipherType) && q.aristoType) data.aristoType = q.aristoType;
  data.questionText = q.questionText || "";
  data.cipherText = q.cipherText || "";
  data.correctAnswer = q.correctAnswer || "";
  data.revealKeyword = q.revealKeyword || "";
  if (IMAGE_TYPES.has(q.cipherType)) {
    if (!q.image) throw new Error(`${q.cipherType} question needs an "image" path.`);
    data.image = q.image;                       // raw path; copied in main()
    data.imageAlt = q.imageAlt || "Cryptarithm to solve";
  }
  return data;
}

async function collectInteractive(rl) {
  const ask = async (q, def) => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def || "";
  };

  const count = Math.max(1, parseInt(await ask("\n  How many questions on this page?", "8"), 10) || 8);
  const questions = [];
  for (let i = 0; i < count; i++) questions.push(await collectQuestion(ask, i, count));

  console.log("");
  const needed = Math.max(1, Math.min(
    parseInt(await ask(`  How many must be solved to reveal the keyword? (1–${count})`, String(count)), 10) || count,
    count,
  ));
  let keyword = "";
  while (!keyword) keyword = await ask("  Global keyword (revealed once the requirement is met)");

  const dayNum = await ask("\n  Which day number does this belong to?", "1");

  // Day-level overview card — only asked when this day is brand new.
  const daySafe = daySafeOf(dayNum);
  let dayKicker = "", dayDesc = "";
  if (!dayHubExists(daySafe)) {
    console.log(`\n  Day ${daySafe} is new — set its card on the Daily Questions overview:`);
    dayKicker = await ask(`    Day card kicker`, `Day ${daySafe} · Practice`);
    dayDesc = await ask(`    Day card description (optional)`, "");
    console.log("");
  }

  const title = await ask("  Short title for this page", `Practice set (${count} questions)`);
  const slug = slugify(await ask("  URL slug", slugify(title)));
  const lead = await ask("  One-line intro (optional)",
    `Solve at least ${needed} of these ${count} to reveal the keyword.`);
  const kicker = await ask("  Nav kicker label (optional)", `${count} questions`);

  return { questions, needed, keyword, dayNum, title, slug, lead, kicker, dayKicker, dayDesc };
}

function fromJson(payload) {
  const { questions, needed, keyword, day = "1", title, slug, lead, kicker, dayKicker, dayDesc } = payload;
  if (!Array.isArray(questions) || !questions.length) throw new Error("page JSON needs a non-empty questions array.");
  const norm = questions.map(normalizeQ);
  const count = norm.length;
  if (!keyword) throw new Error(`page JSON needs a "keyword" to reveal.`);
  const t = title || `Practice set (${count} questions)`;
  return {
    questions: norm,
    needed: Math.max(1, Math.min(parseInt(needed, 10) || count, count)),
    keyword: String(keyword),
    dayNum: String(day),
    title: t,
    slug: slugify(slug || t),
    lead: lead || `Solve at least ${Math.max(1, Math.min(parseInt(needed, 10) || count, count))} of these ${count} to reveal the keyword.`,
    kicker: kicker || `${count} questions`,
    dayKicker: dayKicker || "",
    dayDesc: dayDesc || "",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf("--json");
  let fields;

  if (jsonIdx >= 0) {
    fields = fromJson(JSON.parse(await readFile(args[jsonIdx + 1], "utf8")));
  } else {
    const rl = createInterface({ input, output });
    try { fields = await collectInteractive(rl); }
    finally { rl.close(); }
  }

  const { questions, needed, keyword, dayNum, title, slug, lead, kicker, dayKicker, dayDesc } = fields;
  const daySafe = daySafeOf(dayNum);
  const dayLabel = `Day ${daySafe}`;
  const dayDir = `daily-questions/day-${daySafe}`;
  const dayHref = `/${dayDir}/`;
  const relPath = `${dayDir}/${slug}.html`;
  const href = `/${relPath}`;
  const absPath = join(ROOT, relPath);

  // Image-backed questions (Cryptarithm): copy each picture into assets and
  // rewrite its data.image to the web path. Names avoid collisions per slug.
  const images = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.image) { q.image = await copyImage(q.image, `${slug}-q${i + 1}`); images.push(q.image); }
  }

  // build the page from the template
  const tpl = await readFile(TPL_PATH, "utf8");
  const crumbs = `<a href="/">Home</a> / <a href="${dayHref}">${esc(dayLabel)}</a> / ${esc(title)}`;
  const config = { questions: questions.map(packQuestion), needed, keyword: packKeyword(keyword) };
  const html = fill(tpl, {
    TITLE: esc(title), DESC: esc(lead), CRUMBS: crumbs,
    HEADING: esc(title), LEAD: esc(lead), CONFIG_JSON: jsonInline(config),
  });

  await mkdir(dirname(absPath), { recursive: true });
  if (existsSync(absPath)) console.log(`\n  ⚠  ${relPath} already exists, overwriting.`);
  await writeFile(absPath, html, "utf8");

  // ensure a day hub exists
  const dayIndexPath = join(ROOT, dayDir, "index.html");
  const newDay = !existsSync(dayIndexPath);
  if (newDay) await writeFile(dayIndexPath, dayIndexHTML(dayLabel), "utf8");

  // wire into navigation (identical to add-question.mjs)
  const state = await readNav(NAV_PATH);
  const dayNode = ensureGroup(state.NAV, ["Daily Questions", dayLabel], ["/daily-questions/", dayHref]);

  const newDayKicker = dayKicker || (newDay ? `${dayLabel} · Practice` : "");
  if (newDayKicker || dayDesc) {
    const children = dayNode.children;
    delete dayNode.children;
    if (newDayKicker) dayNode.kicker = newDayKicker;
    if (dayDesc) dayNode.desc = dayDesc;
    dayNode.children = children;
  }

  insertUnderPath(
    state.NAV,
    ["Daily Questions", dayLabel],
    { label: title, href, kicker, desc: lead },
    ["/daily-questions/", dayHref],
  );
  await writeNav(NAV_PATH, state);

  console.log(`\n  ✓ Created  ${relPath}  (${questions.length} questions, need ${needed} to reveal the keyword)`);
  images.forEach((img) => console.log(`  ✓ Image    ${img}`));
  if (newDay) console.log(`  ✓ Created  ${dayDir}/index.html  (new day hub)`);
  if (newDayKicker || dayDesc) console.log(`  ✓ Card     ${dayLabel} · overview: "${newDayKicker || dayNode.kicker || ""}"`);
  console.log(`  ✓ Linked   Daily Questions › ${dayLabel} › ${title}`);
  console.log(`\n  Preview:   http://localhost:8000${href}`);
  console.log(`  (run  npm start  to serve locally, then commit + push)\n`);
}

main().catch((e) => { console.error("\n  ✗ " + e.message + "\n"); process.exit(1); });
