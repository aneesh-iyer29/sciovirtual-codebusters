# ScioVirtual Codebusters

The course site for **ScioVirtual Advanced Codebusters** (ScioCamp 2026): a modern,
static rebuild of the old Google Sites page, with the cipher tools baked in as
first-class interactive templates and a one-command way to add new questions

- **No build step, no framework.** Plain HTML/CSS/JS. Edit files, push, done.
- **Interactive solvers.** Aristocrat, Affine, Porta, Hill, Baconian, Nihilist,
  Checkerboard, Fractionated Morse and more; students type answers and check them live.
- **Add questions from the terminal.** `npm run add:question` writes the page *and*
  links it into the navigation for you. 

> **Full instructor guide:** see [`tools/README.md`](tools/README.md) for step-by-step
> recipes (adding questions, pages, slides/recordings, and resource links).

---

## Run it locally

You need [Node.js](https://nodejs.org) 18+ (for the generator scripts). Then, from the repo root:

```bash
npm start            # serves the site at http://localhost:8000  (uses python3)
# or, if you don't have python:
npm run serve        # serves with `npx serve`
```

Open <http://localhost:8000>. The site **must be served over http** (not opened as a
`file://` path) because it loads JavaScript modules.

---

## Add a new question  (the common task)

```bash
npm run add:question
```

It asks you, one line at a time, for:

| Prompt | Example |
| --- | --- |
| Cipher type | `Aristocrat`, `Affine`, `Baconian`, ... |
| Aristocrat type (if applicable) | `K1` / `K2` / `Normal` |
| Question prompt | *"Solve this K1 Aristocrat. What does it say?"* |
| Cipher text | the encoded text students see |
| Correct answer | the decoded plaintext |
| Reveal keyword | shown when the student solves it |
| Day number | `1`, `2`, ... |
| Day card kicker / description | only for a new day — the card shown on the Daily Questions overview |
| Title / slug / intro | naming for the page + nav link |

It then:

1. **Creates the page** at `daily-questions/day-<n>/<slug>.html`.
2. **Creates the day hub** (`day-<n>/index.html`) the first time you use a new day, and fills that day's overview card (kicker + description).
3. **Links it into the nav** under *Daily Questions > Day N*.

Preview it at the URL it prints, then `git add . && git commit && git push`.

> Don't have the cipher text yet? Use the **encoders** (see below) to turn a plaintext
> quote into cipher text first, then paste the result into the generator.

### Non-interactive (from a file)

```bash
node tools/add-question.mjs --json my-question.json
```

```json
{
  "cipherType": "Aristocrat", "aristoType": "K1",
  "questionText": "Solve this K1 Aristocrat. What does it say?",
  "cipherText": "QGA BESBLQBFA ...",
  "correctAnswer": "THE ADVANTAGE ...",
  "revealKeyword": "AEROSPACE",
  "day": "2", "title": "Aristocrat #1", "slug": "aristocrat-1",
  "lead": "Warm up with an easy one."
}
```

**Supported `cipherType` values:** `Aristocrat`, `Patristocrat`, `Xenocrypt`, `Affine`,
`Caesar`, `Atbash`, `Vigenere`, `Hill`, `Porta`, `Baconian`, `Nihilist`,
`Checkerboard`, `Fractionated Morse`, `Homophonic`.

---

## Add any other page (a Form, Doc, Slides deck, video, or pasted embed)

```bash
npm run add:page
```

Give it a title, pick where it goes in the nav, and provide **either** an iframe URL
(Google Form / Doc / Slides / YouTube / Drive) **or** a file containing pasted embed HTML.
It builds the themed page and adds the nav link.

For pasted embed code, save it to a file first (e.g. `embed.html`) and point the tool
at it, or pass everything via `--json` with an `embedFile` / `embedHtml` / `url` field.

---

## Add a homework assignment

```bash
npm run add:homework
```

Publishes a homework set on the **Homework** page from a PDF plus a submission-form link.
It copies your PDF into `assets/hw/` (with a URL-safe name), builds the card — clipped
preview, download button, "view full PDF", and the submission link — and appends it to the
list. It does **not** create a page or a nav entry (the Homework page already exists), and it
does **not** create the Google Form: you make the form and paste its share URL.

