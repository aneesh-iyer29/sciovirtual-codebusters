/* =========================================================================
   cipher-engine.js: interactive Codebusters solvers, themed for this site.
   Ported and unified from the ScioVirtual code-site-encoders frontends.

   Usage (a question page):
     <div data-cipher></div>
     <script src="/assets/js/cipher-engine.js"></script>
     <script>
       Codebusters.render("[data-cipher]", {
         cipherType: "Aristocrat",     // see SUPPORTED below
         aristoType: "K1",             // K1 | K2 | Normal  (Aristocrat/Patristocrat/Xenocrypt)
         questionText: "…",
         cipherText:  "…",
         correctAnswer: "…",
         revealKeyword: "…"
       });
     </script>

   SUPPORTED cipherType values:
     Aristocrat, Patristocrat, Xenocrypt   → letter grid + frequency table
     Affine, Caesar, Atbash, Vigenere      → letter grid
     Hill, Porta                           → letter grid + keyword row
     Baconian                              → 5-symbol groups
     Nihilist, Checkerboard                → two-digit units + Polybius square
     Fractionated Morse                    → morse triplets + replacement table
     Homophonic                            → homophone table (25 cols) + two-digit ciphertext
     Cryptarithm                           → puzzle image + single-digit ciphertext grid

   Any question may also set `image` (a URL) and `imageAlt`; when present the image
   is shown above the ciphertext. Cryptarithm relies on this to show its puzzle.
   ========================================================================= */
