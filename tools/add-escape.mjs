#!/usr/bin/env node
/* =========================================================================
   add-escape.mjs: scaffold a new escape game — its home page, its finish page,
   a committed (non-secret) escape.config.json, and a nav card under a Day — so
   that add:escape-round can start appending rooms.

   Interactive:   node tools/add-escape.mjs
   From a file:   node tools/add-escape.mjs --json path/to/escape.json

   What it builds
     <base>/index.html          home: rules + team form + a password gate
     <base>/finish/index.html   finish: the terminal page
     <base>/escape.config.json  structure the round tool reads (NO passwords in it)
     nav card under Daily Questions › Day N  → the home page

   The head-and-tail structure starts as  home → finish : entering the team
   password on the home page unlocks the finish page. add:escape-round splices
   rooms in between, at the tail, so it becomes  home → r1 → r2 → … → finish.

   Passwords are never stored. The home page ships the finish link ENCRYPTED
   under the team password (from the registration form's confirmation message);
   escape.js decrypts it in the browser only when a team types the right one.

   Unlike the relay, an escape room never gates on "solve N of M": on every
   round page the password box and the submission form stay ALWAYS visible,
   because a team can crack the puzzle and type the password at any time.
   ========================================================================= */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readNav, writeNav, insertUnderPath, ensureGroup, slugify } from "./navlib.mjs";
import { enc } from "./relaycrypto.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NAV_PATH = join(ROOT, "assets/js/nav.js");
const HOME_TPL = join(ROOT, "tools/templates/escape-home.html");
const FINISH_TPL = join(ROOT, "tools/templates/escape-finish.html");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ""));
const jsonInline = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const indent = (html, n) => String(html).trim().split("\n").map((l) => " ".repeat(n) + l).join("\n");
const daySafeOf = (d) => String(d).replace(/[^A-Za-z0-9]/g, "") || "1";
const dayHubExists = (daySafe) => existsSync(join(ROOT, `daily-questions/day-${daySafe}`, "index.html"));

/** Ensure a Google Form URL is in its embeddable form. */
function formEmbedSrc(url) {
  const u = String(url || "").trim();
  if (/\/viewform/.test(u) && !/[?&]embedded=true/.test(u)) {
    return u + (u.includes("?") ? "&" : "?") + "embedded=true";
  }
  return u;
}

const DEFAULT_INTRO = `<h2>How the escape works</h2>
<ul>
  <li>You're in a team of up to six. Work together on one screen.</li>
  <li>The escape runs as a chain of rooms. Each room holds a set of ciphers — clues you piece together to crack that room's <b>password</b>.</li>
  <li>The password box and the submission form are always open. Solve the puzzle however you like, submit your answers on the form, then type the password to unlock the door to the next room.</li>
  <li>More solves means more points, and the first teams to escape earn a time bonus.</li>
</ul>`;

const DEFAULT_FINISH_BODY = `<h2>You're out!</h2>
<p>Every room is behind you — great teamwork. Sit tight while scores come in.</p>`;

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
  const askRequired = async (q) => {
    let a = "";
    while (!a) { a = (await rl.question(`${q}: `)).trim(); if (!a) console.log("  ↳ required, please enter a value."); }
    return a;
  };

  console.log("\n  New escape game\n  ──────────────");
  const title = await ask("  Escape title", "Cipher Escape Room");
  const slug = slugify(await ask("  URL slug (folder name)", slugify(title)));
  const day = daySafeOf(await ask("  Which day number does the escape card live under?", "1"));

  // Day-level overview card — only asked when the day is brand new, so adding an
  // escape to an existing day never re-prompts or clobbers its card.
  let dayKicker = "", dayDesc = "";
  if (!dayHubExists(day)) {
    console.log(`\n  Day ${day} is new — set its card on the Daily Questions overview:`);
    dayKicker = await ask("    Day card kicker", `Day ${day} · Escape`);
    dayDesc = await ask("    Day card description (optional)", "");
  }

  const base = (await ask("  Folder for the escape (relative to site root)", `daily-questions/day-${day}/${slug}`));

  console.log("\n  Nav card (how the escape shows up under that day):");
  const kicker = await ask("    Card kicker", "Escape · Room");
  const desc = await ask("    Card description", "A team escape: crack each room's puzzle to unlock the next.");

  console.log("\n  Team registration (step 1 on the home page):");
  const teamFormUrl = await askRequired("    Team-registration Google Form URL (the full …/viewform link)");
  const teamCode = await askRequired("    Team password (the password shown on that form's confirmation screen)");

  console.log("\n  Content (press enter to use sensible defaults):");
  const introFile = await ask("    Path to an HTML file with the rules/intro (blank = default)", "");
  const finishTitle = await ask("    Finish page title", "You escaped!");
  const finishFile = await ask("    Path to an HTML file for the finish message (blank = default)", "");

  const intro = introFile ? (await readFile(resolve(introFile), "utf8")) : DEFAULT_INTRO;
  const finishBody = finishFile ? (await readFile(resolve(finishFile), "utf8")) : DEFAULT_FINISH_BODY;

  return { title, slug, day, base, kicker, desc, dayKicker, dayDesc, teamFormUrl, teamCode, intro, finishTitle, finishBody };
}

