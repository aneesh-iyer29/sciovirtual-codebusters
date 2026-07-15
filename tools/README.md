# Instructor tools: adding questions, pages, and resources

Everything on this site is plain HTML, but you should almost never write it by hand.
The two generators in this folder create themed pages and wire them into the site
navigation for you. Run them from the **repo root** with Node 18+.

```bash
npm start             # serve the site at http://localhost:8000 (needed to preview)
npm run add:question  # new interactive cipher question
npm run add:relay     # scaffold a relay race (home + finish + nav card); rounds added separately
npm run add:relay-round # add a round (ciphers + submission form + code gate), spliced at the tail
npm run add:page      # new page from any embed (Form, Doc, Slides, video)
npm run add:homework  # new homework assignment (PDF + submission form) on the Homework page
npm run add:recording # new "Day N" slides & recording page from two Google links
```

---

## 1. Add an interactive cipher question

```bash
npm run add:question
```

Answer the prompts:

| Prompt | What to enter |
| --- | --- |
| Cipher type | `Aristocrat`, `Patristocrat`, `Xenocrypt`, `Affine`, `Caesar`, `Atbash`, `Vigenere`, `Hill`, `Porta`, `Baconian`, `Nihilist`, `Checkerboard`, `Fractionated Morse`, `Homophonic`, `Cryptarithm` |
| Aristocrat type | `K1`, `K2`, or `Normal` (only asked for Aristocrat-family ciphers) |
| Image path | **Only asked for `Cryptarithm`.** Path to the puzzle image; it's copied into `assets/img/cryptarithms/<slug>.<ext>` (PNG/JPG/GIF/WebP/SVG) and shown above the ciphertext. The ciphertext is short single digits (`385 4210`) that decode to letters. |
| Question prompt | The text shown above the puzzle grid |
| Cipher text | The encoded text, exactly as students should see it |
| Correct answer | The decoded plaintext (checking ignores punctuation and case) |
| Reveal keyword | A fun keyword shown when the student solves it |
| Day number | `1`, `2`, ... (a new day auto-creates the day hub page) |
| Day card kicker / description | **Only asked for a brand-new day.** Sets the day's card on the Daily Questions overview (e.g. kicker `Day 4 · Hill`, description "A Hill warm-up and two practice ciphers"). Defaults the kicker to `Day N · <CipherType>` so the card is never blank. |
| Title / slug / intro | How the page is named and linked |

The script then:

