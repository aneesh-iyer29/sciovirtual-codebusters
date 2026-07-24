#!/usr/bin/env node
/* =========================================================================
   cli.mjs — `scio`: one front door for all the instructor tools.

   TUI menu:     node tools/cli.mjs            (or `npm run cli`, or plain
                 `scio` after a one-time `npm link`)
   Direct:       node tools/cli.mjs <command> [flags]

   Each command wraps one generator in this folder; anything after the
   command name is passed straight through (--json, --dry, --force, --pdf),
   so `scio question --json q.json` ≡ `node tools/add-question.mjs --json q.json`.
   ========================================================================= */
import { spawn } from "node:child_process";
import { emitKeypressEvents } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c("1", s);
const dim = (s) => c("2", s);
const cyan = (s) => c("36", s);
const green = (s) => c("32", s);
const red = (s) => c("31", s);

const COMMANDS = [
  {
    name: "question", aliases: ["q"], script: "add-question.mjs",
    title: "Add a cipher question",
    desc: "Interactive question page + nav link under Daily Questions › Day N",
    flags: ["--json <file>    run from a saved answers file (no prompts)"],
  },
  {
    name: "questionpage", aliases: ["qp"], script: "add-questionpage.mjs",
    title: "Add a multi-question page",
    desc: "One page with several ciphers, a progress bar, and a keyword revealed at a threshold",
    flags: ["--json <file>    run from a saved answers file (no prompts)"],
  },
  {
    name: "page", aliases: [], script: "add-page.mjs",
    title: "Add an embed page",
    desc: "New page from a Google Form / Doc / Slides / video link",
    flags: ["--json <file>    run from a saved answers file (no prompts)"],
  },
  {
    name: "homework", aliases: ["hw"], script: "add-homework.mjs",
    title: "Add a homework assignment",
    desc: "PDF + submission-form card on the Homework page",
    flags: [
      "--json <file>    run from a saved answers file (no prompts)",
      "--pdf <path>     source PDF (overrides the prompt / JSON)",
      "--dry            print what would happen; write nothing",
      "--force          overwrite an existing PDF / reuse a used day",
    ],
  },
  {
    name: "recording", aliases: ["rec"], script: "add-recording.mjs",
    title: "Post slides & a recording",
    desc: "Day N page under Slides & Recordings from two Google links",
    flags: [
      "--json <file>    run from a saved answers file (no prompts)",
      "--dry            print the derived URLs; write nothing",
    ],
  },
  {
    name: "relay", aliases: [], script: "add-relay.mjs",
    title: "Scaffold a relay race",
    desc: "Home + finish pages, config, and a day-hub card (rounds added separately)",
    flags: ["--json <file>    run from a saved answers file (no prompts)"],
  },
  {
    name: "relay-round", aliases: ["round"], script: "add-relay-round.mjs",
    title: "Add a relay round",
    desc: "Splice a round (ciphers + form + code gate) at the tail of a relay",
    flags: ["--json <file>    run from a saved answers file (no prompts)"],
  },
  {
    name: "escape", aliases: [], script: "add-escape.mjs",
    title: "Scaffold an escape game",
    desc: "Home + finish pages, config, and a day-hub card (rooms added separately)",
    flags: ["--json <file>    run from a saved answers file (no prompts)"],
  },
  {
    name: "escape-round", aliases: ["room"], script: "add-escape-round.mjs",
    title: "Add an escape room",
    desc: "Splice a room (ciphers + always-open form + password gate) at the tail of an escape",
    flags: ["--json <file>    run from a saved answers file (no prompts)"],
  },
  {
    name: "serve", aliases: [], run: serve,
    title: "Serve the site",
    desc: "Local preview at http://localhost:8000 (Ctrl-C to stop)",
    flags: ["--port <n>       listen on a different port (default 8000)"],
  },
];

/* ---------------------------------------------------------------- running */

function spawnWait(cmd, argv, opts = {}) {
  return new Promise((res) => {
    const child = spawn(cmd, argv, { stdio: "inherit", cwd: ROOT, ...opts });
    // Let Ctrl-C reach only the child (same process group); the menu survives.
    const onInt = () => {};
    process.on("SIGINT", onInt);
    const done = (r) => { process.removeListener("SIGINT", onInt); res(r); };
    child.on("error", (error) => done({ error }));
    child.on("exit", (code, signal) => done({ code, signal }));
  });
}

async function runCommand(cmd, argv) {
  if (cmd.run) return cmd.run(argv);
  const { code, signal, error } = await spawnWait(process.execPath, [join(__dirname, cmd.script), ...argv]);
  if (error) { console.error(red("  ✗ ") + error.message); return 1; }
  return signal ? 1 : (code ?? 0);
}

