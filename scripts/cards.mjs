// modules/admaps-browser/scripts/cards.mjs
// The site's cards (site/assets/cards.js), ported whole: the same stage with its cross-fading frames and dots, the
// NEW and FREE pills, the project after the title, one line of tags, the same buttons. Two places draw them — the
// shelves and «More like this» under a page — and they must agree, as on the site.
//
// What the site does by its own links is asked of the window instead (data-ab, see browser.mjs): the picture and the
// title open the page in the window, a tag filters, «Sign in with Patreon» signs in by code here, «Download» brings
// the thing into Foundry (data-dl — what it is; install.mjs). Every outward link carries target=_blank — Foundry hands
// those to the system browser and never leaves its own page.

import { L, plural, esc } from "./text.mjs";
import { offerOf, isNew, campaignLook, primaryHome } from "./offer.mjs";

const DWELL = 2800, DWELL_HOVER = 1200;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

// A downward arrow onto a line — only on buttons that actually download something.
export const DL_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>';

export const fmtSize = (b) => `${(b / 1e6).toFixed(1)} MB`;

// The seam: who the visitor is, where the site is, what the cards scroll in.
let CTX = {
  me: () => ({ signedIn: false, can: {} }),
  base: () => "https://admaps.cloud",
  scroller: () => null,
};

export function setCardContext(ctx) {
  CTX = { ...CTX, ...ctx };
}

const ext = 'target="_blank" rel="noopener"';

/** The project after the title: «| ADM», an exclusive says so. The bar is not coloured. */
export function campTag(campId, exclusive) {
  const look = campaignLook(campId);
  return `<span class="proj" style="--c:${look.color}"><i>|</i>${esc(look.short)}${exclusive ? ` ${esc(L("exclusive"))}` : ""}</span>`;
}

/** The FREE pill over a preview — the card's and the page's. */
export function freeTagHtml(r, now, soon) {
  if (now) {
    return r.free.forever
      ? `<div class="freetag"><b>${esc(L("free"))}</b></div>`
      : `<div class="freetag" data-till="${Number(r.free.till)}"><b>${esc(L("free"))}</b><span></span></div>`;
  }
  if (soon) {
    return `<div class="freetag soon"><b>${esc(L("freeSoon"))}</b><span>${new Date(r.free.from).toISOString().slice(5, 10).replace("-", ".")}</span></div>`;
  }
  return "";
}

export function remaining(till) {
  const left = till - Date.now();
  if (left <= 0) return null;
  const h = Math.floor(left / 3600_000);
  if (h >= 48) return plural("left.days", Math.floor(h / 24));
  if (h >= 1) return L("left.hours", { n: h });
  return L("left.minutes", { n: Math.max(1, Math.floor(left / 60_000)) });
}

/** The countdowns under root, once a minute or so; true — a window closed (the buttons must be asked again). */
export function tickFreeTags(root) {
  let anyExpired = false;
  for (const el of root.querySelectorAll(".freetag[data-till]")) {
    const text = remaining(Number(el.dataset.till));
    if (text) el.querySelector("span").textContent = text;
    else { el.remove(); anyExpired = true; }
  }
  return anyExpired;
}

const tagsHtml = (r, isTagOn) => r.tags.map((t) =>
  `<button type="button" data-ab="tag" data-tag="${esc(t)}"${isTagOn(t) ? " data-on" : ""}>${esc(t)}</button>`).join("");

// ------------------------------------------------------------------ cards

/** A backdrop: one picture, the follower of any Patreon (free included) takes both files. */
function backdropCard(r, isTagOn) {
  const el = document.createElement("article");
  el.className = "card";
  const me = CTX.me();
  const b = CTX.base();
  const colors = r.preview?.colors ?? [];
  const page = `${b}/backdrop/${r.backdrop}`;

  // Two files, each straight into the backdrops folder (browser.mjs, data-dl).
  const dl = (kind, label) => (r[kind]
    ? `<button type="button" class="dl" data-ab="take" data-dl="bd:${esc(r.backdrop)}:${kind}">${DL_ICON}<span>${label}</span><em>(${fmtSize(r[kind].bytes)})</em></button>`
    : "");
  const buttons = me.backdrops
    ? dl("webp", "WEBP") + dl("webm", "WEBM")
    : !me.signedIn
      ? `<button type="button" class="dl wide" data-ab="signin">${esc(L("signIn"))}</button>`
      : `<a class="dl wide" href="${esc(primaryHome(me))}" ${ext}>${esc(L("joinFree"))}</a>`;

  el.innerHTML = `
    <a class="stage" href="${esc(page)}" ${ext} data-ab="backdrop" data-key="${esc(r.backdrop)}" style="--tint:${esc(colors[0] ?? "#05070a")}">
      <div class="layer"></div><div class="layer"></div>
      <div class="shade"></div>
      ${isNew(r) ? `<div class="newtag">${esc(L("new"))}</div>` : ""}
      <div class="stagefoot">
        <h3 class="ctitle">${esc(r.title)}</h3>
      </div>
    </a>
    <div class="body">
      <ul class="tags">${tagsHtml(r, isTagOn)}</ul>
      <div class="buttons">${buttons}</div>
    </div>`;
  mountPreview(el, [`${b}/bmedia/${r.backdrop}/preview.webp`], [], colors);
  return el;
}

