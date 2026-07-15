/* =========================================================================
   relay.js: runtime for the Codebusters relay race.

   Every relay page carries its settings in a <script id="relay-config"> JSON
   block. This file reads that block and drives the page by its `role`:

     home    → embeds the team form + a code gate that unlocks Round 1
     round   → renders the ciphers + a 3/4-style gate (added by add:relay-round)
     finish  → terminal page, nothing to do

   The "next" link for each page is stored ENCRYPTED (gate.enc) under the code
   the team gets from a Google Form's confirmation message. Entering the right
   code decrypts and reveals the link; a wrong code reveals nothing. The crypto
   below is a byte-for-byte mirror of tools/relaycrypto.mjs — keep them in sync.
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

  /* ---------- the code gate (shared by home now, rounds later) ----------
     Renders a code box into `container`. On the right code, decrypts `encBlob`
     and swaps in a "Continue →" button to the revealed path. Returns nothing;
     it owns its own DOM. `label`/`hint` let callers tune the wording. */
  function mountGate(container, encBlob, opts) {
    opts = opts || {};
    container.classList.remove("is-unlocked");
    container.innerHTML = "";

    const form = el("form", "relay-gate-form");
    const label = el("label", "relay-gate-label");
    label.textContent = opts.label || "Enter your code";
    const row = el("div", "relay-gate-row");
    const box = el("input", "relay-code");
    box.type = "text"; box.autocomplete = "off"; box.autocapitalize = "characters";
    box.spellcheck = false; box.setAttribute("aria-label", opts.label || "Code");
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
        status.textContent = "Type your code, then press Unlock.";
        return;
      }
      const link = dec(encBlob, code);
      if (!link || link[0] !== "/") {
        status.className = "relay-gate-status is-wrong";
        status.textContent = "That code doesn't match — double-check the confirmation screen from your form.";
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
    const gate = document.querySelector("[data-relay-gate]");
    if (!gate || !cfg.gate || !cfg.gate.enc) return;
    mountGate(gate, cfg.gate.enc, {
      label: "Team code",
      hint: "code from your confirmation screen",
      go: "Start the relay →",
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    const node = document.getElementById("relay-config");
    if (!node) return;
    let cfg;
    try { cfg = JSON.parse(node.textContent); } catch (e) { console.warn("relay.js: bad relay-config", e); return; }
    if (!cfg || !cfg.role) return;

    if (cfg.role === "home") initHome(cfg);
    else if (cfg.role === "finish") { /* terminal page: nothing to wire */ }
    // "round" is wired up by tools/add-relay-round.mjs (Tool 2), which extends this file.
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // Exposed so the round runtime (added later) can reuse the same gate.
  window.Relay = { mountGate, dec };
})();