1. creates `daily-questions/day-<n>/<slug>.html`,
2. creates `daily-questions/day-<n>/index.html` if this is the first question of that day (and fills that day's overview card), and
3. adds the link under **Daily Questions > Day N** in `assets/js/nav.js`.

> The day-card prompts appear **only when the day is new**, so adding more questions to an
> existing day never re-asks or overwrites its card. To change an existing day's card, edit
> its `kicker` / `desc` in `assets/js/nav.js` by hand.

Preview at the URL it prints, then commit and push. Netlify redeploys automatically.

### Batch mode (no prompts)

Save the answers to a JSON file and run:

```bash
node tools/add-question.mjs --json my-question.json
```

```json
{
  "cipherType": "Aristocrat",
  "aristoType": "K1",
  "questionText": "Solve this K1 Aristocrat. What does it say?",
  "cipherText": "QGA BESBLQBFA ...",
  "correctAnswer": "THE ADVANTAGE ...",
  "revealKeyword": "AEROSPACE",
  "day": "2",
  "title": "Aristocrat #1",
  "slug": "aristocrat-1",
  "lead": "Warm up with an easy one.",
  "dayKicker": "Day 2 · Aristocrats",
  "dayDesc": "Two Aristocrats to warm up on."
}
```

`dayKicker` / `dayDesc` are optional and only used when the day is new; if you omit
`dayKicker` on a new day, it defaults to `Day N · <CipherType>`.

For a **Cryptarithm**, add `"image"` (a path to the puzzle picture) and optional
`"imageAlt"`; the image is copied into `assets/img/cryptarithms/` and displayed above
the ciphertext:

```json
{
  "cipherType": "Cryptarithm",
  "questionText": "Solve the cryptarithm, then decode the numbers.",
  "cipherText": "385 4210",
  "correctAnswer": "THE WORD",
  "revealKeyword": "MATH",
  "image": "~/Desktop/send-more-money.png",
  "imageAlt": "SEND + MORE = MONEY",
  "day": "4", "title": "Cryptarithm #1", "slug": "cryptarithm-1"
}
```

### Don't have cipher text yet?

Use the encoders in `tools/encoders/` (open <http://localhost:8000/tools/encoders/>
while the site is running). Paste a plaintext quote, pick the cipher and key, and copy
the generated cipher text into the generator.

---

## 2. Add any other page or resource

```bash
npm run add:page
```

Use this for anything that lives in an iframe: a Google Form, Doc, Slides deck,
YouTube or Drive video, or arbitrary pasted embed HTML. It asks for a title, which
nav group to file it under (it lists the existing groups), a folder, and the embed
source, then builds the page and adds the nav link.

Batch mode works here too:

```bash
node tools/add-page.mjs --json my-page.json
```

```json
{
  "title": "Day 2 Homework",
  "lead": "Due before Day 3.",
  "nav": "Course Info",
  "folder": "course-information",
  "url": "https://docs.google.com/forms/d/e/XXXX/viewform?embedded=true",
  "kind": "form"
}
```

`kind` controls the aspect ratio: `video` (16:9), `doc` (8.5:11), `form` (3:4), `square`.
For pasted embed code, use `"embedFile": "path/to/embed.html"` instead of `url`.

---

## 3. Add a homework assignment

```bash
npm run add:homework
```

Use this to publish a homework set on the **Homework** page (`course-information/homework.html`).
Unlike the tools above, this does **not** create a new page or a nav entry — the Homework
page already exists. Each assignment is one card with a clipped PDF preview, a **Download**
button, a **View full PDF** button, and a link to its submission form. The tool:

1. copies your PDF into `assets/hw/` under a URL-safe filename,
2. builds the card from `tools/templates/homework.html`, and
3. inserts it at the bottom of the list on the Homework page (newest last).

Answer the prompts:

| Prompt | What to enter |
| --- | --- |
| Path to the homework PDF | Where the PDF is **on your machine** (e.g. `~/Downloads/day3-hw.pdf`); it gets copied into `assets/hw/` |
| Day number | `1`, `2`, ... (drives the `Day N` badge; defaults to the next day) |
| Title | The heading, e.g. `Homework #3 · Vigenère` (defaults to `Homework #N`) |
| One-line description | The sentence under the title (optional) |
| Submission form URL | The share link to your Google Form — **you create the form; the tool only links to it** |
| Stored filename | Optional override for the copied file's name (a safe default is offered) |

> **You provide the form link.** The tool does not create or edit a Google Form; make the
> form yourself and paste its URL. The PDF is copied (your original is left untouched), and the
> stored filename is normalized to letters, digits, `.`, `-`, `_` so links never break — the
> old `Porta&Columnar.pdf` (which needed `%26` in the HTML) can't happen again.

### Batch mode (no prompts)

```bash
node tools/add-homework.mjs --json my-homework.json
```

```json
{
  "pdf": "~/Downloads/day3-hw.pdf",
  "day": "3",
  "title": "Homework #3 · Vigenère",
  "desc": "Practice with the Vigenère cipher. Preview the first page below, or open the full assignment to scroll and print.",
  "formUrl": "https://docs.google.com/forms/d/e/XXXX/viewform"
}
```

Extra flags (work in both modes): `--pdf <path>` (supply/override the PDF path),
`--dry` (print the card and planned actions without writing anything), and `--force`
(overwrite an existing PDF of the same name, or add a second assignment to a day that
already has one).

> **One-time scaffold.** The tool inserts each card at a sentinel comment in the Homework page:
> `<!-- add:homework anchor: ... -->`, just before the closing `</div>` of `<div class="hw-list">`.
> It's already there — leave it in place. If it's ever removed, the tool will tell you exactly
> what line to add back.

Preview at <http://localhost:8000/course-information/homework.html>, then commit and push.

---

## 4. Post slides and a recording for a day

```bash
npm run add:recording
```

Creates (or updates) the **Day N** page under **Slides & Recordings** from two Google
links: the Drive recording and the Slides deck. Each page shows an inline video preview
with an "Open the video in Google Drive" button, and a slides preview with an "Open the
slides" button — the same layout as the Homework cards. The tool:

1. pulls the file ids out of both share links and builds the embed + open URLs,
2. writes `slides-recordings/day-N.html` from `tools/templates/recording.html`
   (**if the page already exists it is deleted and rewritten** — that's how you update it), and
3. adds/refreshes the **Slides & Recordings › Day N** nav entry, keeping the days in order.

Answer the prompts:

| Prompt | What to enter |
| --- | --- |
| Google Drive recording link | Any share link, e.g. `https://drive.google.com/file/d/FILEID/view?usp=sharing` |
| Google Slides link | e.g. `https://docs.google.com/presentation/d/PRESID/edit?usp=sharing` |
| Day number | `1`, `2`, ... (defaults to the next unused day) |

> **You host the files on Google; the tool only links to and embeds them.** Make sure both
> the recording and the deck are shared as **"Anyone with the link → Viewer"**, or students
> will see an "access denied" box instead of the preview.

### Batch mode (no prompts)

```bash
node tools/add-recording.mjs --json my-recording.json
```

```json
{
  "recording": "https://drive.google.com/file/d/FILEID/view?usp=sharing",
  "slides": "https://docs.google.com/presentation/d/PRESID/edit?usp=sharing",
  "day": "2"
}
```

Add `--dry` to print the derived URLs and target page without writing anything.

Preview at <http://localhost:8000/slides-recordings/day-N.html>, then commit and push.

---

## 5. Set up a relay race

A relay is a chain of gated rounds: a team registers, enters a code to reach the first
round, solves enough of that round's ciphers to unlock the next, and so on to a finish
page. It's built in two steps — **scaffold the relay once** with `add:relay`, then **append
rounds** with `add:relay-round` (a separate tool).

```bash
npm run add:relay
```

This creates the relay's **home page**, its **finish page**, a committed **`relay.config.json`**
(structure only — never any codes), and a **nav card under Daily Questions › Day N** that opens
the home page (just like a walkthrough or practice card). It starts as a two-link chain,
`home → finish`: entering the team code on the home page unlocks the finish page. Adding rounds
splices them in at the tail, so it grows to `home → r1 → r2 → … → finish`.

Answer the prompts:

| Prompt | What to enter |
| --- | --- |
| Relay title | The heading + nav card label, e.g. `Cipher Relay Race` |
| URL slug / folder | Where the relay lives; defaults to `daily-questions/day-N/<slug>` |
| Day number | Which day's card grid the relay card joins (`1`, `2`, …; a new day auto-creates its hub) |
| Card kicker / description | The relay's card on the day overview |
| Team-registration form URL | The full Google Form `…/viewform` link, embedded as step 1 on the home page |
| Team code | The code you set in that form's **confirmation message** — students type it to start |
| Rules/intro, finish title & message | Optional; press enter for sensible defaults, or point at an HTML file |
| Default ciphers-to-solve per round | The threshold rounds inherit (e.g. `3`); each round can override it |

### How the code gate works

The link to the next page is stored in the page **encrypted under the code**, not merely
hidden — so it can't be lifted from `view-source` and used to jump ahead. Entering the right
code decrypts and reveals a **Continue** button; a wrong code reveals nothing. The code lives
**only** in the Google Form's confirmation message, never in the repo. Codes are **case- and
space-sensitive** (`Nebula 7` ≠ `nebula7`), so set the form's confirmation text to exactly what
you type into the tool. On the form, also turn **off** "edit after submit" so answers lock.

> The cipher *answers* still live in each page (the browser has to check them), so this stops
> URL-phishing and accidental skipping, not a determined `view-source`. That's the intended bar.

### Batch mode (no prompts)

```bash
node tools/add-relay.mjs --json my-relay.json
```

```json
{
  "title": "Cipher Relay Race",
  "day": "5",
  "teamFormUrl": "https://docs.google.com/forms/d/e/XXXX/viewform",
  "teamCode": "STARSHIP7",
  "kicker": "Relay · Race",
  "desc": "A team relay: solve each round's ciphers to unlock the next.",
  "needed": 3
}
```

Optional fields: `slug`, `base` (folder), `introFile`/`introHtml`, `finishTitle`,
`finishFile`/`finishHtml`. Once scaffolded, add rounds with `add:relay-round`.

Preview at the URL it prints, then commit and push.

### Add a round

```bash
npm run add:relay-round
```

Appends a round **at the tail** of the chain: it points the current last page (the home page,
or the previous round) at the new round, and points the new round at the finish page — so the
chain grows `home → r1 → r2 → … → finish`. It auto-picks the relay if there's only one; with
several, it asks (or set `"relay": "<base>"` in JSON). Each round page is titled **Round N**,
counting from 1.

Answer the prompts:

| Prompt | What to enter |
| --- | --- |
| How many ciphers this round | Any number (default 4) — not fixed at 4 |
| How many must be solved to advance | Default is all-but-one (e.g. 3 of 4); the code box stays locked until this many are solved |
| Each cipher | Same questions as `add:question` — type, Aristocrat sub-type, prompt, cipher text, answer, and the **password** revealed on solve — repeated until the round is full |
| This round's Google Form URL | Where teams submit that round's passwords; shown **after** the ciphers |
| Embed the form in the page? | `y` = in-page embed **plus** an "Open in a new tab ↗" button; `n` = just the new-tab button. Either way students can submit in their own tab |
| This round's code | The code you set on **this** round's form confirmation message; encrypts this round → next |
| Previous page's code | The code on the **current last** page's form (the team code for round 1, or the previous round's code) — needed to re-point it at this round |

The tool **verifies the previous code before writing anything** — it must currently decrypt the
tail's gate to the finish page (the invariant that always holds before an insert), so a typo
fails fast instead of breaking the chain. The ciphers' answers are stored base64-obfuscated in
the page (not plain text), and the "next" link is encrypted under this round's code, same as the
home page.

On the round's page the flow is: solve the ciphers (each reveals its password) → the progress bar
tracks **Solved X / N** → once the threshold is met the submission form and the code box unlock →
enter the code from the form's confirmation screen to reveal the **Continue** button.

### Batch mode (no prompts)

```bash
node tools/add-relay-round.mjs --json my-round.json
```

```json
{
  "relay": "/daily-questions/day-5/cipher-relay",
  "needed": 3,
  "formUrl": "https://docs.google.com/forms/d/e/XXXX/viewform",
  "formEmbed": true,
  "code": "NEBULA-7",
  "prevCode": "STARSHIP7",
  "questions": [
    { "cipherType": "Aristocrat", "aristoType": "K1", "questionText": "…", "cipherText": "…", "correctAnswer": "…", "revealKeyword": "PASSWORD1" }
  ]
}
```

`relay` is only needed when more than one relay exists. The round count comes from
`questions.length`; `needed` defaults to all-but-one; `formEmbed` defaults to `true`.

---

## 6. Add links to Optional Resources

`course-information/optional-resources.html` is a hand-edited list. Copy an existing
`<li>` block and swap the `href`, title, and description. Placeholder entries use
`href="#"` with `aria-disabled="true"` and a "soon" tag; replace those when a link is ready.

---

## 7. How navigation works (hand-editing is fine)

`assets/js/nav.js` is the single source of truth; `assets/js/site.js` renders the
header, dropdowns, footer, and day hubs from it on every page. The generators edit it
automatically, but it is plain data:

```js
{ label: "Contact", href: "/contact.html" }                      // plain link
{ label: "Course Info", children: [ ... ] }                      // dropdown
{ label: "Day 1", href: "/daily-questions/day-1/", children: [ ... ] }  // collapsible day
```

A group inside a dropdown (like a Day) renders as a collapsible section, closed by
default, so the menu stays short as days accumulate. The `kicker` and `desc` fields on
day children feed the card grid on each day hub page.

---

## Where things live

```
assets/img/instructors/   Instructor photos (homepage + contact page)
assets/img/scio-logo.svg  White ScioVirtual logo (header + footer)
assets/css/base.css       Design tokens and site-wide styles
assets/css/cipher.css     Solver widget styles
assets/css/relay.css      Relay race styles (home, rounds, code gate, finish)
assets/js/cipher-engine.js  The interactive solver engine
assets/js/relay.js        Relay runtime (reads each page's relay-config; renders rounds, drives the gate)
tools/relaycrypto.mjs     Code→link obfuscation (mirrored, byte-for-byte, in relay.js)
tools/add-relay.mjs · add-relay-round.mjs  Relay scaffold + round generators
tools/templates/          The HTML skeletons the generators fill in
```