/** An NPC token: the square portrait, the name, the tags; the token and its buttons live in its window. */
function tokenCard(r, isTagOn) {
  const el = document.createElement("article");
  el.className = "card tkcard";
  const b = CTX.base();
  const v = r.v ? `?v=${encodeURIComponent(r.v)}` : "";
  el.innerHTML = `
    <a class="stage" href="${esc(`${b}/tokens/?t=${r.key}`)}" ${ext} data-ab="token" data-key="${esc(r.key)}">
      <img class="tkthumb" src="${esc(`${b}/tmedia/p/${r.key}.webp${v}`)}" alt="${esc(r.name)}" loading="lazy" decoding="async" draggable="false">
      <div class="shade"></div>
      <div class="stagefoot"><h3 class="ctitle">${esc(r.name)}</h3></div>
    </a>
    <div class="body">
      <ul class="tags">${tagsHtml(r, isTagOn)}</ul>
    </div>`;
  return el;
}

function mapCard(r, isTagOn) {
  const el = document.createElement("article");
  el.className = "card";
  const b = CTX.base();
  const n = r.preview?.frames ?? 1;
  const colors = r.preview?.colors ?? [];
  const names = r.versions.map((v) => v.tags.join(" · "));
  const { me, shop, shopUrl, homeUrl, buyUrl, outsideCircle, badgeNow, badgeSoon, followFree, need, needUrl, campId, families, exists, open } = offerOf(r, CTX.me(), b);
  const page = `${b}/map/${r.release}`;

  // One button for everything the release holds: into Foundry in the format chosen at the gear (browser.mjs, data-dl).
  const allFree = open.length > 0 && open.every((v) => families[v].free);
  const signIn = `<button type="button" class="dl wide" data-ab="signin">${esc(L("signIn"))}</button>`;
  const buttons = open.length
    ? `<button type="button" class="dl" data-ab="take" data-dl="map:${esc(r.release)}"${allFree ? " data-free" : ""}>`
      + `${DL_ICON}<span>${esc(allFree ? L("freeDownload") : L("download"))}</span></button>`
    : followFree && exists.length
      ? (me.signedIn ? `<a class="dl wide" href="${esc(homeUrl)}" ${ext}>${esc(L("joinFree"))}</a>` : signIn)
      : outsideCircle
        ? `<a class="dl wide" href="${esc(buyUrl)}" ${ext}>${esc(L("buy"))}</a>`
        : !me.signedIn
          ? signIn
          : `<a class="dl wide" href="${esc(need ? needUrl : shopUrl)}" ${ext}>`
            + `${esc(need ? L("joinTier", { tier: need.name }) : L("availableOn", { name: shop?.name || "Patreon" }))}</a>`;

  // A post with nothing to download is a poster: the picture is the whole card.
  const teaser = exists.length === 0;
  if (teaser) el.classList.add("teaser");
  el.innerHTML = `
    <a class="stage" href="${esc(page)}" ${ext} data-ab="map" data-key="${esc(r.release)}" style="--tint:${esc(colors[0] ?? "#05070a")}">
      <div class="layer"></div><div class="layer"></div>
      <div class="shade"></div>
      ${freeTagHtml(r, badgeNow, badgeSoon)}
      ${isNew(r) ? `<div class="newtag">${esc(L("new"))}</div>` : ""}
      <div class="stagefoot">
        <h3 class="ctitle">${esc(r.title)}${campTag(campId, r.exclusive)}</h3>
        <div class="dots">${names.slice(0, n).map((v, i) =>
          `<button class="dot" type="button" aria-current="${i === 0}" title="${esc(v)}" data-i="${i}"><i></i></button>`).join("")}
        </div>
      </div>
    </a>${teaser ? "" : `
    <div class="body">
      <ul class="tags">${tagsHtml(r, isTagOn)}</ul>
      <div class="buttons">${buttons}</div>
    </div>`}`;

  mountPreview(el, previewUrls(b, r.release, r.preview), names, colors);
  const ft = el.querySelector(".freetag[data-till]");
  if (ft) ft.querySelector("span").textContent = remaining(Number(ft.dataset.till)) ?? "";
  return el;
}