(function () {
  "use strict";

  const KEYWORD_TYPES = new Set(["Porta", "Hill", "Nihilist", "Checkerboard"]);
  const TWO_DIGIT_TYPES = new Set(["Nihilist", "Checkerboard"]);
  const FREQ_TYPES = new Set(["Aristocrat", "Patristocrat", "Xenocrypt"]);
  const PUNCT = /^[.,;:'!?]$/;

  const MORSE_TRIPLETS = [
    "•••", "••-", "••×", "•-•", "•--", "•-×", "•×•", "•×-", "•××",
    "-••", "-•-", "-•×", "--•", "---", "--×", "-×•", "-×-", "-××",
    "×••", "×•-", "×•×", "×-•", "×--", "×-×", "××•", "××-",
  ];

  /* ---------- small DOM helpers ---------- */
  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const cell = (cls) => {
    const i = el("input", "cb-cell " + (cls || ""));
    i.autocomplete = "off"; i.autocapitalize = "characters"; i.spellcheck = false;
    return i;
  };
  const cipherCell = (ch, label) => {
    const i = cell("is-cipher");
    i.value = ch; i.readOnly = true; i.tabIndex = -1;
    i.setAttribute("aria-label", label || ("ciphertext " + ch));
    return i;
  };
  const spaceCell = () => {
    const i = cell("is-space"); i.value = ""; i.readOnly = true; i.tabIndex = -1; return i;
  };
  const answerCell = (max) => {
    const i = cell("is-answer"); i.maxLength = max || 1; return i;
  };
  const keyCell = (max) => {
    const i = cell("is-key"); i.maxLength = max || 1; return i;
  };
  const editCell = (cls, max) => {
    const i = cell(cls); i.maxLength = max || 1; return i;
  };

  // Map a typed "." / "-" / "x" to the morse glyph + style class. Returns false if not a morse char.
  function setMorse(input, raw) {
    const k = String(raw).toLowerCase();
    input.classList.remove("m-dot", "m-dash", "m-x");
    if (k === "." || k === "•") { input.value = "•"; input.classList.add("m-dot"); }
    else if (k === "-" || k === "—") { input.value = "—"; input.classList.add("m-dash"); }
    else if (k === "x" || k === "×") { input.value = "×"; input.classList.add("m-x"); }
    else { input.value = ""; return false; }
    return true;
  }

  /* ---------- keyboard navigation shared by every input list ---------- */
  function wireInputs(list) {
    list.forEach((input, idx) => {
      const single = input.maxLength === 1;
      const isMorse = input.classList.contains("is-morse");
      input.addEventListener("beforeinput", (e) => {
        if (e.inputType === "insertText" && e.data) {
          e.preventDefault();
          if (single) {
            // morse cells convert typed . / - / x to glyphs; ignore anything else
            if (isMorse) { if (!setMorse(input, e.data)) return; }
            else { input.value = e.data.toUpperCase(); }
            let n = idx + 1;
            while (n < list.length && (list[n].readOnly || list[n].classList.contains("is-space"))) n++;
            if (n < list.length) list[n].focus();
          } else {
            // numeric cells (homophone table) only accept digits; others uppercase
            const add = input.classList.contains("is-num") ? e.data.replace(/\D/g, "") : e.data.toUpperCase();
            input.value = (input.value + add).slice(0, input.maxLength);
          }
          input.dispatchEvent(new Event("cb:input"));
        }
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
          e.preventDefault();
          if (input.value) { input.value = ""; }
          else {
            let p = idx - 1;
            while (p >= 0 && (list[p].readOnly || list[p].classList.contains("is-space"))) p--;
            if (p >= 0) { list[p].focus(); list[p].value = ""; }
          }
        } else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
          let p = idx - 1;
          while (p >= 0 && (list[p].readOnly || list[p].classList.contains("is-space"))) p--;
          if (p >= 0) { e.preventDefault(); list[p].focus(); }
        } else if (e.key === "ArrowRight" || e.key === "Tab") {
          let n = idx + 1;
          while (n < list.length && (list[n].readOnly || list[n].classList.contains("is-space"))) n++;
          if (n < list.length) { e.preventDefault(); list[n].focus(); }
        }
      });
      input.addEventListener("focus", () => input.select());
    });
  }

  /* ---------- letter grid (aristocrat / affine / hill / porta / …) ---------- */
  function buildGrid(root, data, ctx) {
    const grid = el("div", "cb-grid");
    const showKeyword = KEYWORD_TYPES.has(data.cipherType);
    const words = data.cipherText.trim().split(/\s+/);

    words.forEach((word) => {
      const wordDiv = el("div", "cb-word");
      for (const ch of word) {
        const g = el("div", "cb-stack");
        if (showKeyword) { const k = keyCell(); k.setAttribute("aria-label", "keyword letter above cipher " + ch); ctx.keyInputs.push(k); g.appendChild(k); }
        g.appendChild(cipherCell(ch));
        if (PUNCT.test(ch)) {
          const p = cipherCell(ch); p.classList.add("is-punct");
          g.appendChild(p);
          ctx.parts.push(ch.toUpperCase());
        } else {
          const a = answerCell(); a.setAttribute("aria-label", "answer for cipher " + ch); ctx.answerInputs.push(a); g.appendChild(a);
          ctx.parts.push(a);
        }
        wordDiv.appendChild(g);
      }
      grid.appendChild(wordDiv);
    });
    root.appendChild(grid);
  }

  /* ---------- baconian (groups of five symbols) ---------- */
  function buildBaconian(root, data, ctx) {
    const grid = el("div", "cb-grid cb-stream");
    const chars = data.cipherText.replace(/\s+/g, "");
    for (let i = 0; i < chars.length; i++) {
      const g = el("div", "cb-stack");
      g.appendChild(cipherCell(chars[i], "baconian symbol " + chars[i]));
      const mid = editCell("is-mark"); mid.setAttribute("aria-label", "A or B mark"); ctx.markInputs.push(mid); g.appendChild(mid);
      if (i % 5 === 2) { const a = answerCell(); a.setAttribute("aria-label", "decoded letter"); ctx.answerInputs.push(a); ctx.parts.push(a); g.appendChild(a); }
      else { g.appendChild(spaceCell()); }
      if (i % 5 === 4) g.classList.add("cb-groupend");
      grid.appendChild(g);
    }
    root.appendChild(grid);
  }

  /* ---------- polybius (nihilist / checkerboard, two-digit units) ---------- */
  function buildPolybius(root, data, ctx) {
    const grid = el("div", "cb-grid");
    const words = data.cipherText.trim().split(/\s+/);
    words.forEach((word) => {
      const wordDiv = el("div", "cb-word");
      const units = word.match(/.{1,2}/g) || [];
      units.forEach((unit) => {
        const g = el("div", "cb-stack");
        const k = keyCell(2); k.setAttribute("aria-label", "keyword digits for " + unit); ctx.keyInputs.push(k); g.appendChild(k);
        g.appendChild(cipherCell(unit, "cipher group " + unit));
        const a = answerCell(); a.setAttribute("aria-label", "answer for cipher group " + unit); ctx.answerInputs.push(a); ctx.parts.push(a); g.appendChild(a);
        wordDiv.appendChild(g);
      });
      grid.appendChild(wordDiv);
    });
    root.appendChild(grid);

    /* 6×6 Polybius helper square */
    const aux = el("div", "cb-aux");
    aux.innerHTML = `<div class="cb-aux-label">Polybius square: fill in your reconstructed grid</div>`;
    const square = el("div", "cb-square", { role: "group", "aria-label": "Polybius square worksheet, 6 by 6" });
    for (let i = 0; i < 36; i++) { const c = cell(""); c.maxLength = 1; c.setAttribute("aria-label", "square row " + (Math.floor(i / 6) + 1) + " column " + (i % 6 + 1)); ctx.gridInputs.push(c); square.appendChild(c); }
    aux.appendChild(square);
    root.appendChild(aux);
  }

  /* ---------- fractionated morse ---------- */
  function buildMorse(root, data, ctx) {
    const grid = el("div", "cb-grid cb-stream cb-morse-grid");
    const chars = data.cipherText.replace(/\s+/g, "");
    const morseInput = (i) => {
      i.classList.add("is-morse");
      i.addEventListener("input", () => {
        const v = i.value.trim().toLowerCase();
        i.classList.remove("m-dot", "m-dash", "m-x");
        if (v === "." || v === "•") { i.value = "•"; i.classList.add("m-dot"); }
        else if (v === "-" || v === "—") { i.value = "—"; i.classList.add("m-dash"); }
        else if (v === "x" || v === "×") { i.value = "×"; i.classList.add("m-x"); }
        else { i.value = ""; }
      });
      return i;
    };
    for (let i = 0; i < chars.length; i++) {
      const g = el("div", "cb-stack cb-triple");
      g.appendChild(cipherCell(chars[i], "morse cipher letter " + chars[i]));
      const midRow = el("div", "cb-row");
      for (let j = 0; j < 3; j++) { const m = morseInput(editCell("")); m.setAttribute("aria-label", "morse symbol (type . - or x)"); ctx.morseInputs.push(m); midRow.appendChild(m); }
      g.appendChild(midRow);
      const botRow = el("div", "cb-row");
      for (let j = 0; j < 3; j++) { const a = answerCell(); a.setAttribute("aria-label", "decoded letter"); ctx.answerInputs.push(a); botRow.appendChild(a); }
      g.appendChild(botRow);
      grid.appendChild(g);
    }
    root.appendChild(grid);

    /* replacement key table: 26 morse triplets */
    const aux = el("div", "cb-aux");
    aux.innerHTML = `<div class="cb-aux-label">Replacement: deduce the letter for each morse triplet</div>`;
    const table = el("div", "cb-morse-table");
    MORSE_TRIPLETS.forEach((t) => {
      const col = el("div", "cb-morse-col");
      const top = cell("cb-morse-key"); top.maxLength = 1; top.setAttribute("aria-label", "letter for morse triplet " + t); ctx.replaceInputs.push(top); col.appendChild(top);
      for (const s of t) { const sym = cell("cb-morse-sym"); sym.value = s; sym.readOnly = true; sym.tabIndex = -1; col.appendChild(sym); }
      table.appendChild(col);
    });
    aux.appendChild(table);
    root.appendChild(aux);
  }

  /* ---------- homophonic (homophone table + two-digit ciphertext) ---------- */
  // 25 columns: I and J share one (like the Aristocrat convention).
  const HOMO_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I/J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

  function buildHomophonic(root, data, ctx) {
    /* 1. homophone worksheet: darkened A–Z header + 4 editable number rows */
    const aux = el("div", "cb-aux cb-homo-aux");
    aux.innerHTML = `<div class="cb-aux-label">Homophone table: list the numbers that stand for each letter</div>`;
    const wrap = el("div", "cb-homo-wrap");
    const table = el("table", "cb-homo", { "aria-label": "homophone worksheet, 25 letters by 4 rows" });

    const head = el("tr");
    HOMO_COLS.forEach((l) => { const th = el("th", null, { scope: "col" }); th.textContent = l; head.appendChild(th); });
    table.appendChild(head);

    for (let r = 0; r < 4; r++) {
      const tr = el("tr");
      const rowInputs = [];
      HOMO_COLS.forEach((l) => {
        const td = el("td");
        const inp = cell("is-num is-homo");
        inp.maxLength = 2;   // two digits per cell; the homophone 100 is written as "00"
        inp.setAttribute("inputmode", "numeric");
        inp.setAttribute("aria-label", "homophone " + (r + 1) + " for " + l);
        ctx.gridInputs.push(inp);
        rowInputs.push(inp);
        td.appendChild(inp);
        tr.appendChild(td);
      });
      // Enter advances to the next cell in THIS row, wrapping back to the first
      // at the end. Scoped to these cells only, so nothing else on the site changes.
      rowInputs.forEach((inp, i) => {
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            rowInputs[(i + 1) % rowInputs.length].focus();
          }
        });
      });
      table.appendChild(tr);
    }
    wrap.appendChild(table);
    aux.appendChild(wrap);
    root.appendChild(aux);

    /* 2. ciphertext: two-digit unit on top, editable answer letter below (no key row) */
    const block = el("div", "cb-aux");
    block.innerHTML = `<div class="cb-aux-label">Ciphertext: write the plaintext letter under each number</div>`;
    const grid = el("div", "cb-grid");
    const words = data.cipherText.trim().split(/\s+/);
    words.forEach((word) => {
      const wordDiv = el("div", "cb-word");
      const units = word.match(/.{1,2}/g) || [];
      units.forEach((unit) => {
        const g = el("div", "cb-stack");
        const c = cipherCell(unit, "cipher number " + unit); c.classList.add("is-num");
        g.appendChild(c);
        const a = answerCell(); a.setAttribute("aria-label", "answer for cipher number " + unit);
        ctx.answerInputs.push(a); ctx.parts.push(a); g.appendChild(a);
        wordDiv.appendChild(g);
      });
      grid.appendChild(wordDiv);
    });
    block.appendChild(grid);
    root.appendChild(block);
  }

  /* ---------- frequency table (aristocrat family) ---------- */
  function buildFreqTable(root, data, ctx) {
    const letters = data.cipherType === "Xenocrypt"
      ? "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("")
      : "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const freq = Object.fromEntries(letters.map((l) => [l, 0]));
    for (const ch of data.cipherText.toUpperCase()) if (ch in freq) freq[ch]++;

    const aux = el("div", "cb-aux");
    aux.innerHTML = `<div class="cb-aux-label">Frequency${data.aristoType && data.aristoType !== "Normal" ? " · " + data.aristoType + " replacement" : ""}</div>`;
    const table = el("table", "cb-freq");

    table.setAttribute("aria-label", "letter frequency table");
    const headRow = el("tr");
    letters.forEach((l) => { const th = el("th", null, { scope: "col" }); th.textContent = l; headRow.appendChild(th); });
    const countRow = el("tr");
    letters.forEach((l) => { const td = el("td"); td.textContent = freq[l]; countRow.appendChild(td); });
    const keyRow = el("tr");
    letters.forEach(() => { const td = el("td", "cb-freq-key"); const i = cell(""); i.maxLength = 1; ctx.kInputs.push(i); td.appendChild(i); keyRow.appendChild(td); });

    if (data.aristoType === "K2") { table.append(keyRow, headRow, countRow); }
    else if (data.aristoType === "K1") { table.append(headRow, countRow, keyRow); }
    else { table.append(headRow, countRow); }

    aux.appendChild(el("div", "cb-freq-wrap")).appendChild(table);
    root.appendChild(aux);
  }

  /* ---------- answer checking ---------- */
  // Compare on letters/digits only, so spacing and punctuation never block a
  // correct solve (the student types the decoded letters; punctuation is given).
  const clean = (s) => String(s).toUpperCase().replace(/[^A-Z0-9Ñ]/g, "");

  function collectAnswer(data, ctx) {
    if (data.cipherType === "Fractionated Morse" || data.cipherType === "Baconian") {
      return ctx.answerInputs.map((i) => i.value).join("");
    }
    // grid / polybius: assemble from parts (fixed punctuation + answer inputs)
    return ctx.parts.map((p) => (typeof p === "string" ? p : p.value)).join("");
  }

  function check(data, ctx, ui) {
    const user = clean(collectAnswer(data, ctx));
    const correct = clean(data.correctAnswer);
    if (user === correct) {
      ui.result.className = "cb-result is-correct";
      ui.result.innerHTML = `<span class="cb-check-mark">✓</span> Solved!` +
        (data.revealKeyword ? ` <span class="cb-keyword">Keyword: <b>${escapeHTML(data.revealKeyword)}</b></span>` : "");
      ctx.root.classList.add("cb-solved");
    } else {
      ui.result.className = "cb-result is-wrong";
      ui.result.textContent = user.length ? "Not quite. Keep going." : "Fill in your solution, then check.";
      ctx.root.classList.remove("cb-solved");
    }
  }

  const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- public render ---------- */
  function render(mount, data) {
    const host = typeof mount === "string" ? document.querySelector(mount) : mount;
    if (!host) { console.warn("Codebusters.render: mount not found", mount); return; }
    host.innerHTML = "";
    host.classList.add("cb");

    const ctx = {
      root: host, parts: [], answerInputs: [], keyInputs: [], kInputs: [],
      markInputs: [], gridInputs: [], morseInputs: [], replaceInputs: [],
    };

    if (data.questionText) {
      const q = el("div", "cb-question");
      q.textContent = data.questionText;
      host.appendChild(q);
    }

    const board = el("div", "cb-board", { role: "group", "aria-label": (data.cipherType || "Cipher") + " puzzle worksheet" });
    host.appendChild(board);

    // Optional puzzle image (e.g. a cryptarithm), shown above the ciphertext.
    if (data.image) {
      const fig = el("figure", "cb-figure");
      const img = el("img", "cb-crypt-img", { src: data.image, alt: data.imageAlt || "Puzzle to solve" });
      img.loading = "lazy";
      fig.appendChild(img);
      board.appendChild(fig);
    }

    const type = data.cipherType;
    if (type === "Fractionated Morse") buildMorse(board, data, ctx);
    else if (type === "Baconian") buildBaconian(board, data, ctx);
    else if (type === "Homophonic") buildHomophonic(board, data, ctx);
    else if (type === "Cryptarithm") buildGrid(board, data, ctx);   // single-digit ciphertext under the image
    else if (TWO_DIGIT_TYPES.has(type)) buildPolybius(board, data, ctx);
    else buildGrid(board, data, ctx);

    if (FREQ_TYPES.has(type)) buildFreqTable(board, data, ctx);

    /* wire keyboard behaviour */
    wireInputs(ctx.answerInputs);
    wireInputs(ctx.keyInputs);
    wireInputs(ctx.kInputs);
    wireInputs(ctx.markInputs);
    wireInputs(ctx.gridInputs);
    wireInputs(ctx.morseInputs);
    wireInputs(ctx.replaceInputs);

    /* actions + result */
    const actions = el("div", "cb-actions");
    const checkBtn = el("button", "btn btn-primary cb-check"); checkBtn.type = "button"; checkBtn.textContent = "Check answer";
    const clearBtn = el("button", "btn btn-ghost cb-clear"); clearBtn.type = "button"; clearBtn.textContent = "Clear";
    actions.append(checkBtn, clearBtn);
    const result = el("div", "cb-result", { role: "status", "aria-live": "polite" });
    host.append(actions, result);

    const ui = { result };
    checkBtn.addEventListener("click", () => check(data, ctx, ui));
    clearBtn.addEventListener("click", () => {
      host.querySelectorAll(".cb-cell:not(.is-cipher):not(.is-space)").forEach((i) => { if (!i.readOnly) { i.value = ""; i.classList.remove("m-dot", "m-dash", "m-x"); } });
      result.className = "cb-result"; result.textContent = ""; host.classList.remove("cb-solved");
      const first = ctx.answerInputs[0]; if (first) first.focus();
    });

    return ctx;
  }

  window.Codebusters = { render };
  window.renderCipher = render; // convenience alias
})();
