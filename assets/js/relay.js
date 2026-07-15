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

  /* ---------- round ---------- */
  // Each question is stored base64(UTF-8 JSON) so the answers aren't sitting in
  // plain text in the page source. Decode to the object the engine expects.
  function unpackQuestion(b64) {
    const bin = atob(String(b64));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function renderProgress(container, n, total, needed) {
    const pct = total ? Math.min(100, Math.round((n / total) * 100)) : 0;
    const ready = n >= needed;
    container.className = "relay-progress" + (ready ? " is-ready" : "");
    const note = ready
      ? "Enough to advance — submit your passwords, then enter your code below."
      : "Solve at least " + needed + " of " + total + " to unlock the next round.";
    container.innerHTML =
      '<div class="relay-progress-head">' +
        '<span class="relay-progress-count">Solved ' + n + " / " + total + "</span>" +
        '<span class="relay-progress-note">' + note + "</span>" +
      "</div>" +
      '<div class="relay-progress-bar"><span style="width:' + pct + '%"></span></div>';
  }

  function initRound(cfg) {
    const qRoot = document.querySelector("[data-relay-questions]");
    const progress = document.querySelector("[data-relay-progress]");
    const gate = document.querySelector("[data-relay-gate]");
    const submitSection = document.querySelector(".relay-submit");
    const advanceSection = document.querySelector(".relay-advance");
    if (!qRoot || !window.Codebusters) {
      console.warn("relay.js: a round needs cipher-engine.js and a [data-relay-questions] container");
      return;
    }

    let questions = [];
    try { questions = (cfg.questions || []).map(unpackQuestion); }
    catch (e) { console.warn("relay.js: could not read round questions", e); return; }

    const total = questions.length;
    const needed = Math.max(1, Math.min(cfg.needed || Math.max(1, total - 1), total));

    // render every cipher with the existing solver
    const hosts = [];
    questions.forEach((q, i) => {
      const block = el("div", "relay-q");
      const eb = el("p", "eyebrow");
      eb.textContent = "Cipher " + String(i + 1).padStart(2, "0") + (q.cipherType ? " · " + q.cipherType : "");
      const mount = el("div");
      mount.setAttribute("data-cipher", "");
      block.append(eb, mount);
      qRoot.appendChild(block);
      window.Codebusters.render(mount, q);
      hosts.push(mount);
    });

    // Everything past the ciphers — the submission form AND the code box — stays
    // hidden until enough are solved, so a team can't submit or advance early
    // (and can't get stuck trying to submit with fewer than `needed` solves).
    [submitSection, advanceSection].forEach((s) => { if (s) s.hidden = true; });
    const lock = el("div", "relay-final-lock");
    lock.innerHTML =
      '<span class="relay-lock-ic" aria-hidden="true">🔒</span>' +
      "<div><b>Submission unlocks at " + needed + " of " + total + ".</b> " +
      "Solve at least " + needed + " ciphers to open the form and the code box — " +
      'solved so far: <span data-lock-count>0</span> / ' + total + ".</div>";
    if (submitSection && submitSection.parentNode) submitSection.parentNode.insertBefore(lock, submitSection);

    let unlocked = false;
    const update = () => {
      let n = 0;
      hosts.forEach((h) => { if (h.classList.contains("cb-solved")) n++; });
      if (progress) renderProgress(progress, n, total, needed);
      const c = lock.querySelector("[data-lock-count]");
      if (c) c.textContent = n;
      if (n >= needed && !unlocked) {
        unlocked = true; // latch open — never yank access back once earned
        lock.hidden = true;
        [submitSection, advanceSection].forEach((s) => { if (s) s.hidden = false; });
        if (gate && cfg.gate && cfg.gate.enc) {
          mountGate(gate, cfg.gate.enc, {
            label: "Round code",
            hint: "code from your form's confirmation screen",
            go: "Continue to the next round →",
          });
        }
      }
    };

    // the engine toggles a `cb-solved` class on each solved cipher's host —
    // watch it directly, so the engine needs no changes.
    const mo = new MutationObserver(update);
    hosts.forEach((h) => mo.observe(h, { attributes: true, attributeFilter: ["class"] }));
    update();
  }

  /* ---------- boot ---------- */
  function boot() {
    const node = document.getElementById("relay-config");
    if (!node) return;
    let cfg;
    try { cfg = JSON.parse(node.textContent); } catch (e) { console.warn("relay.js: bad relay-config", e); return; }
    if (!cfg || !cfg.role) return;

    if (cfg.role === "home") initHome(cfg);
    else if (cfg.role === "round") initRound(cfg);
    else if (cfg.role === "finish") { /* terminal page: nothing to wire */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // Exposed so the round runtime (added later) can reuse the same gate.
  window.Relay = { mountGate, dec };
})();