Give it the PDF's path on your machine, a day number, a title, and the form URL. Batch mode:

```bash
node tools/add-homework.mjs --json my-homework.json   # {pdf, day, title, desc, formUrl}
```

See [`tools/README.md`](tools/README.md) for the full field list and the `--dry` / `--force` flags.

---

## Add a day's slides & recording

```bash
npm run add:recording
```

Creates (or updates) the **Day N** page under **Slides & Recordings** from two Google links —
the Drive recording and the Slides deck. It builds the inline video/slides previews with
"open in Google Drive/Slides" buttons, writes `slides-recordings/day-N.html` (replacing it if
it already exists), and adds/refreshes the nav entry. You host the files on Google; the tool
only embeds and links them, so share both as "Anyone with the link → Viewer".

```bash
node tools/add-recording.mjs --json my-recording.json   # {recording, slides, day}
```

See [`tools/README.md`](tools/README.md) for details and the `--dry` flag.

---

## How it fits together

```
index.html                     Home (hero, quick links, instructors, intro video)
contact.html · 404.html
course-information/            Course plan, homework, resources, attendance
slides-recordings/             Per-day slides + recordings (day-1.html is pending)
daily-questions/day-1/         Walkthroughs, warm-up, practice set (interactive)
assets/
  css/base.css                 Design system (colors, type, nav, footer, cards)
  css/cipher.css               Styling for the interactive solvers
  hw/                          Homework PDFs (served at /assets/hw/…)
  img/                         Logo, favicon, instructor photos
  js/nav.js                    <- single source of truth for navigation
  js/site.js                   Renders the header/nav/footer on every page
  js/cipher-engine.js          The solver engine (all cipher types)
tools/
  README.md                    Step-by-step instructor guide for all of this
  add-question.mjs             Generator: new question page + nav link
  add-page.mjs                 Generator: new embed page + nav link
  add-homework.mjs             Generator: homework card (PDF + form) on the Homework page
  add-recording.mjs            Generator: Day N slides & recording page + nav link
  navlib.mjs · templates/      Shared helpers + page templates
  encoders/                    Instructor tools: plaintext -> cipher text + embed
```

### Navigation

`assets/js/nav.js` defines the whole menu. `site.js` renders it on every page, so you
never hand-edit a header. The generators edit `nav.js` for you, but it's plain data,
so hand-editing is completely fine. Each entry is `{ label, href }` for a link or
`{ label, href?, children: [...] }` for a dropdown group. Day groups inside a dropdown
render as collapsible sections (closed by default) so the menu stays short as the
course grows.

### The encoders (`tools/encoders/`)

The instructor-facing tools from `code-site-encoders`, re-themed to match the site.
Open any of them locally (e.g. <http://localhost:8000/tools/encoders/>) to turn a
plaintext quote into cipher text, a frequency table, and LaTeX. Take the cipher text +
answer and publish it with `npm run add:question`.

---

## Deploy

The site is static, so any host works, and both configs are checked in:

- **Netlify** (`netlify.toml`): point Netlify at this repo. No build command,
  publish directory `.`.
- **Vercel** (`vercel.json`): import the repo in Vercel (or run `npx vercel`).
  Framework preset "Other", no build command, output directory `.`. The custom
  `404.html` is picked up automatically.

All links are root-absolute, so serve from the domain root (this also means
GitHub Pages works only on a custom domain or `<user>.github.io` root site).

---

## Design notes

The design matches [sciovirtual.org](https://www.sciovirtual.org/) exactly: flat blue
`#3b53d9` header/hero, teal `#44cab2` accents, `#202525` footer, white surfaces,
**Poppins** headings with **Lato** body text, pill buttons with 3px borders, and the
real ScioVirtual logo (`assets/img/scio-logo.svg`). **Space Mono** appears only inside
the solvers, where it renders ciphertext. All of it is token-driven in
`assets/css/base.css`.
