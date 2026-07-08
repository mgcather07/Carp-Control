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

// Always land at the top on load/refresh — disable the browser's scroll
// restoration and strip any leftover #section hash that would jump the page.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("load", () => {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  window.scrollTo(0, 0);
});

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
    name: "4-Hour Charter",
    meta: "≈ 4 hours on the water",
    price: "$150",
    priceUnit: "/ per person",
    note: "$450 trip minimum",
    features: ["All gear provided", "Great for first-timers", "Each additional hour $100"],
    cta: "Book This Trip",
    featured: false
  },
  {
    order: 2,
    name: "7-Hour Charter",
    meta: "≈ 7 hours on the water",
    price: "$225",
    priceUnit: "/ per person",
    note: "$675 trip minimum",
    desc: "Our most popular way to run it. More time, more water, more shots — the complete bowfishing experience.",
    features: ["All gear provided", "Extended hours for more fun"],
    cta: "Book This Trip",
    featured: true
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
let galleryPhotos = [];   // photos with a url, in display order (for the lightbox)

function renderGallery(items) {
  const grid = $("#gallery-grid");
  if (!grid) return;
  grid.innerHTML = "";
  galleryPhotos = [];
  items.forEach((item) => {
    if (item.placeholder || !item.url) {
      const ph = el("div", { className: "gallery-item gallery-ph", title: "Add a photo" });
      ph.innerHTML = CAMERA_SVG;
      grid.append(ph);
      return;
    }
    const idx = galleryPhotos.length;
    galleryPhotos.push({ url: item.url, caption: item.caption ? esc(item.caption) : "" });

    const fig = el("figure", {
      className: "gallery-item gallery-clickable",
      tabIndex: 0,
      role: "button",
      title: "Click to enlarge"
    });
    fig.setAttribute("aria-label", item.caption ? esc(item.caption) : "Enlarge photo");
    fig.dataset.idx = String(idx);
    fig.append(el("img", {
      src: item.url,
      alt: item.caption ? esc(item.caption) : "Bowfishing trip photo",
      loading: "lazy"
    }));
    if (item.caption) fig.append(el("figcaption", {}, esc(item.caption)));
    grid.append(fig);
  });

  // Mobile marquee — one row, auto-scrolling right-to-left. Duplicate the set for a
  // seamless loop, and skip the boat (it lives in the hero on mobile).
  const track = $("#gallery-track");
  if (track) {
    track.innerHTML = "";
    const hasMarquee = galleryPhotos.some((p) => !p.url.includes("/gallery/g5.jpg"));
    if (hasMarquee) {
      // Keep each photo's index into galleryPhotos so a tap opens the right lightbox slide.
      const buildSet = () => galleryPhotos.forEach((p, idx) => {
        if (p.url.includes("/gallery/g5.jpg")) return;
        const img = el("img", {
          className: "marquee-img",
          src: p.url,
          alt: p.caption || "Bowfishing trip photo",
          loading: "lazy"
        });
        img.dataset.idx = String(idx);
        track.append(img);
      });
      buildSet();
      buildSet();
    }
  }
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
    const phone = form.phone.value.trim();
    const message = form.message.value.trim();
    if (!name || !phone || !message) {
      status.className = "form-status err";
      status.textContent = "Please add your name, phone number, and a short message.";
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
//  Gallery lightbox (click a photo to enlarge)
// ============================================================
const lightbox = (() => {
  let currentIdx = 0;
  let lastFocused = null;

  // Build the overlay once and reuse it.
  const overlay = el("div", { className: "lightbox", id: "lightbox" });
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Photo viewer");
  overlay.innerHTML = `
    <button class="lb-close" aria-label="Close">&times;</button>
    <button class="lb-nav lb-prev" aria-label="Previous photo">&#8249;</button>
    <figure class="lb-figure">
      <img class="lb-img" alt="" />
      <figcaption class="lb-caption"></figcaption>
    </figure>
    <button class="lb-nav lb-next" aria-label="Next photo">&#8250;</button>
    <span class="lb-counter"></span>`;
  document.body.append(overlay);

  const imgEl = $(".lb-img", overlay);
  const capEl = $(".lb-caption", overlay);
  const counterEl = $(".lb-counter", overlay);
  const prevBtn = $(".lb-prev", overlay);
  const nextBtn = $(".lb-next", overlay);
  const closeBtn = $(".lb-close", overlay);

  function show(idx) {
    if (!galleryPhotos.length) return;
    currentIdx = (idx + galleryPhotos.length) % galleryPhotos.length;
    const photo = galleryPhotos[currentIdx];
    imgEl.src = photo.url;
    imgEl.alt = photo.caption || "Bowfishing trip photo";
    capEl.textContent = photo.caption || "";
    capEl.style.display = photo.caption ? "" : "none";
    counterEl.textContent = `${currentIdx + 1} / ${galleryPhotos.length}`;
    const multi = galleryPhotos.length > 1;
    prevBtn.style.display = nextBtn.style.display = multi ? "" : "none";
  }

  function open(idx) {
    lastFocused = document.activeElement;
    show(idx);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  }

  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    imgEl.src = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  const next = () => show(currentIdx + 1);
  const prev = () => show(currentIdx - 1);

  closeBtn.addEventListener("click", close);
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  // Click on the backdrop (not the image or a button) closes.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.classList.contains("lb-figure")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
  });

  return { open };
})();

// Open the lightbox when a gallery photo is clicked or activated via keyboard.
const galleryGrid = $("#gallery-grid");
if (galleryGrid) {
  galleryGrid.addEventListener("click", (e) => {
    const fig = e.target.closest(".gallery-clickable");
    if (fig) lightbox.open(Number(fig.dataset.idx));
  });
  galleryGrid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const fig = e.target.closest(".gallery-clickable");
    if (fig) { e.preventDefault(); lightbox.open(Number(fig.dataset.idx)); }
  });
}

// Mobile marquee — tap a photo to open it full-screen in the lightbox.
const marquee = $("#gallery-marquee");
if (marquee) {
  marquee.addEventListener("click", (e) => {
    const img = e.target.closest(".marquee-img");
    if (img && img.dataset.idx != null) lightbox.open(Number(img.dataset.idx));
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
}

// Footer year
const yearEl = $("#year");
if (yearEl) yearEl.textContent = new Date().getFullYear();
