/* =========================================================================
   Navigation: single source of truth for the whole site.
   Rendered at runtime by site.js. Edited by tools/add-question.mjs and
   tools/add-page.mjs, but it's plain data, so hand-editing is fine too.
   Each entry is { label, href } for a link, or { label, href?, children:[...] }
   for a group. A child that itself has children renders as a labelled sub-group.
   ========================================================================= */

export const SITE = {
  "name": "ScioVirtual Codebusters",
  "short": "Codebusters",
  "tagline": "Advanced Codebusters · ScioCamp 2026",
  "mark": "0x"
};

export const NAV = [
  {
    "label": "Home",
    "href": "/"
  },
  {
    "label": "Course Info",
    "children": [
      {
        "label": "Course Plan",
        "href": "/course-information/course-plan.html"
      },
      {
        "label": "Homework",
        "href": "/course-information/homework.html"
      },
      {
        "label": "Optional Resources",
        "href": "/course-information/optional-resources.html"
      },
      {
        "label": "Attendance",
        "href": "/course-information/attendance-form.html"
      }
    ]
  },
  {
    "label": "Slides & Recordings",
    "children": [
      {
        "label": "Day 1",
        "href": "/slides-recordings/day-1.html"
      },
      {
        "label": "Day 2",
        "href": "/slides-recordings/day-2.html"
      }
    ]
  },
  {
    "label": "Daily Questions",
    "href": "/daily-questions/",
    "children": [
      {
        "label": "Day 1",
        "href": "/daily-questions/day-1/",
        "kicker": "Day 1 · Aristocrats",
        "desc": "K1 & K2 walkthroughs, a warm-up, and an interactive practice set.",
        "children": [
          {
            "label": "K1 Walkthrough",
            "href": "/daily-questions/day-1/k1-walkthrough.html",
            "kicker": "Walkthrough · K1",
            "desc": "A K1 Aristocrat to solve live. Message an instructor with the keyword once done."
          },
          {
            "label": "K2 Walkthrough",
            "href": "/daily-questions/day-1/k2-walkthrough.html",
            "kicker": "Walkthrough · K2",
            "desc": "A K2 Aristocrat to solve live, as fast as you can."
          },
          {
            "label": "Warm-up",
            "href": "/daily-questions/day-1/warmup.html",
            "kicker": "Warm-up",
            "desc": "One short Aristocrat to get your eye in before the practice set."
          },
          {
            "label": "Practice",
            "href": "/daily-questions/day-1/practice.html",
            "kicker": "Practice · K1 & K2",
            "desc": "Two Aristocrats to decode; work out each keyword and send it to an instructor."
          }
        ]
      },
      {
        "label": "Day 2",
        "href": "/daily-questions/day-2/",
        "kicker": "Day 2 · Porta & Columnar",
        "desc": "A warm-up on the Porta cipher to get your eye in.",
        "children": [
          {
            "label": "Warm-up",
            "href": "/daily-questions/day-2/warmup.html",
            "kicker": "Warm-up",
            "desc": "One short Porta cipher to get your eye in; type your answer and check it live."
          },
          {
            "label": "\"Porta Crypt Walkthrough\"",
            "href": "/daily-questions/day-2/porta-walkthrough.html",
            "kicker": "Walkthrough · Porta",
            "desc": "Type your answer under each cipher letter, then check it."
          },
          {
            "label": "Porta Question 1",
            "href": "/daily-questions/day-2/porta-question-1.html",
            "kicker": "Porta",
            "desc": "Type your answer under each cipher letter, then check it."
          }
        ]
      }
    ]
  },
  {
    "label": "Contact",
    "href": "/contact.html"
  }
];

export const NAV_CTA = {
  "label": "Start Day 1",
  "href": "/daily-questions/day-1/"
};

export const FOOTER = [
  {
    "title": "Explore",
    "links": [
      {
        "label": "Home",
        "href": "/"
      },
      {
        "label": "Course Plan",
        "href": "/course-information/course-plan.html"
      },
      {
        "label": "Daily Questions",
        "href": "/daily-questions/day-1/"
      },
      {
        "label": "Contact",
        "href": "/contact.html"
      }
    ]
  },
  {
    "title": "Resources",
    "links": [
      {
        "label": "Optional Resources",
        "href": "/course-information/optional-resources.html"
      },
      {
        "label": "Homework",
        "href": "/course-information/homework.html"
      },
      {
        "label": "Attendance",
        "href": "/course-information/attendance-form.html"
      },
      {
        "label": "ScioVirtual.org",
        "href": "https://www.sciovirtual.org/"
      }
    ]
  },
  {
    "title": "Contact",
    "links": [
      {
        "label": "aneesh.iyer29@gmail.com",
        "href": "mailto:aneesh.iyer29@gmail.com"
      },
      {
        "label": "arthur.armaing@gmail.com",
        "href": "mailto:arthur.armaing@gmail.com"
      },
      {
        "label": "sciocamp@gmail.com",
        "href": "mailto:sciocamp@gmail.com"
      }
    ]
  }
];
