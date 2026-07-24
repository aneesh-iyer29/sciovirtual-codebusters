/* =========================================================================
   escape.js: runtime for the Codebusters escape game.

   Sibling of relay.js, but built for an escape room instead of a relay:
   there is NO "solve N of M to advance" gate. On every round page the
   submission form and the password box are ALWAYS visible — a team can
   crack the puzzle and type the password at any moment.

   Every escape page carries its settings in a <script id="escape-config">
   JSON block. This file reads that block and drives the page by its `role`:

     home    → embeds the team form + a password gate that unlocks Round 1
     round   → renders the ciphers + an always-visible password gate
     finish  → terminal page, nothing to do

   The "next" link for each page is stored ENCRYPTED (gate.enc) under the
   password a team works out from the puzzle (the same password the round's
   Google Form reveals on its confirmation screen). Entering the right
   password decrypts and reveals the link; a wrong one reveals nothing. The
   crypto below is a byte-for-byte mirror of tools/relaycrypto.mjs — keep
   them in sync.
   ========================================================================= */
(function () {
  "use strict";

  const MAGIC = "OK1:";

  /* ---------- crypto (mirror of tools/relaycrypto.mjs) ---------- */
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function xorText(text, code) {
    const rng = mulberry32(cyrb53(code) >>> 0);
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const k = Math.floor(rng() * 256);
      out += String.fromCharCode((text.charCodeAt(i) & 0xff) ^ k);
    }
    return out;
  }
  function dec(blob, code) {
    let bin;
    try { bin = atob(String(blob)); } catch (e) { return null; }
    const out = xorText(bin, code);
    return out.startsWith(MAGIC) ? out.slice(MAGIC.length) : null;
  }

  /* ---------- small DOM helper ---------- */
  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  /* ---------- the password gate (shared by home and rounds) ----------
     Renders a password box into `container`. On the right password, decrypts
     `encBlob` and swaps in a "Continue →" button to the revealed path. It owns
     its own DOM. `label`/`hint`/`go` let callers tune the wording. */
  function mountGate(container, encBlob, opts) {
    opts = opts || {};
    container.classList.remove("is-unlocked");
    container.innerHTML = "";

    const form = el("form", "relay-gate-form");
    const label = el("label", "relay-gate-label");
    label.textContent = opts.label || "Enter the password";
    const row = el("div", "relay-gate-row");
    const box = el("input", "relay-code");
    box.type = "text"; box.autocomplete = "off"; box.autocapitalize = "characters";
    box.spellcheck = false; box.setAttribute("aria-label", opts.label || "Password");
    if (opts.hint) box.placeholder = opts.hint;
    const btn = el("button", "btn btn-primary");
    btn.type = "submit"; btn.textContent = "Unlock";
    row.append(box, btn);
    const status = el("p", "relay-gate-status", { role: "status", "aria-live": "polite" });
    form.append(label, row, status);
    container.appendChild(form);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = box.value.trim();
      if (!code) {
        status.className = "relay-gate-status";
        status.textContent = "Type the password, then press Unlock.";
        return;
      }
      const link = dec(encBlob, code);
      if (!link || link[0] !== "/") {
        status.className = "relay-gate-status is-wrong";
        status.textContent = "That password isn't right — keep working the puzzle.";
        box.select();
        return;
      }
      container.classList.add("is-unlocked");
      container.innerHTML = "";
      const wrap = el("div", "relay-unlocked");
      const msg = el("p", "relay-unlocked-msg");
      msg.innerHTML = '<span class="relay-check" aria-hidden="true">✓</span> Unlocked!';
      const go = el("a", "btn btn-teal relay-continue");
      go.href = link; go.textContent = opts.go || "Continue →";
      wrap.append(msg, go);
      container.appendChild(wrap);
      go.focus();
    });
  }

  /* ---------- home ---------- */
  function initHome(cfg) {
    const gate = document.querySelector("[data-escape-gate]");
    if (!gate || !cfg.gate || !cfg.gate.enc) return;
    mountGate(gate, cfg.gate.enc, {
      label: "Team password",
      hint: "the password from your confirmation screen",
      go: "Enter the escape →",
    });
  }

  /* ---------- round ---------- */
  // Each question is stored base64(UTF-8 JSON) so the answers aren't sitting in
  // plain text in the page source. Decode to the object the engine expects.
  function unpackQuestion(b64) {
    const bin = atob(String(b64));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function initRound(cfg) {
    const qRoot = document.querySelector("[data-escape-questions]");
    const gate = document.querySelector("[data-escape-gate]");
    if (!qRoot || !window.Codebusters) {
      console.warn("escape.js: a round needs cipher-engine.js and a [data-escape-questions] container");
      return;
    }

    let questions = [];
    try { questions = (cfg.questions || []).map(unpackQuestion); }
    catch (e) { console.warn("escape.js: could not read round questions", e); return; }

    // Render every cipher with the existing solver. Each one reveals its own
    // keyword when solved — the ciphers are clues toward the password, but
    // nothing here is gated on solving them.
    questions.forEach((q, i) => {
      const block = el("div", "relay-q");
      const eb = el("p", "eyebrow");
      eb.textContent = "Cipher " + String(i + 1).padStart(2, "0") + (q.cipherType ? " · " + q.cipherType : "");
      const mount = el("div");
      mount.setAttribute("data-cipher", "");
      block.append(eb, mount);
      qRoot.appendChild(block);
      window.Codebusters.render(mount, q);
    });

    // The password box is ALWAYS live — this is an escape room, so a team can
    // crack the puzzle and type the password whenever they figure it out.
    if (gate && cfg.gate && cfg.gate.enc) {
      mountGate(gate, cfg.gate.enc, {
        label: "Round password",
        hint: "the password you worked out",
        go: "Continue to the next room →",
      });
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    const node = document.getElementById("escape-config");
    if (!node) return;
    let cfg;
    try { cfg = JSON.parse(node.textContent); } catch (e) { console.warn("escape.js: bad escape-config", e); return; }
    if (!cfg || !cfg.role) return;

    if (cfg.role === "home") initHome(cfg);
    else if (cfg.role === "round") initRound(cfg);
    else if (cfg.role === "finish") { /* terminal page: nothing to wire */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // Exposed so the round runtime can reuse the same gate.
  window.Escape = { mountGate, dec };
})();
