/* =========================================================================
   Navigation: single source of truth for the whole site.
   Rendered at runtime by site.js. Edited automatically by tools/add-question.mjs
   and tools/add-page.mjs. You can also edit it by hand: each entry is
   { label, href } for a link, or { label, href?, children:[...] } for a group.
   A child that itself has `children` renders as a labelled sub-group.
   ========================================================================= */

export const SITE = {
  name: "ScioVirtual Codebusters",
  short: "Codebusters",
  tagline: "Advanced Codebusters · ScioCamp 2026",
  mark: "0x",
};

export const NAV = [
  { label: "Home", href: "/" },

  { label: "Course Info", children: [
    { label: "Course Plan",        href: "/course-information/course-plan.html" },
    { label: "Homework",           href: "/course-information/homework.html" },
    { label: "Optional Resources", href: "/course-information/optional-resources.html" },
    { label: "Attendance",         href: "/course-information/attendance-form.html" },
  ] },

  { label: "Slides & Recordings", children: [
    { label: "Day 1", href: "/slides-recordings/day-1.html" },
  ] },

  { label: "Daily Questions", href: "/daily-questions/", children: [
    { label: "Day 1", href: "/daily-questions/day-1/", kicker: "Day 1 · Aristocrats", desc: "K1 & K2 walkthroughs, a warm-up, and a six-problem interactive practice set.", children: [
      { label: "K1 Walkthrough", href: "/daily-questions/day-1/k1-walkthrough.html", kicker: "Walkthrough · K1", desc: "How to crack a K1 Aristocrat with frequency analysis, from first letter to keyword." },
      { label: "K2 Walkthrough", href: "/daily-questions/day-1/k2-walkthrough.html", kicker: "Walkthrough · K2", desc: "The K2 twist: reading the keyword straight off the frequency table." },
      { label: "Warm-up",        href: "/daily-questions/day-1/warmup.html", kicker: "Warm-up", desc: "One short Aristocrat to get your eye in before the practice set." },
      { label: "Practice",       href: "/daily-questions/day-1/practice.html", kicker: "Practice · set of 6", desc: "Six interactive problems across Affine, Porta, Nihilist, Checkerboard, Baconian, and Fractionated Morse." },
    ] },
  ] },

  { label: "Contact", href: "/contact.html" },
];

/* Header call-to-action button */
export const NAV_CTA = { label: "Start Day 1", href: "/daily-questions/day-1/" };

/* Footer columns */
export const FOOTER = [
  { title: "Explore", links: [
    { label: "Home",            href: "/" },
    { label: "Course Plan",     href: "/course-information/course-plan.html" },
    { label: "Daily Questions", href: "/daily-questions/day-1/" },
    { label: "Contact",         href: "/contact.html" },
  ] },
  { title: "Resources", links: [
    { label: "Optional Resources", href: "/course-information/optional-resources.html" },
    { label: "Homework",           href: "/course-information/homework.html" },
    { label: "Attendance",         href: "/course-information/attendance-form.html" },
    { label: "ScioVirtual.org",    href: "https://www.sciovirtual.org/" },
  ] },
  { title: "Contact", links: [
    { label: "aneesh.iyer29@gmail.com",  href: "mailto:aneesh.iyer29@gmail.com" },
    { label: "arthur.armaing@gmail.com", href: "mailto:arthur.armaing@gmail.com" },
    { label: "sciocamp@gmail.com",       href: "mailto:sciocamp@gmail.com" },
  ] },
];