async function serve(argv) {
  let port = "8000";
  const i = argv.findIndex((a) => a === "--port" || a === "-p");
  if (i >= 0 && argv[i + 1]) port = argv[i + 1];
  console.log(`\n  Serving the site at ${cyan(`http://localhost:${port}`)}  ${dim("(Ctrl-C to stop)")}\n`);
  let r = await spawnWait("python3", ["-m", "http.server", port]);
  if (r.error && r.error.code === "ENOENT") {
    console.log(dim("  python3 not found — falling back to npx serve.\n"));
    r = await spawnWait("npx", ["--yes", "serve", "-l", port, "."]);
  }
  if (r.error) { console.error(red("  ✗ ") + r.error.message); return 1; }
  return 0; // a server stopped with Ctrl-C is not a failure
}

/* ------------------------------------------------------------------- help */

function help() {
  const lines = [
    "",
    `  ${bold("scio")} ${dim("· ScioVirtual Codebusters instructor tools")}`,
    "",
    `  ${bold("Usage")}`,
    `    scio                     open the interactive menu`,
    `    scio <command> [flags]   run one tool directly`,
    "",
    `  ${bold("Commands")}`,
  ];
  for (const cmd of COMMANDS) {
    const names = [cmd.name, ...cmd.aliases].join(", ");
    lines.push(`    ${cyan(names.padEnd(22))} ${cmd.desc}`);
    for (const f of cmd.flags) lines.push(`    ${"".padEnd(22)} ${dim(f)}`);
  }
  lines.push(
    "",
    `  ${dim("Run via npm:  npm run cli -- <command> [flags]   (or npm link once for a global scio)")}`,
    `  ${dim("Full docs:    tools/README.md")}`,
    "",
  );
  console.log(lines.join("\n"));
}

/* -------------------------------------------------------------------- TUI */

const cols = () => process.stdout.columns || 80;
const truncate = (s, n) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s);

function menuLines(sel) {
  const out = [];
  out.push("");
  out.push(`  ${bold("ScioVirtual Codebusters")} ${dim("· instructor tools")}`);
  out.push("");
  COMMANDS.forEach((cmd, i) => {
    const active = i === sel;
    const num = `${i + 1}.`;
    const label = active ? cyan(bold(cmd.title)) : cmd.title;
    out.push(`  ${active ? cyan("❯") : " "} ${dim(num)} ${label}`);
  });
  out.push("");
  const selCmd = COMMANDS[sel];
  out.push(`  ${dim(truncate(selCmd.desc, cols() - 4))}`);
  out.push(`  ${dim(truncate(`direct: scio ${selCmd.name}${selCmd.flags.length ? "  [" + selCmd.flags.map((f) => f.split(/\s{2,}/)[0]).join("] [") + "]" : ""}`, cols() - 4))}`);
  out.push("");
  out.push(`  ${dim("↑/↓ move · enter run · 1-" + COMMANDS.length + " jump · q quit")}`);
  return out;
}

function drawMenu(sel, prevCount) {
  const lines = menuLines(sel);
  let buf = "";
  if (prevCount) buf += `\x1b[${prevCount}A`; // back to the top of the menu
  for (const line of lines) buf += `\x1b[2K${line}\n`;
  process.stdout.write(buf);
  return lines.length;
}

function eraseMenu(count) {
  process.stdout.write(`\x1b[${count}A\x1b[0J`);
}

/** Arrow-key picker. Resolves to a command, or null to quit. */
function pickFromMenu() {
  return new Promise((res) => {
    const stdin = process.stdin;
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write("\x1b[?25l"); // hide cursor
    let sel = 0;
    let count = drawMenu(sel, 0);

    const finish = (value) => {
      stdin.removeListener("keypress", onKey);
      stdin.setRawMode(false);
      stdin.pause();
      eraseMenu(count);
      process.stdout.write("\x1b[?25h"); // show cursor
      res(value);
    };

    const onKey = (str, key = {}) => {
      const name = key.name || str;
      if ((key.ctrl && name === "c") || name === "q" || name === "escape") return finish(null);
      if (name === "up" || name === "k") sel = (sel + COMMANDS.length - 1) % COMMANDS.length;
      else if (name === "down" || name === "j") sel = (sel + 1) % COMMANDS.length;
      else if (name === "return" || name === "space") return finish(COMMANDS[sel]);
      else if (/^[1-9]$/.test(str || "") && Number(str) <= COMMANDS.length) return finish(COMMANDS[Number(str) - 1]);
      count = drawMenu(sel, count);
    };
    stdin.on("keypress", onKey);
  });
}

/** One raw keypress. True = back to the menu, false = quit. */
function promptContinue() {
  return new Promise((res) => {
    const stdin = process.stdin;
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write(`  ${dim("enter · back to the menu     q · quit")}\n`);
    const onKey = (str, key = {}) => {
      const name = key.name || str;
      if (name === "return" || name === "space" || name === "escape" ||
          name === "q" || (key.ctrl && name === "c")) {
        stdin.removeListener("keypress", onKey);
        stdin.setRawMode(false);
        stdin.pause();
        res(name === "return" || name === "space");
      }
    };
    stdin.on("keypress", onKey);
  });
}

async function tui() {
  if (!isTTY) { help(); return 0; }
  for (;;) {
    const cmd = await pickFromMenu();
    if (!cmd) return 0;
    console.log(`\n  ${cyan("▶")} ${bold(cmd.title)}  ${dim(`(scio ${cmd.name})`)}`);
    const code = await runCommand(cmd, []);
    console.log(code === 0 ? `  ${green("✓ done")}` : `  ${red(`✗ exited with code ${code}`)}`);
    if (!(await promptContinue())) return 0;
    console.log("");
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  const [first, ...rest] = process.argv.slice(2);
  if (!first) return tui();
  if (["help", "--help", "-h"].includes(first)) { help(); return 0; }
  const cmd = COMMANDS.find((k) => k.name === first || k.aliases.includes(first));
  if (!cmd) {
    console.error(`\n  ${red("✗")} Unknown command "${first}".`);
    help();
    return 1;
  }
  return runCommand(cmd, rest);
}

main().then((code) => process.exit(code ?? 0)).catch((e) => {
  console.error(red("\n  ✗ ") + e.message + "\n");
  process.exit(1);
});
