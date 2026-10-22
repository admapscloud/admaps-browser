// modules/admaps-browser/scripts/token-window.mjs
// The NPC token's window — the site's own (site/assets/tokens.js), over the shelf inside the browser window: the
// full portrait, the token in its coloured ring at the bottom right, the name, the set, the tags and the buttons
// Share, Download, Download set. ← → walk the shelf as it is filtered now, Escape or a click beside it closes.
// «Download» brings the token (or the set) into the tokens folder — browser.mjs paints and runs the buttons (data-dl).

import { L, plural, esc } from "./text.mjs";
import { primaryHome } from "./offer.mjs";
import { DL_ICON, fmtSize } from "./cards.mjs";

const SHARE_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>'
  + '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

/** The ring colour, off the key — the studio's hash, so both paint a token alike. */
export function ringColor(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `hsl(${h % 360} 100% 55%)`;
}

const ver = (r) => (r.v ? `?v=${encodeURIComponent(r.v)}` : "");

// Held while loading, as in cards.mjs: Foundry's page collects a detached <img> nothing points to mid-way.
const loading = new Set();

/** Load a picture off screen: true — it came. By load, not decode(): decode waits for a frame a hidden tab never draws. */
const ready = (url) => new Promise((resolve) => {
  const im = new Image();
  loading.add(im);
  im.onload = () => { loading.delete(im); resolve(true); };
  im.onerror = () => { loading.delete(im); resolve(false); };
  im.src = url;
});

/**
 * The window over host (the browser's root). ctx: base, me(), setOf(group), isTagOn(t), onTag(t), onStep(r, delta),
 * onClose(). Returns { open(r), close(), isOpen(), current() }.
 */
export function tokenWindow(host, ctx) {
  const over = document.createElement("div");
  over.className = "ab-tkover";
  over.hidden = true;
  over.innerHTML = `
    <div class="tkwin" role="dialog" aria-modal="true" tabindex="-1">
      <div class="tkbox">
        <button type="button" class="tkclose" aria-label="${esc(L("close"))}">&times;</button>
        <div class="tkart">
          <img class="tkfull" alt="" decoding="async">
          <div class="tkfade"></div>
          <div class="tkring"><img class="tkbadge" alt="" decoding="async"></div>
        </div>
        <div class="tkinfo">
          <h2 class="tkname"></h2>
          <p class="tkset"></p>
          <ul class="tags"></ul>
          <div class="tkbtns"></div>
        </div>
      </div>
    </div>`;
  host.append(over);
  const $ = (s) => over.querySelector(s);
  let cur = null;

  const close = () => {
    if (!cur) return;
    cur = null;
    over.hidden = true;
    ctx.onClose?.();
  };
  $(".tkclose").addEventListener("click", close);
  // A click on the dimmed shelf around the box closes it.
  over.addEventListener("click", (e) => { if (e.target === over) close(); });
  over.addEventListener("keydown", (e) => {
    if (!cur) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); ctx.onStep?.(cur, e.key === "ArrowRight" ? 1 : -1); }
  });

  const open = (r) => {
    cur = r;
    const me = ctx.me();
    const set = ctx.setOf(r.group) ?? { label: r.group, n: 1, bytes: 0 };
    const art = $(".tkart"), ring = $(".tkring"), full = $(".tkfull"), badge = $(".tkbadge");
    const mine = () => cur === r;
    for (const el of [art, full, ring, badge]) el.classList.add("wait");
    full.removeAttribute("src");
    badge.removeAttribute("src");
    full.alt = r.name;
    badge.alt = r.name;
    ring.style.setProperty("--ring", ringColor(r.key));
    const shelf = `${ctx.base}/tmedia/p/${r.key}.webp${ver(r)}`;
    const whole = `${ctx.base}/tmedia/full/${r.group}/${r.portrait?.file}${ver(r)}`;
    let gotWhole = false;
    const reveal = () => { art.classList.remove("wait"); full.classList.remove("wait"); };
    Promise.all([
      ready(shelf).then((ok) => { if (ok && mine() && !gotWhole) { full.src = shelf; reveal(); } }),
      ready(whole).then((ok) => { if (ok && mine()) { gotWhole = true; full.src = whole; reveal(); } }),
    ]).then(() => { if (mine()) art.classList.remove("wait"); });
    const tok = `${ctx.base}/tmedia/t/${r.key}.webp${ver(r)}`;
    ready(tok).then((ok) => {
      if (!mine()) return;
      if (ok) { badge.src = tok; badge.classList.remove("wait"); }
      ring.classList.remove("wait");
    });

    $(".tkname").textContent = r.name;
    $(".tkset").textContent = plural("tkset", set.n, { set: set.label });
    $(".tags").innerHTML = r.tags.map((t) =>
      `<button type="button" data-tktag="${esc(t)}"${ctx.isTagOn?.(t) ? " data-on" : ""}>${esc(t)}</button>`).join("");
    for (const b of over.querySelectorAll(".tags button")) {
      b.addEventListener("click", () => { const t = b.dataset.tktag; close(); ctx.onTag(t); });
    }

    const page = `${ctx.base}/tokens/?t=${r.key}`;
    const allowed = me.tokens ?? me.backdrops;
    // Into the tokens folder (browser.mjs, data-dl): this one with its portrait, or the whole set.
    const takes = allowed
      ? `<button type="button" class="dl" data-ab="take" data-dl="tk:${esc(r.key)}">${DL_ICON}<span>${esc(L("download"))}</span>`
        + `<em>(${fmtSize((r.token?.bytes ?? 0) + (r.portrait?.bytes ?? 0))})</em></button>`
        + `<button type="button" class="dl" data-ab="take" data-dl="set:${esc(r.group)}">${DL_ICON}<span>${esc(L("downloadSet"))}</span>`
        + `<em>(${set.n})</em></button>`
      : !me.signedIn
        ? `<button type="button" class="dl wide" data-ab="signin">${esc(L("signInDownload"))}</button>`
        : `<a class="dl wide" href="${esc(primaryHome(me))}" target="_blank" rel="noopener">${esc(L("joinFree"))}</a>`;
    const btns = $(".tkbtns");
    btns.innerHTML = `<button type="button" class="dl tkshare">${SHARE_ICON}<span>${esc(L("share"))}</span></button>${takes}`;
    btns.querySelector(".tkshare").addEventListener("click", () => share(page));
    // «Sign in» closes the window first: the code panel sits above the shelf.
    btns.querySelector('[data-ab="signin"]')?.addEventListener("click", close);

    ctx.onOpen?.(over);
    over.hidden = false;
    $(".tkclose").focus({ preventScroll: true });
  };

  // The link on the clipboard (Foundry's own helper: the browser's clipboard wants a secure page, Foundry is often
  // opened by a plain http address); the answer on the button itself.
  async function share(url) {
    try {
      if (game.clipboard?.copyPlainText) await game.clipboard.copyPlainText(url);
      else await navigator.clipboard.writeText(url);
      const label = $(".tkshare span");
      label.textContent = L("linkCopied");
      setTimeout(() => { label.textContent = L("share"); }, 2000);
    } catch (_e) {
      ui.notifications.info(url);
    }
  }

  return { open, close, isOpen: () => !!cur, current: () => cur };
}