/** The card of any shelf; isTagOn — which tags wear the accent (the pressed filter, or why a rec is shown). */
export function cardOf(r, isTagOn = () => false) {
  const el = r.tk ? tokenCard(r, isTagOn) : r.backdrop ? backdropCard(r, isTagOn) : mapCard(r, isTagOn);
  const row = el.querySelector(".tags");
  if (row && tagRows) tagRows.observe(row);
  else requestAnimationFrame(() => fitTags(el));
  return el;
}

// ------------------------------------------------------------------ preview
//
// Two shared observers, as on the site — near (300px): fetch the frame and run the cross-fade; far (1500px): drop
// the frames again. Their root is the window's scrolling body, not the screen.

const controllers = new WeakMap();
let observers = null;
// A frame that did not come (the network) is asked for again while its card is near — not left bare till scrolled.
const RETRY_MS = [800, 2000, 5000];

function watch() {
  const root = CTX.scroller?.() ?? null;
  if (observers?.root === root) return observers;
  observers?.near.disconnect();
  observers?.far.disconnect();
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = controllers.get(e.target);
      if (!c) continue;
      c.near = e.isIntersecting;
      if (e.isIntersecting) { c.load(); c.start(); } else c.stop();
    }
  }, { root, rootMargin: "300px" });
  const far = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = controllers.get(e.target);
      if (c && !e.isIntersecting) c.unload();
    }
  }, { root, rootMargin: "1500px" });
  observers = { root, near, far };
  return observers;
}

/** A card going away: its observers and its frames with it. */
export function teardown(card) {
  observers?.near.unobserve(card);
  observers?.far.unobserve(card);
  const c = controllers.get(card);
  if (c) { c.kill(); controllers.delete(card); }
}

/** The window closed: nothing keeps watching. */
export function stopWatching() {
  observers?.near.disconnect();
  observers?.far.disconnect();
  observers = null;
}

/** A map's preview frames; v drops the cache after a re-upload. */
export function previewUrls(b, release, preview) {
  const n = Math.max(1, preview?.frames ?? 1);
  const v = preview?.v ? `?v=${encodeURIComponent(preview.v)}` : "";
  return Array.from({ length: n }, (_, k) => `${b}/media/${release}/preview-${k + 1}.webp${v}`);
}

// Frames already seen while Foundry is open. A card drawn again — a filter, another shelf, back from a page — shows
// them at once, with no fade and no request: the shelf is redrawn whole on every change, and the backdrops' previews
// come without a version in their address (no-cache), so the browser would ask the site for each of them again.
const seen = new Map();   // url → the decoded Image, kept so the browser keeps the picture at hand

/** Has this frame been shown before (and is it at hand). */
export const seenImage = (url) => seen.has(url);

// Pictures being decoded, held until they are: Foundry's page collects garbage all the time (a scene, its videos,
// PIXI), and a detached <img> nothing points to was collected mid-way — its decode() failed and the card stayed bare
// (the top of the shelf in Foundry, 22.10.2026; reproduced in Foundry's own Electron with the collector run every 20 ms).
const decoding = new Set();

/** Decode a picture ahead; null when it did not come (naturalWidth tells a browser quirk from a failure). */
export function decodeImage(url) {
  if (seen.has(url)) return Promise.resolve(seen.get(url));
  const img = new Image();
  decoding.add(img);
  img.src = url;
  return img.decode().then(() => img, () => (img.naturalWidth ? img : null))
    .then((x) => { decoding.delete(img); if (x) seen.set(url, x); return x; });
}

/** Put a frame into an empty layer: faded in the first time, at once when it was seen before. */
export function putFrame(layer, url, known) {
  if (known) layer.style.transition = "none";
  layer.style.setProperty("--sprite", `url("${url}")`);
  layer.setAttribute("data-on", "");
  if (known) { void layer.offsetWidth; layer.style.transition = ""; }
}

