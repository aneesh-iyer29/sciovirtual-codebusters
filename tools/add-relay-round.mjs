#!/usr/bin/env node
/* =========================================================================
   add-relay-round.mjs: append a round to a relay, spliced in at the tail so
   the chain grows  home → r1 → r2 → … → finish.

   Interactive:   node tools/add-relay-round.mjs
   From a file:   node tools/add-relay-round.mjs --json path/to/round.json

   What it does
     1. finds the relay (its relay.config.json) — auto-selects if there's one.
     2. asks how many ciphers this round has and how many must be solved to
        advance, then collects each cipher just like add:question.
     3. writes the round page at  <base>/rN-<hex>/index.html  with the ciphers,
        the submission form (open-in-new-tab + optional in-page embed), and a
        code gate that only unlocks after enough ciphers are solved.
     4. re-points the current tail (the home page, or the previous round) at
        this new round, and points this round at the finish page.

   Codes are never stored. Each page ships its "next" link ENCRYPTED under the
   code a team gets from a Google Form's confirmation message. To re-point the
   old tail we need its code, so the tool asks for it and verifies it before
   touching anything (it must currently decrypt the tail's gate to the finish
   page — the invariant that always holds before an insert).
   ========================================================================= */
import { readFile, writeFile, mkdir, readdir, copyFile, open } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { enc, dec } from "./relaycrypto.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TPL_PATH = join(ROOT, "tools/templates/relay-round.html");

const CIPHERS = [
  "Aristocrat", "Patristocrat", "Xenocrypt", "Affine", "Caesar", "Atbash",
  "Vigenere", "Hill", "Porta", "Baconian", "Nihilist", "Checkerboard", "Fractionated Morse",
  "Homophonic", "Cryptarithm",
];
const ARISTO = new Set(["Aristocrat", "Patristocrat", "Xenocrypt"]);
const IMAGE_TYPES = new Set(["Cryptarithm"]);
const CRYPT_IMG_DIR = "assets/img/cryptarithms";
const DEFAULT_LEAD = "Solve the ciphers, submit your passwords, then enter your code to move on.";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ""));
const jsonInline = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const packQuestion = (q) => Buffer.from(JSON.stringify(q), "utf8").toString("base64");
const pageFile = (href) => join(ROOT, href.replace(/^\/+/, "").replace(/\/+$/, ""), "index.html");

const CFG_RE = /(<script id="relay-config" type="application\/json">)([\s\S]*?)(<\/script>)/;

function formEmbedSrc(url) {
  const u = String(url || "").trim();
  if (/\/viewform/.test(u) && !/[?&]embedded=true/.test(u)) {
    return u + (u.includes("?") ? "&" : "?") + "embedded=true";
  }
  return u;
}

/* --- image-backed ciphers (Cryptarithm): mirrors tools/add-question.mjs --- */
const expandHome = (p) => (p && p.startsWith("~/") ? join(homedir(), p.slice(2)) : p);

/** Identify an image by its bytes (not its extension). png|jpg|gif|webp|svg|null. */
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

/** Walk the repo for relay.config.json files (skips node_modules, .git, dotfiles). */
async function findRelays(dir = ROOT, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await findRelays(full, out);
    else if (e.name === "relay.config.json") {
      try { out.push({ path: full, config: JSON.parse(await readFile(full, "utf8")) }); } catch { /* skip bad */ }
    }
  }
  return out;
}

async function collectCipher(ask, idx, total) {
  console.log(`\n  ── Cipher ${idx + 1} of ${total} ──`);
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
  data.revealKeyword = await ask("  Password revealed when it's solved");
  // Cryptarithm (image-backed): the puzzle picture shown above the ciphertext.
  // Stored as a raw path here; copied into assets and rewritten to a web path in main().
  if (IMAGE_TYPES.has(cipherType)) {
    let img = "";
    while (!img) img = await ask("  Image path (the cryptarithm picture, copied into assets)");
    data.image = img;
    data.imageAlt = await ask("  Image alt text (optional)", "Cryptarithm to solve");
  }
  return data;
}

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

async function pickRelay(configs, wanted) {
  if (wanted) {
    const hit = configs.find((c) => c.config.base === wanted || c.config.base === `/${wanted}` || c.path.includes(wanted));
    if (!hit) throw new Error(`No relay matched "${wanted}".`);
    return hit;
  }
  if (configs.length === 1) return configs[0];
  return null; // caller must prompt (interactive) or error (json)
}

