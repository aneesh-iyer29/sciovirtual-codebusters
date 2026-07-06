/* =========================================================================
   site.js: renders the shared header, navigation and footer on every page
   from assets/js/nav.js.
   Loaded as: <script type="module" src="/assets/js/site.js"></script>
   ========================================================================= */
import { NAV, NAV_CTA, FOOTER } from "/assets/js/nav.js";

/* ---- path helpers ---- */
const norm = (p) => {
  try { p = new URL(p, location.origin).pathname; } catch { /* keep p */ }
  p = p.replace(/index\.html$/, "");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
};
const here = norm(location.pathname);
const isCurrent = (href) => href && norm(href) === here;
const containsCurrent = (node) =>
  isCurrent(node.href) || (node.children || []).some(containsCurrent);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---- dropdown menu (one optional level of sub-groups) ---- */
function menuHTML(item) {
  // When the parent itself is a real page, expose it as an "Overview" link so it's
  // reachable on touch/mobile (where tapping the parent only toggles the submenu).
  const overview = item.href
    ? `<li><a href="${esc(item.href)}"${isCurrent(item.href) ? ' aria-current="page"' : ""}>Overview</a></li>`
    : "";
  const items = item.children.map((c) => {
    if (c.children) {
      // Collapsible sub-group (e.g. a Day): closed by default so the menu stays
      // short as days accumulate; opens automatically on that day's own pages.
      const label = c.href
        ? `<a href="${esc(c.href)}"${isCurrent(c.href) ? ' aria-current="page"' : ""}>${esc(c.label)}</a>`
        : `<span>${esc(c.label)}</span>`;
      const subs = c.children.map((s) =>
        `<li><a href="${esc(s.href)}"${isCurrent(s.href) ? ' aria-current="page"' : ""}>${esc(s.label)}</a></li>`
      ).join("");
      return `<li class="sub-group"><details${containsCurrent(c) ? " open" : ""}>
        <summary>${label}<i class="caret" aria-hidden="true"></i></summary>
        <ul class="sub-menu">${subs}</ul>
      </details></li>`;
    }
    return `<li><a href="${esc(c.href)}"${isCurrent(c.href) ? ' aria-current="page"' : ""}>${esc(c.label)}</a></li>`;
  }).join("");
  return `<ul class="nav-menu">${overview}${items}</ul>`;
}

function navItemHTML(item) {
  if (!item.children) {
    return `<li class="nav-item"><a class="nav-link" href="${esc(item.href)}"${isCurrent(item.href) ? ' aria-current="page"' : ""}>${esc(item.label)}</a></li>`;
  }
  // Only the exact-match page gets aria-current; an ancestor of the current page
  // gets a visual-only class so there is never more than one aria-current on a page.
  const exact = isCurrent(item.href);
  const cur = exact ? ' aria-current="page"' : "";
  const cls = !exact && containsCurrent(item) ? " is-current" : "";
  const href = item.href ? esc(item.href) : "#";
  return `<li class="nav-item">
    <a class="nav-link${cls}" href="${href}"${cur} aria-haspopup="true" aria-expanded="false">
      ${esc(item.label)}<i class="caret" aria-hidden="true"></i>
    </a>${menuHTML(item)}</li>`;
}