function mountPreview(card, urls, names, colors) {
  const stage = card.querySelector(".stage");
  const layers = [...card.querySelectorAll(".layer")];
  const dots = [...card.querySelectorAll(".dot")];
  const n = urls.length;

  const shots = new Map();
  const shot = (k) => {
    let p = shots.get(k);
    if (!p) {
      p = decodeImage(urls[k]).then((img) => { if (!img) shots.delete(k); return img; });
      shots.set(k, p);
    }
    return p;
  };

  let cur = 0, front = 0, timer = null, hover = false, retry = null, tries = 0;
  let shown = false, running = false, alive = true, epoch = 0, seq = 0;

  // Frame k into the back layer once decoded, faded in over the old one; the last request wins.
  const show = async (k) => {
    const my = ++seq;
    const e = epoch;
    const known = seenImage(urls[k]);
    const img = await shot(k);
    if (!alive || e !== epoch || my !== seq || !img) return false;
    const url = `url("${urls[k]}")`;
    if (!shown) {
      putFrame(layers[front], urls[k], known);
      shown = true;
    } else {
      const back = layers[1 - front];
      back.style.setProperty("--sprite", url);
      void back.offsetWidth;
      back.setAttribute("data-on", "");
      layers[front].removeAttribute("data-on");
      front = 1 - front;
    }
    cur = k;
    if (colors[k]) stage.style.setProperty("--tint", colors[k]);
    dots.forEach((d, i) => d.setAttribute("aria-current", String(i === k)));
    if (n > 1) shot((k + 1) % n);
    return true;
  };

  const c = {
    near: false,
    async load() {
      if (shown) return;
      clearTimeout(retry);
      if (await show(cur)) { tries = 0; if (running) c.start(); return; }
      // Not on — it did not come, or an unload crossed it: again, while the card is still near.
      if (alive && c.near && !shown && tries < RETRY_MS.length) retry = setTimeout(() => c.load(), RETRY_MS[tries++]);
    },
    unload() {
      epoch++;
      c.stop();
      clearTimeout(retry); tries = 0;
      shots.clear();
      if (!shown) return;
      shown = false;
      for (const l of layers) { l.style.removeProperty("--sprite"); l.removeAttribute("data-on"); }
    },
    start() {
      running = true;
      clearTimeout(timer); timer = null;
      if (!shown || n < 2 || reduced.matches) return;
      timer = setTimeout(async () => {
        timer = null;
        await show((cur + 1) % n);
        if (running && alive) c.start();
      }, hover ? DWELL_HOVER : DWELL);
    },
    stop() { running = false; clearTimeout(timer); timer = null; },
    kill() { alive = false; epoch++; c.stop(); clearTimeout(retry); shots.clear(); },
  };

  controllers.set(card, c);

  // A frame seen before goes on at once, before the card is first painted — no flash of its bare colour.
  if (seenImage(urls[0])) {
    putFrame(layers[front], urls[0], true);
    shown = true;
    if (n > 1) shot(1 % n);
  }

  card.addEventListener("mouseenter", () => {
    hover = true;
    if (!shown) return;
    if (n > 1) shot((cur + 1) % n);
    if (running) c.start();
  });
  card.addEventListener("mouseleave", () => { hover = false; if (shown && running) c.start(); });
  dots.forEach((d) => d.addEventListener("click", (e) => {
    e.preventDefault();          // the stage is a link to the release page
    e.stopPropagation();
    show(+d.dataset.i).then((ok) => { if (ok && running) c.start(); });
  }));

  const { near, far } = watch();
  near.observe(card);
  far.observe(card);
}

// ------------------------------------------------------------------ one line of tags
//
// A card shows one line of tags. What does not fit is dropped: plain tags from the end first, highlighted ones only
// as a last resort.
export function fitTags(el) {
  const row = el?.querySelector(".tags");
  if (!row) return;
  const chips = [...row.children];
  for (const c of chips) c.classList.remove("cut");
  if (!chips.length || !row.offsetParent) return;
  const first = () => chips.find((c) => !c.classList.contains("cut"));
  const overflows = () => { const f = first(); return !!f && chips.some((c) => !c.classList.contains("cut") && c.offsetTop > f.offsetTop); };
  const order = [
    ...chips.filter((c) => !c.hasAttribute("data-on")).reverse(),
    ...chips.filter((c) => c.hasAttribute("data-on")).reverse(),
  ];
  for (const c of order) { if (!overflows()) break; c.classList.add("cut"); }
}

const tagRows = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => { for (const e of entries) fitTags(e.target.closest(".card")); })
  : null;

/** Fit every card under root right now — callers run it after appending. */
export function fitAllTags(root) {
  for (const el of root.querySelectorAll(".card")) fitTags(el);
}
