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

// ============================================================
//  Fallback content (used when RTDB has nothing yet).
//  Once you populate /content in the database, that wins.
// ============================================================
const FALLBACK_TRIPS = [
  {
    name: "Half-Night Charter",
    meta: "≈ 4 hours on the water",
    price: "$—",
    priceNote: "up to 3 shooters",
    desc: "A perfect intro run. We hit the shallows under the lights and put you on fish fast.",
    features: ["All gear provided", "Great for first-timers", "Up to 3 shooters"],
    featured: false,
    order: 1
  },
  {
    name: "Full-Night Charter",
    meta: "≈ 6–7 hours on the water",
    price: "$—",
    priceNote: "up to 4 shooters",
    desc: "Our most popular trip. More time, more water, more shots — the complete bowfishing experience.",
    features: ["All gear provided", "Prime hours on the water", "Up to 4 shooters", "Most popular"],
    featured: true,
    order: 2
  },
  {
    name: "Trophy / Custom Trip",
    meta: "Built around your crew",
    price: "$—",
    priceNote: "let's talk",
    desc: "Chasing a specific species, bringing a big group, or planning something special? We'll build it.",
    features: ["Custom itinerary", "Larger groups welcome", "Species on request"],
    featured: false,
    order: 3
  }
];

const FALLBACK_GALLERY = [
  { placeholder: true }, { placeholder: true }, { placeholder: true },
  { placeholder: true }, { placeholder: true }, { placeholder: true }
];

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
      if (t.featured) card.append(el("span", { className: "trip-badge" }, "Most Popular"));
      card.append(el("h3", {}, esc(t.name)));
      if (t.meta) card.append(el("p", { className: "trip-meta" }, esc(t.meta)));
      const price = el("p", { className: "trip-price" }, esc(t.price));
      if (t.priceNote) price.append(el("span", {}, " / " + esc(t.priceNote)));
      card.append(price);
      if (t.desc) card.append(el("p", { className: "trip-desc" }, esc(t.desc)));
      const feats = Array.isArray(t.features) ? t.features : [];
      if (feats.length) {
        const ul = el("ul", { className: "trip-features" });
        feats.forEach((f) => ul.append(el("li", {}, esc(f))));
        card.append(ul);
      }
      const cta = el("a", { className: "btn btn-primary", href: "#contact" }, "Book This Trip");
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
  items.forEach((item, i) => {
    if (item.placeholder || !item.url) {
      grid.append(el("div", { className: "gallery-ph", title: "Add a photo" }, "📷"));
      return;
    }
    const fig = el("figure", { className: "gallery-item" });
    const img = el("img", {
      src: item.url,
      alt: item.caption ? esc(item.caption) : "Bowfishing trip photo",
      loading: "lazy"
    });
    fig.append(img);
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
      n.setAttribute("href", "tel:" + info.phone.replace(/[^\d+]/g, ""));
    });
  }
  if (info.email) {
    document.querySelectorAll('[data-contact="email"]').forEach((n) => {
      n.textContent = info.email;
      n.setAttribute("href", "mailto:" + info.email);
    });
  }
  if (info.area) {
    document.querySelectorAll('[data-contact="area"]').forEach((n) => { n.textContent = info.area; });
  }
}

// ---------- Wire up live content ----------
function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
}

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
      status.textContent = "Thanks! We'll be in touch soon.";
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
      status.textContent = "Thanks! Your request is in — we'll get back to you soon.";
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
//  Mobile nav
// ============================================================
const toggle = $("#nav-toggle");
const nav = $("#main-nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

// Footer year
const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();