async function collectInteractive(rl, configs) {
  const ask = async (q, def) => {
    const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
    return a || def || "";
  };
  const askRequired = async (q) => {
    let a = "";
    while (!a) { a = (await rl.question(`${q}: `)).trim(); if (!a) console.log("  ↳ required, please enter a value."); }
    return a;
  };

  let chosen = await pickRelay(configs);
  if (!chosen) {
    console.log("\n  Which relay?");
    configs.forEach((c, i) => console.log(`   ${i + 1}. ${c.config.title}  (${c.config.base})`));
    const pick = await ask("  Choose", "1");
    chosen = configs[Number(pick) - 1] || configs[0];
  }
  const config = chosen.config;
  const nextNum = (config.rounds ? config.rounds.length : 0) + 1;
  console.log(`\n  Relay: ${config.title} — adding Round ${nextNum}`);

  const count = Math.max(1, parseInt(await ask("\n  How many ciphers in this round?", "4"), 10) || 4);
  const needed = Math.max(1, Math.min(
    parseInt(await ask("  How many must be solved to advance?", String(Math.max(1, count - 1))), 10) || Math.max(1, count - 1),
    count,
  ));

  const questions = [];
  for (let i = 0; i < count; i++) questions.push(await collectCipher(ask, i, count));

  console.log("\n  Submission form (shown after the ciphers):");
  const formUrl = await askRequired("    This round's Google Form URL (the full …/viewform link)");
  const formEmbed = /^y/i.test(await ask("    Embed the form in the page too? (y = embed + new-tab button, n = new-tab button only)", "y"));
  const code = await askRequired("    This round's code (shown on THIS form's confirmation screen)");

  const isFirst = !config.rounds || config.rounds.length === 0;
  console.log("\n  Link the previous page to this round:");
  const prevLabel = isFirst
    ? "    Team code from the registration form (points the start page at this round)"
    : `    Code for Round ${config.rounds.length} (points it at this round)`;
  const prevCode = await askRequired(prevLabel);

  return { chosen, config, count, needed, questions, formUrl, formEmbed, code, prevCode, lead: DEFAULT_LEAD };
}

