#!/usr/bin/env node
/* =========================================================================
   add-question.mjs: create an interactive cipher question page and wire it
   into the navigation, without touching HTML by hand.

   Interactive:   node tools/add-question.mjs
   From a file:   node tools/add-question.mjs --json path/to/question.json

   The JSON (or your typed answers) supply the cipher data. Everything else
   (the page, the crumbs, the nav entry, and the day hub) is generated for you.
   ========================================================================= */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readNav, writeNav, insertUnderPath, slugify, titleCase } from "./navlib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NAV_PATH = join(ROOT, "assets/js/nav.js");
const TPL_PATH = join(ROOT, "tools/templates/question.html");

const CIPHERS = [
  "Aristocrat", "Patristocrat", "Xenocrypt", "Affine", "Caesar", "Atbash",
  "Vigenere", "Hill", "Porta", "Baconian", "Nihilist", "Checkerboard", "Fractionated Morse",
  "Homophonic",
];
const ARISTO = new Set(["Aristocrat", "Patristocrat", "Xenocrypt"]);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ""));

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

async function collectInteractive(rl) {
  const ask = async (q, def) => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def || "";
  };

  console.log("\n  Cipher types:");
  CIPHERS.forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}. ${c}`));
  let cipherType = "";
  while (!cipherType) {
    const pick = await ask("\n  Choose a cipher (number or name)", "1");
    const byNum = CIPHERS[Number(pick) - 1];
    cipherType = byNum || CIPHERS.find((c) => c.toLowerCase() === pick.toLowerCase()) || "";
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
  data.revealKeyword = await ask("  Reveal keyword (shown when solved)");

  const dayNum = await ask("  Which day number does this belong to?", "1");
  const title = await ask("  Short title for this question", `${cipherType} question`);
  const slug = slugify(await ask("  URL slug", slugify(title)));
  const lead = await ask("  One-line intro (optional)", "Type your answer under each cipher letter, then check it.");
  const kicker = await ask("  Nav kicker label (optional)", cipherType);

  return { data, dayNum, title, slug, lead, kicker };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf("--json");
  let fields;

  if (jsonIdx >= 0) {
    const payload = JSON.parse(await readFile(args[jsonIdx + 1], "utf8"));
    const { cipherType, aristoType, questionText, cipherText, correctAnswer, revealKeyword,
            day = "1", title, slug, lead, kicker } = payload;
    const data = { cipherType };
    if (ARISTO.has(cipherType) && aristoType) data.aristoType = aristoType;
    Object.assign(data, { questionText, cipherText, correctAnswer, revealKeyword });
    const t = title || `${cipherType} question`;
    fields = { data, dayNum: String(day), title: t, slug: slugify(slug || t),
               lead: lead || "Type your answer under each cipher letter, then check it.", kicker: kicker || cipherType };
  } else {
    const rl = createInterface({ input, output });
    try { fields = await collectInteractive(rl); }
    finally { rl.close(); }
  }

  const { data, dayNum, title, slug, lead, kicker } = fields;
  const daySafe = String(dayNum).replace(/[^A-Za-z0-9]/g, "") || "1"; // no path traversal / injection
  const dayLabel = `Day ${daySafe}`;
  const dayDir = `daily-questions/day-${daySafe}`;
  const dayHref = `/${dayDir}/`;
  const relPath = `${dayDir}/${slug}.html`;
  const href = `/${relPath}`;
  const absPath = join(ROOT, relPath);

  // build the question page
  const tpl = await readFile(TPL_PATH, "utf8");
  const crumbs = `<a href="/">Home</a> / <a href="${dayHref}">${esc(dayLabel)}</a> / ${esc(title)}`;
  // Escape "<" so a value containing "</script>" can't break out of the inline script.
  const dataJson = JSON.stringify(data, null, 2).replace(/</g, "\\u003c").replace(/\n/g, "\n    ");
  const html = fill(tpl, {
    TITLE: esc(title), DESC: esc(lead), CRUMBS: crumbs,
    HEADING: esc(title), LEAD: esc(lead), DATA_JSON: dataJson,
  });

  await mkdir(dirname(absPath), { recursive: true });
  if (existsSync(absPath)) {
    console.log(`\n  ⚠  ${relPath} already exists, overwriting.`);
  }
  await writeFile(absPath, html, "utf8");

  // ensure a day hub exists
  const dayIndexPath = join(ROOT, dayDir, "index.html");
  const newDay = !existsSync(dayIndexPath);
  if (newDay) await writeFile(dayIndexPath, dayIndexHTML(dayLabel), "utf8");

  // wire into navigation
  const state = await readNav(NAV_PATH);
  insertUnderPath(
    state.NAV,
    ["Daily Questions", dayLabel],
    { label: title, href, kicker, desc: lead },
    ["/daily-questions/", dayHref],
  );
  await writeNav(NAV_PATH, state);

  console.log(`\n  ✓ Created  ${relPath}`);
  if (newDay) console.log(`  ✓ Created  ${dayDir}/index.html  (new day hub)`);
  console.log(`  ✓ Linked   Daily Questions › ${dayLabel} › ${title}`);
  console.log(`\n  Preview:   http://localhost:8000${href}`);
  console.log(`  (run  npm start  to serve locally, then commit + push)\n`);
}

main().catch((e) => { console.error("\n  ✗ " + e.message + "\n"); process.exit(1); });