async function fromJson(p) {
  const j = JSON.parse(await readFile(p, "utf8"));
  if (!j.teamFormUrl) throw new Error("escape JSON needs a teamFormUrl.");
  if (!j.teamCode) throw new Error("escape JSON needs a teamCode.");
  const title = j.title || "Cipher Escape Room";
  const slug = slugify(j.slug || title);
  const day = daySafeOf(j.day || "1");
  const base = j.base || `daily-questions/day-${day}/${slug}`;
  const intro = j.introFile ? await readFile(resolve(j.introFile), "utf8") : (j.introHtml || DEFAULT_INTRO);
  const finishBody = j.finishFile ? await readFile(resolve(j.finishFile), "utf8") : (j.finishHtml || DEFAULT_FINISH_BODY);
  return {
    title, slug, day, base,
    kicker: j.kicker || "Escape · Room",
    desc: j.desc || "A team escape: crack each room's puzzle to unlock the next.",
    dayKicker: j.dayKicker || "", dayDesc: j.dayDesc || "",
    teamFormUrl: j.teamFormUrl, teamCode: j.teamCode, intro,
    finishTitle: j.finishTitle || "You escaped!", finishBody,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf("--json");
  let f;
  if (jsonIdx >= 0) {
    f = await fromJson(args[jsonIdx + 1]);
  } else {
    const rl = createInterface({ input, output });
    try { f = await collectInteractive(rl); } finally { rl.close(); }
  }

  // ---- resolve paths (sanitize each folder segment against path escapes) ----
  const base = f.base.split("/").map(slugify).filter(Boolean).join("/");
  if (!base) throw new Error("Could not derive a valid folder from the escape slug.");
  const daySafe = daySafeOf(f.day);
  const dayLabel = `Day ${daySafe}`;
  const dayHref = `/daily-questions/day-${daySafe}/`;

  const homeRel = `${base}/index.html`;
  const homeHref = `/${base}/`;
  const finishRel = `${base}/finish/index.html`;
  const finishHref = `/${base}/finish/`;
  const configRel = `${base}/escape.config.json`;

  // ---- home page: gate ships the finish link encrypted under the team password ----
  const homeCrumbs = `<a href="/">Home</a> / <a href="/daily-questions/">Daily Questions</a> / <a href="${dayHref}">${esc(dayLabel)}</a> / ${esc(f.title)}`;
  const homeCfg = { role: "home", title: f.title, teamFormUrl: f.teamFormUrl, gate: { enc: enc(finishHref, f.teamCode) } };
  const homeHtml = fill(await readFile(HOME_TPL, "utf8"), {
    TITLE: esc(f.title), DESC: esc(f.desc), CRUMBS: homeCrumbs,
    HEADING: esc(f.title),
    LEAD: esc("Register your team, then enter your password to open Room 1. Crack each room's puzzle to unlock the next."),
    INTRO: indent(f.intro, 10),
    TEAM_FORM_SRC: esc(formEmbedSrc(f.teamFormUrl)),
    CONFIG_JSON: jsonInline(homeCfg),
  });

  // ---- finish page ----
  const finishCrumbs = `<a href="/">Home</a> / <a href="${homeHref}">${esc(f.title)}</a> / Finish`;
  const finishCfg = { role: "finish", title: f.finishTitle };
  const finishHtml = fill(await readFile(FINISH_TPL, "utf8"), {
    TITLE: esc(f.finishTitle), DESC: esc("The end of the escape."), CRUMBS: finishCrumbs,
    HEADING: esc(f.finishTitle),
    LEAD: esc("You made it out of every room."),
    BODY: indent(f.finishBody, 10),
    CONFIG_JSON: jsonInline(finishCfg),
  });

  // ---- committed, non-secret structure for the round tool ----
  const config = {
    title: f.title,
    base: `/${base}`,
    homePath: homeHref,
    finishPath: finishHref,
    teamFormUrl: f.teamFormUrl,
    rounds: [],
  };

  // ---- write files ----
  const homeAbs = join(ROOT, homeRel);
  const finishAbs = join(ROOT, finishRel);
  if (existsSync(homeAbs)) throw new Error(`${homeRel} already exists — pick a different slug/folder, or remove it first.`);
  await mkdir(dirname(finishAbs), { recursive: true });
  await writeFile(homeAbs, homeHtml, "utf8");
  await writeFile(finishAbs, finishHtml, "utf8");
  await writeFile(join(ROOT, configRel), JSON.stringify(config, null, 2) + "\n", "utf8");

  // ---- ensure the day hub exists ----
  const dayIndexPath = join(ROOT, `daily-questions/day-${daySafe}`, "index.html");
  const newDay = !dayHubExists(daySafe);
  if (newDay) await writeFile(dayIndexPath, dayIndexHTML(dayLabel), "utf8");

  // ---- nav card under Daily Questions › Day N ----
  const state = await readNav(NAV_PATH);
  const dayNode = ensureGroup(state.NAV, ["Daily Questions", dayLabel], ["/daily-questions/", dayHref]);

  // Day-level overview card. On a new day, guarantee at least a kicker so the day's
  // card on the Daily Questions overview is never blank; only write fields we have,
  // and never clobber an existing day's card. Keys ordered label, href, kicker, desc, children.
  const newDayKicker = f.dayKicker || (newDay ? `${dayLabel} · Escape` : "");
  if (newDayKicker || f.dayDesc) {
    const children = dayNode.children;
    delete dayNode.children;
    if (newDayKicker) dayNode.kicker = newDayKicker;
    if (f.dayDesc) dayNode.desc = f.dayDesc;
    dayNode.children = children;
  }

  insertUnderPath(
    state.NAV,
    ["Daily Questions", dayLabel],
    { label: f.title, href: homeHref, kicker: f.kicker, desc: f.desc },
    ["/daily-questions/", dayHref],
  );
  await writeNav(NAV_PATH, state);

  // ---- report ----
  console.log(`\n  ✓ Created  ${homeRel}`);
  console.log(`  ✓ Created  ${finishRel}`);
  console.log(`  ✓ Created  ${configRel}  (committed, no passwords inside)`);
  if (newDay) console.log(`  ✓ Created  daily-questions/day-${daySafe}/index.html  (new day hub)`);
  if (newDayKicker || f.dayDesc) console.log(`  ✓ Card     ${dayLabel} overview: "${newDayKicker || dayNode.kicker || ""}"`);
  console.log(`  ✓ Linked   Daily Questions › ${dayLabel} › ${f.title}`);
  console.log(`\n  Structure: home → finish  (add rooms with  npm run add:escape-round)`);
  console.log(`\n  Next steps`);
  console.log(`   • On the registration form, set the confirmation message to reveal the password:  ${f.teamCode}`);
  console.log(`   • Turn OFF "edit after submit" on that form.`);
  console.log(`\n  Preview:   http://localhost:8000${homeHref}`);
  console.log(`  (run  npm start  to serve locally, then commit + push)\n`);
}

main().catch((e) => { console.error("\n  ✗ " + e.message + "\n"); process.exit(1); });