async function fromJson(p, configs) {
  const j = JSON.parse(await readFile(p, "utf8"));
  const chosen = await pickRelay(configs, j.relay);
  if (!chosen) throw new Error('Multiple relays found — set "relay": "<base>" in the JSON to pick one.');
  if (!Array.isArray(j.questions) || !j.questions.length) throw new Error("round JSON needs a non-empty questions array.");
  if (!j.formUrl) throw new Error("round JSON needs formUrl.");
  if (!j.code) throw new Error("round JSON needs code (this round's form code).");
  if (!j.prevCode) throw new Error("round JSON needs prevCode (the current tail's code).");
  const count = j.questions.length;
  return {
    chosen, config: chosen.config, count,
    needed: Math.max(1, Math.min(parseInt(j.needed, 10) || Math.max(1, count - 1), count)),
    questions: j.questions.map(normalizeQ),
    formUrl: j.formUrl,
    formEmbed: j.formEmbed !== false,
    code: j.code, prevCode: j.prevCode,
    lead: j.lead || DEFAULT_LEAD,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf("--json");

  const configs = await findRelays();
  if (!configs.length) throw new Error("No relay found — run `npm run add:relay` first.");

  let f;
  if (jsonIdx >= 0) {
    f = await fromJson(args[jsonIdx + 1], configs);
  } else {
    const rl = createInterface({ input, output });
    try { f = await collectInteractive(rl, configs); } finally { rl.close(); }
  }

  const { chosen, config } = f;
  config.rounds = config.rounds || [];
  const num = config.rounds.length + 1;
  const isFirst = num === 1;
  const tailHref = isFirst ? config.homePath : config.rounds[config.rounds.length - 1].path;
  const tailFile = pageFile(tailHref);
  const tailKind = isFirst ? "start page" : `Round ${config.rounds.length}`;

  // ---- verify the previous code BEFORE writing anything (don't corrupt the chain) ----
  if (!existsSync(tailFile)) throw new Error(`Can't find the ${tailKind} at ${relative(ROOT, tailFile)}.`);
  const tailHtml = await readFile(tailFile, "utf8");
  const tailMatch = tailHtml.match(CFG_RE);
  if (!tailMatch) throw new Error(`No relay-config found in the ${tailKind}.`);
  const tailCfg = JSON.parse(tailMatch[2]);
  const currentTarget = tailCfg.gate && tailCfg.gate.enc ? dec(tailCfg.gate.enc, f.prevCode) : null;
  if (currentTarget !== config.finishPath) {
    throw new Error(
      `That code doesn't unlock the current ${tailKind}. Right now its gate should decrypt to the finish page` +
      ` (${config.finishPath}); with the code you gave it decrypts to ${currentTarget === null ? "nothing" : `"${currentTarget}"`}.` +
      `\n  Re-check the code you set on ${isFirst ? "the registration form" : `Round ${config.rounds.length}'s form`}.`,
    );
  }

  // ---- build this round ----
  const slug = `r${num}-${randomBytes(3).toString("hex")}`;
  const roundHref = `${config.base}/${slug}/`;
  const roundAbs = pageFile(roundHref);
  if (existsSync(roundAbs)) throw new Error(`${relative(ROOT, roundAbs)} already exists — rerun to get a fresh slug.`);

  // Copy any image-backed ciphers' pictures into assets and point them at the web path.
  let imgCount = 0;
  for (let i = 0; i < f.questions.length; i++) {
    const q = f.questions[i];
    if (IMAGE_TYPES.has(q.cipherType) && !q.image) throw new Error(`Cipher ${i + 1} (${q.cipherType}) needs an image.`);
    if (q.image) { q.image = await copyImage(q.image, `${slug}-q${i + 1}`); imgCount++; }
  }

  const roundCfg = {
    role: "round",
    num,
    needed: f.needed,
    questions: f.questions.map(packQuestion),
    gate: { enc: enc(config.finishPath, f.code) },
  };

  const formSrc = formEmbedSrc(f.formUrl);
  const formEmbedHtml = f.formEmbed
    ? `          <div class="embed relay-form">\n` +
      `            <iframe src="${esc(formSrc)}" title="Round ${num} submission form" loading="lazy">Loading…</iframe>\n` +
      `          </div>`
    : "";

  const crumbs = `<a href="/">Home</a> / <a href="${config.homePath}">${esc(config.title)}</a> / Round ${num}`;
  const html = fill(await readFile(TPL_PATH, "utf8"), {
    TITLE: `Round ${num}`, DESC: esc(`Round ${num} of ${config.title}.`), CRUMBS: crumbs,
    HEADING: `Round ${num}`, LEAD: esc(f.lead),
    FORM_URL: esc(f.formUrl), FORM_EMBED: formEmbedHtml,
    CONFIG_JSON: jsonInline(roundCfg),
  });

  await mkdir(dirname(roundAbs), { recursive: true });
  await writeFile(roundAbs, html, "utf8");

  // ---- re-point the old tail at this round ----
  tailCfg.gate.enc = enc(roundHref, f.prevCode);
  const newTailHtml = tailHtml.slice(0, tailMatch.index) + tailMatch[1] + jsonInline(tailCfg) + tailMatch[3] +
    tailHtml.slice(tailMatch.index + tailMatch[0].length);
  await writeFile(tailFile, newTailHtml, "utf8");

  // ---- record structure (no codes) ----
  config.rounds.push({ num, slug, path: roundHref, needed: f.needed, formUrl: f.formUrl });
  await writeFile(chosen.path, JSON.stringify(config, null, 2) + "\n", "utf8");

  // ---- report ----
  const chain = ["home", ...config.rounds.map((r) => "r" + r.num), "finish"].join(" → ");
  console.log(`\n  ✓ Created  ${relative(ROOT, roundAbs)}  (Round ${num}: ${f.count} ciphers, need ${f.needed})`);
  if (imgCount) console.log(`  ✓ Images   copied ${imgCount} into ${CRYPT_IMG_DIR}/`);
  console.log(`  ✓ Linked   ${tailKind} → Round ${num} → finish`);
  console.log(`  ✓ Updated  ${relative(ROOT, chosen.path)}`);
  console.log(`\n  Chain:     ${chain}`);
  console.log(`\n  On Round ${num}'s Google Form:`);
  console.log(`   • set the confirmation message to reveal the code:  ${f.code}`);
  console.log(`   • make it a quiz (1 pt per password) and turn OFF "edit after submit".`);
  console.log(`\n  Preview:   http://localhost:8000${roundHref}`);
  console.log(`  (run  npm start  to serve locally, then commit + push)\n`);
}

main().catch((e) => { console.error("\n  ✗ " + e.message + "\n"); process.exit(1); });
