// ============================================================
//  Carp Control Bowfishing Charters — front-end app
//  Reads editable content (trips, gallery, contact) from RTDB
//  and writes trip-request messages to RTDB.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase, ref, onValue, push, set, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---------- Small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const k of kids) node.append(k?.nodeType ? k : document.createTextNode(k ?? ""));
  return node;
};
const esc = (s) => String(s ?? "");
function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
}

// ============================================================
//  Fallback content (used when RTDB has nothing yet).
//  Mirrors seed/content.json. Once /content is populated, that wins.
// ============================================================
const FALLBACK_TRIPS = [
  {
    order: 1,
    name: "4-Hour Night Charter",
    meta: "≈ 4 hours on the water",
    price: "$150",
    priceUnit: "/ per person",
    note: "3-person minimum · $450",
    desc: "A perfect intro run. We hit the shallows under the lights and put you on fish fast.",
    features: ["All gear provided", "Great for first-timers", "Up to 3 shooters included"],
    cta: "Book This Trip",
    featured: false
  },
  {
    order: 2,
    name: "Full-Night Charter",
    meta: "Add hours to the 4-hour run",
    price: "+$100",
    priceUnit: "/ per extra hour",
    note: "Stack hours for prime shooting",
    desc: "Our most popular way to run it. More time, more water, more shots — the complete bowfishing experience.",
    features: ["Everything in the 4-hour charter", "Extend the night, hour by hour", "Prime late-night bite window"],
    cta: "Book This Trip",
    featured: true
  },
  {
    order: 3,
    name: "Big Group / Custom",
    meta: "Built around your crew",
    price: "Let's Talk",
    priceUnit: "",
    note: "Corporate, bachelor, birthdays",
    desc: "Chasing a specific species, bringing a big group, or planning something special? We'll build the charter around you.",
    features: ["Custom itinerary", "Larger groups welcome", "Species on request"],
    cta: "Get in Touch",
    featured: false
  }
];

const FALLBACK_GALLERY = [
  { placeholder: true }, { placeholder: true }, { placeholder: true },
  { placeholder: true }, { placeholder: true }
];

const CAMERA_SVG =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5" stroke="#8DC63F" stroke-width="1.6"/><path d="M8 7l1.5-2.5h5L16 7" stroke="#8DC63F" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.2" stroke="#8DC63F" stroke-width="1.6"/></svg>';

// ============================================================
//  TRIPS
// ============================================================
function renderTrips(trips) {
  const grid = $("#trips-grid");
  if (!grid) return;
  grid.innerHTML = "";
  trips
    .slice()
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .forEach((t) => {
      const card = el("article", { className: "trip-card" + (t.featured ? " featured" : "") });
      card.append(el("div", { className: "top-bar" }));
      if (t.featured) card.append(el("span", { className: "trip-badge" }, "Most Popular"));
      card.append(el("h3", {}, esc(t.name)));
      if (t.meta) card.append(el("p", { className: "trip-meta" }, esc(t.meta)));

      const priceRow = el("div", { className: "trip-price-row" });
      priceRow.append(el("span", { className: "trip-price" }, esc(t.price)));
      if (t.priceUnit) priceRow.append(el("span", { className: "trip-price-unit" }, esc(t.priceUnit)));
      card.append(priceRow);

      if (t.note) card.append(el("p", { className: "trip-note" }, esc(t.note)));
      if (t.desc) card.append(el("p", { className: "trip-desc" }, esc(t.desc)));

      const feats = Array.isArray(t.features) ? t.features : [];
      if (feats.length) {
        const ul = el("ul", { className: "trip-features" });
        feats.forEach((f) => ul.append(el("li", {}, esc(f))));
        card.append(ul);
      }

      const cta = el("a", {
        className: "btn " + (t.featured ? "btn-primary" : "btn-ghost") + " trip-cta" + (t.featured ? "" : " ghost"),
        href: "#contact"
      }, esc(t.cta || "Book This Trip"));
      card.append(cta);
      grid.append(card);
    });
}

