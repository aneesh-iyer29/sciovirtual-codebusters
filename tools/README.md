# Instructor tools: adding questions, pages, and resources

Everything on this site is plain HTML, but you should almost never write it by hand.
The two generators in this folder create themed pages and wire them into the site
navigation for you. Run them from the **repo root** with Node 18+.

```bash
npm start             # serve the site at http://localhost:8000 (needed to preview)
npm run add:question  # new interactive cipher question
npm run add:page      # new page from any embed (Form, Doc, Slides, video)
npm run add:homework  # new homework assignment (PDF + submission form) on the Homework page
```

---

## 1. Add an interactive cipher question

```bash
npm run add:question
```

Answer the prompts:

| Prompt | What to enter |
| --- | --- |
| Cipher type | `Aristocrat`, `Patristocrat`, `Xenocrypt`, `Affine`, `Caesar`, `Atbash`, `Vigenere`, `Hill`, `Porta`, `Baconian`, `Nihilist`, `Checkerboard`, `Fractionated Morse` |
| Aristocrat type | `K1`, `K2`, or `Normal` (only asked for Aristocrat-family ciphers) |
| Question prompt | The text shown above the puzzle grid |
| Cipher text | The encoded text, exactly as students should see it |
| Correct answer | The decoded plaintext (checking ignores punctuation and case) |
| Reveal keyword | A fun keyword shown when the student solves it |
| Day number | `1`, `2`, ... (a new day auto-creates the day hub page) |
| Title / slug / intro | How the page is named and linked |

The script then:

1. creates `daily-questions/day-<n>/<slug>.html`,
2. creates `daily-questions/day-<n>/index.html` if this is the first question of that day, and
3. adds the link under **Daily Questions > Day N** in `assets/js/nav.js`.

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
  "lead": "Warm up with an easy one."
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

Each day has a page in `slides-recordings/` (e.g. `day-1.html`). It ships as a
"Coming soon" placeholder with the real embed markup already in an HTML comment:

1. Open the day's file and delete the `<div class="soon">...</div>` block.
2. Uncomment the embed blocks below it and paste your Google Slides embed URL and
   the Drive/YouTube video URL.

For a **new** day, copy `day-1.html` to `day-<n>.html`, update the "Day 1" text, and
add the nav entry in `assets/js/nav.js`:

```js
{ label: "Slides & Recordings", children: [
  { label: "Day 1", href: "/slides-recordings/day-1.html" },
  { label: "Day 2", href: "/slides-recordings/day-2.html" },
] },
```

(Or just run `npm run add:page` with the video URL and file it under Slides & Recordings.)

---

## 5. Add links to Optional Resources

`course-information/optional-resources.html` is a hand-edited list. Copy an existing
`<li>` block and swap the `href`, title, and description. Placeholder entries use
`href="#"` with `aria-disabled="true"` and a "soon" tag; replace those when a link is ready.

---

## 6. How navigation works (hand-editing is fine)

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
assets/js/cipher-engine.js  The interactive solver engine
tools/templates/          The HTML skeletons the generators fill in
```
