/* =========================================================================
   questionpage.js: runtime for a multi-question page.

   A "question page" holds several ciphers, a live progress bar, and a single
   global keyword that stays hidden until the student has solved at least
   `needed` of the ciphers. It reads its settings from a
   <script id="questionpage-config"> JSON block:

     {
       "questions": [ "<base64(JSON)>", … ],   // one per cipher, same shape the
                                                //   cipher-engine expects
       "needed":   6,                           // how many must be solved
       "keyword":  "<base64(UTF-8)>"            // the reward, revealed at `needed`
     }

   Each question is base64(UTF-8 JSON) and the keyword is base64(UTF-8) so the
   answers/reward aren't sitting in plain text in the page source — the same
   light obfuscation relay.js uses (this stops casual view-source, not a
   determined one; the engine still has to check answers client-side).

   It renders every cipher with the shared cipher-engine, watches each host's
   `cb-solved` class (toggled by the engine on a correct solve), and reveals the
   keyword once the count reaches `needed`. Progress markup mirrors the relay's.
   ========================================================================= */
(function () {
  "use strict";

  /* ---------- small DOM helper ---------- */
  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const escapeHTML = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Decode base64(UTF-8) → string (questions and the keyword are stored this way).
  function b64decode(b64) {
    const bin = atob(String(b64));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  const unpackQuestion = (b64) => JSON.parse(b64decode(b64));

  /* ---------- progress bar (mirrors relay.js's markup/classes) ---------- */
  function renderProgress(container, n, total, needed) {
    const pct = total ? Math.min(100, Math.round((n / total) * 100)) : 0;
    const ready = n >= needed;
    container.className = "qp-progress" + (ready ? " is-ready" : "");
    const note = ready
      ? "Nice — you've solved enough. Your keyword is revealed below."
      : "Solve at least " + needed + " of " + total + " to reveal the keyword.";
    container.innerHTML =
      '<div class="qp-progress-head">' +
        '<span class="qp-progress-count">Solved ' + n + " / " + total + "</span>" +
        '<span class="qp-progress-note">' + note + "</span>" +
      "</div>" +
      '<div class="qp-progress-bar"><span style="width:' + pct + '%"></span></div>';
  }

  /* ---------- boot ---------- */
  function boot() {
    const node = document.getElementById("questionpage-config");
    if (!node) return;
    let cfg;
    try { cfg = JSON.parse(node.textContent); } catch (e) { console.warn("questionpage.js: bad config", e); return; }

    const qRoot = document.querySelector("[data-qp-questions]");
    const progress = document.querySelector("[data-qp-progress]");
    const reveal = document.querySelector("[data-qp-reveal]");
    if (!qRoot || !window.Codebusters) {
      console.warn("questionpage.js: needs cipher-engine.js and a [data-qp-questions] container");
      return;
    }

    let questions = [];
    try { questions = (cfg.questions || []).map(unpackQuestion); }
    catch (e) { console.warn("questionpage.js: could not read questions", e); return; }

    const total = questions.length;
    // needed is clamped to 1..total, defaulting to "all of them".
    const needed = Math.max(1, Math.min(cfg.needed || total, total));
    let keyword = "";
    try { if (cfg.keyword) keyword = b64decode(cfg.keyword); } catch (e) { keyword = ""; }

    // render every cipher with the existing solver
    const hosts = [];
    questions.forEach((q, i) => {
      const block = el("div", "qp-q");
      const eb = el("p", "eyebrow");
      eb.textContent = "Question " + String(i + 1).padStart(2, "0") + (q.cipherType ? " · " + q.cipherType : "");
      const mount = el("div");
      mount.setAttribute("data-cipher", "");
      block.append(eb, mount);
      qRoot.appendChild(block);
      window.Codebusters.render(mount, q);
      hosts.push(mount);
    });

    // The keyword panel stays hidden until enough ciphers are solved.
    if (reveal) reveal.hidden = true;

    let unlocked = false;
    const update = () => {
      let n = 0;
      hosts.forEach((h) => { if (h.classList.contains("cb-solved")) n++; });
      if (progress) renderProgress(progress, n, total, needed);
      if (n >= needed && !unlocked) {
        unlocked = true; // latch open — never take the reward back once earned
        if (reveal) {
          reveal.hidden = false;
          reveal.className = "qp-reveal is-shown";
          reveal.innerHTML =
            '<span class="qp-reveal-ic" aria-hidden="true">🎉</span>' +
            '<div class="qp-reveal-body">' +
              "<h2>You unlocked the keyword!</h2>" +
              '<p>Solved ' + needed + " of " + total + " — here's your keyword:</p>" +
              (keyword ? '<p class="qp-reveal-key">' + escapeHTML(keyword) + "</p>" : "") +
            "</div>";
          reveal.focus?.();
        }
      }
    };

    // the engine toggles `cb-solved` on each solved cipher's host — watch it
    // directly, so the engine itself needs no changes (same trick as relay.js).
    const mo = new MutationObserver(update);
    hosts.forEach((h) => mo.observe(h, { attributes: true, attributeFilter: ["class"] }));
    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