function renderHeader() {
  const skip = document.createElement("a");
  skip.className = "skip";
  skip.href = "#main";
  skip.textContent = "Skip to content";

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="wrap nav">
      <a class="brand" href="/">
        <img class="brand-logo" src="/assets/img/scio-logo.svg" alt="" width="36" height="36">
        <span class="brand-text"><b>ScioVirtual</b><span>Codebusters</span></span>
      </a>
      <button class="nav-toggle" aria-label="Menu" aria-expanded="false" aria-controls="nav-links"><span></span></button>
      <ul class="nav-links" id="nav-links">
        ${NAV.map(navItemHTML).join("")}
        ${NAV_CTA ? `<li class="nav-item"><a class="nav-cta" href="${esc(NAV_CTA.href)}">${esc(NAV_CTA.label)}</a></li>` : ""}
      </ul>
    </div>`;

  document.body.insertAdjacentElement("afterbegin", skip);
  skip.insertAdjacentElement("afterend", header);

  /* mobile toggle */
  const toggle = header.querySelector(".nav-toggle");
  const links = header.querySelector(".nav-links");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  /* dropdown parents: click toggles on touch / mobile, and toggles submenu open on small screens */
  header.querySelectorAll(".nav-item").forEach((item) => {
    const link = item.querySelector(":scope > .nav-link");
    const hasMenu = item.querySelector(":scope > .nav-menu");
    if (!hasMenu) return;
    const sync = (v) => link.setAttribute("aria-expanded", v ? "true" : "false");
    link.addEventListener("click", (e) => {
      // On small screens (or when the link is just a menu opener) toggle instead of navigating.
      const mobile = window.matchMedia("(max-width: 1024px)").matches;
      if (mobile || link.getAttribute("href") === "#") {
        e.preventDefault();
        sync(item.classList.toggle("open"));
      }
    });
    // Keep aria-expanded honest with the CSS hover/focus dropdown on desktop.
    item.addEventListener("mouseenter", () => sync(true));
    item.addEventListener("mouseleave", () => { if (!item.classList.contains("open")) sync(false); });
    item.addEventListener("focusin", () => sync(true));
    item.addEventListener("focusout", (e) => { if (!item.contains(e.relatedTarget) && !item.classList.contains("open")) sync(false); });
  });

  const collapseSubmenus = () => header.querySelectorAll(".nav-item.open").forEach((i) => {
    i.classList.remove("open");
    const l = i.querySelector(":scope > .nav-link"); if (l) l.setAttribute("aria-expanded", "false");
  });

  /* close things */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      collapseSubmenus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) {
      links.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      collapseSubmenus();
    }
  });
}

function renderFooter() {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="wrap footer-grid">
      <div class="footer-brand">
        <a class="brand" href="/">
          <img class="brand-logo" src="/assets/img/scio-logo.svg" alt="" width="36" height="36">
          <span class="brand-text"><b>ScioVirtual</b><span style="color:#9aa1a1">Codebusters</span></span>
        </a>
        <p>Home base for ScioVirtual's Advanced Codebusters course: lessons, recordings, and interactive practice you can solve in the browser.</p>
      </div>
      ${FOOTER.map((col) => `
        <nav class="footer-col" aria-label="${esc(col.title)}">
          <h4>${esc(col.title)}</h4>
          <ul>${col.links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join("")}</ul>
        </nav>`).join("")}
    </div>
    <div class="wrap footer-bottom">
      <span>Built by the ScioVirtual Codebusters team · ScioCamp 2026</span>
      <a href="https://www.sciovirtual.org/">sciovirtual.org</a>
    </div>`;
  document.body.appendChild(footer);
}

/* ---- data-driven day/section hub: lists this page's NAV children as cards ---- */
function dayList() {
  const mount = document.querySelector("[data-day-list]");
  if (!mount) return;
  let found = null;
  const walk = (nodes) => nodes.forEach((n) => {
    if (n.children) { if (n.href && norm(n.href) === here) found = n; walk(n.children); }
  });
  walk(NAV);
  if (!found) { mount.innerHTML = ""; return; }
  mount.classList.add("day-nav");
  mount.innerHTML = found.children.map((c) => `
    <a class="card card-link" href="${esc(c.href)}">
      ${c.kicker ? `<span class="k">${esc(c.kicker)}</span>` : ""}
      <h3>${esc(c.label)}</h3>
      ${c.desc ? `<p>${esc(c.desc)}</p>` : ""}
      <span class="go">Open →</span>
    </a>`).join("");
}

/* ---- boot ---- */
function boot() {
  renderHeader();
  renderFooter();
  dayList();
  const y = document.getElementById("year");
  if (y) y.textContent = "2026";
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
