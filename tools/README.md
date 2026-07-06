# Instructor tools: adding questions, pages, and resources

Everything on this site is plain HTML, but you should almost never write it by hand.
The two generators in this folder create themed pages and wire them into the site
navigation for you. Run them from the **repo root** with Node 18+.

```bash
npm start             # serve the site at http://localhost:8000 (needed to preview)
npm run add:question  # new interactive cipher question
npm run add:page      # new page from any embed (Form, Doc, Slides, video)
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

## 3. Post slides and a recording for a day

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

## 4. Add links to Optional Resources

`course-information/optional-resources.html` is a hand-edited list. Copy an existing
`<li>` block and swap the `href`, title, and description. Placeholder entries use
`href="#"` with `aria-disabled="true"` and a "soon" tag; replace those when a link is ready.

---

## 5. How navigation works (hand-editing is fine)

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