// ============================================================
//  GALLERY
// ============================================================
function renderGallery(items) {
  const grid = $("#gallery-grid");
  if (!grid) return;
  grid.innerHTML = "";
  items.forEach((item) => {
    if (item.placeholder || !item.url) {
      const ph = el("div", { className: "gallery-item gallery-ph", title: "Add a photo" });
      ph.innerHTML = CAMERA_SVG;
      grid.append(ph);
      return;
    }
    const fig = el("figure", { className: "gallery-item" });
    fig.append(el("img", {
      src: item.url,
      alt: item.caption ? esc(item.caption) : "Bowfishing trip photo",
      loading: "lazy"
    }));
    if (item.caption) fig.append(el("figcaption", {}, esc(item.caption)));
    grid.append(fig);
  });
}

// ============================================================
//  CONTACT INFO (phone / email / area) — live from RTDB
// ============================================================
function renderContactInfo(info) {
  if (!info) return;
  if (info.phone) {
    document.querySelectorAll('[data-contact="phone"]').forEach((n) => {
      n.textContent = info.phone;
      if (n.tagName === "A") n.setAttribute("href", "tel:" + info.phone.replace(/[^\d+]/g, ""));
    });
  }
  if (info.email) {
    document.querySelectorAll('[data-contact="email"]').forEach((n) => {
      n.textContent = info.email;
      if (n.tagName === "A") n.setAttribute("href", "mailto:" + info.email);
    });
  }
  if (info.area) {
    document.querySelectorAll('[data-contact="area"]').forEach((n) => { n.textContent = info.area; });
  }
}

// ---------- Wire up live content ----------
onValue(ref(db, "content/trips"), (snap) => {
  const trips = toArray(snap.val());
  renderTrips(trips.length ? trips : FALLBACK_TRIPS);
}, () => renderTrips(FALLBACK_TRIPS));

onValue(ref(db, "content/gallery"), (snap) => {
  const items = toArray(snap.val());
  renderGallery(items.length ? items : FALLBACK_GALLERY);
}, () => renderGallery(FALLBACK_GALLERY));

onValue(ref(db, "content/contact"), (snap) => {
  renderContactInfo(snap.val());
}, () => {});

// ============================================================
//  CONTACT FORM → RTDB
// ============================================================
const form = $("#contact-form");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("#form-status");
    const submit = $("#cf-submit");
    status.className = "form-status";
    status.textContent = "";

    // Honeypot — if filled, silently pretend success (bot).
    if (form.website && form.website.value) {
      status.className = "form-status ok";
      status.textContent = "Thanks! Your request is in.";
      form.reset();
      return;
    }

    const name = form.name.value.trim();
    const message = form.message.value.trim();
    if (!name || !message) {
      status.className = "form-status err";
      status.textContent = "Please add your name and a short message.";
      return;
    }

    const payload = {
      name,
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      tripDate: form.tripDate.value.trim(),
      partySize: form.partySize.value.trim(),
      message,
      createdAt: serverTimestamp()
    };

    submit.disabled = true;
    submit.textContent = "Sending…";
    try {
      const newRef = push(ref(db, "messages"));
      await set(newRef, payload);
      status.className = "form-status ok";
      status.textContent = `Thanks, ${name.split(" ")[0]}! Your request is in — Capt. Justin will get back to you soon.`;
      form.reset();
    } catch (err) {
      console.error("Message submit failed:", err);
      status.className = "form-status err";
      status.textContent = "Sorry, something went wrong. Please call or email us instead.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Send Request";
    }
  });
}

// ============================================================
//  Smooth anchor scrolling (offsets the 74px sticky header)
// ============================================================
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute("href").slice(1);
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  const scroller = document.scrollingElement || document.documentElement;
  const top = target.getBoundingClientRect().top + scroller.scrollTop - 74;
  scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  // Close the mobile nav if a link inside it was tapped.
  if (nav && nav.classList.contains("open") && nav.contains(a)) {
    nav.classList.remove("open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }
});

// ============================================================
//  Mobile nav
// ============================================================
const toggle = $("#nav-toggle");
const nav = $("#main-nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

// Footer year
const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();
