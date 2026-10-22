// modules/admaps-browser/scripts/browser.mjs
// ADMaps Browser — the window: admaps.cloud inside Foundry, the site's catalogue ported 1:1 (site/assets/app.js):
// the shelves Maps · Backdrops · Tokens, the search folded the site's way, the tag filter on the left with its live
// counts, the setting filter, the site's order (pinned → new for 30 days → free for this visitor → newest), the cards
// a page at a time (cards.mjs). A card's picture or title opens its page in the window (pages.mjs), a token — its
// window (token-window.mjs). ← goes back to where the visitor was, the way the browser's Back does on the site.
//
// Signed in by code (site.mjs) the buttons are the person's own, as on the site. One ApplicationV2 without templates
// (the same in Foundry 12, 13 and 14): the frame is built once, the parts are repainted in place.

import { MODULE_ID, base, loadCatalogs, fetchMe, startLogin, pollLogin, signOut } from "./site.mjs";
import { L, plural, esc } from "./text.mjs";
import { inCircle, promoLive, isNew, offerOf } from "./offer.mjs";
import { setCardContext, cardOf, fitAllTags, teardown, stopWatching, tickFreeTags, fmtSize } from "./cards.mjs";
import { mapPage, backdropPage } from "./pages.mjs";
import { tokenWindow } from "./token-window.mjs";
import { filePicker, registry, probeMap, probeBackdrop, probeToken, installMap, installBackdrop, installTokens, openScene } from "./install.mjs";

const PAGE = 48;                 // cards appended per step
const FACETS_COLLAPSED = 18;
const GUEST = { signedIn: false, can: { webm: false, "4k": false } };
const PANES = ["catalog", "backdrops", "tokens"];
const SHELF = { catalog: "maps", backdrops: "backdrops", tokens: "tokens" };
// AI, in words on the count line: maps without AI (green), backdrops with AI on our own art (yellow), portraits with AI (red).
const AI_CLASS = { maps: "none", backdrops: "own", tokens: "ai" };

// A dozen Cyrillic letters look like Latin ones; typed on a Russian layout they match nothing. Fold both sides.
const CONFUSABLE = { а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s" };
const fold = (s) => s.toLowerCase().replace(/ё/g, "е").replace(/[авекмнорстухіјѕ]/g, (c) => CONFUSABLE[c] ?? c);

function index(r) {
  r.tags = Array.isArray(r.tags) ? r.tags : [];
  r.versions = Array.isArray(r.versions) ? r.versions : [];
  r._hay = fold(`${r.title ?? ""} ${r.release ?? ""} ${r.group ?? ""} ${r.tags.join(" ")} ${r.search ?? ""}`);
}

// The site's order: pinned wins, then the thirty days of NEW, then what is free for this visitor now, then the date.
const byDate = (a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0);
const siteOrder = (me) => (a, b) =>
  ((b.pinned ?? 0) - (a.pinned ?? 0))
  || (Number(isNew(b)) - Number(isNew(a)))
  || (Number(promoLive(b, me)) - Number(promoLive(a, me)))
  || byDate(a, b);

// ЙЦУКЕН → QWERTY: «сфму» instead of «cave» — the commonest empty search of a Russian guest.
const RU_KEYS = "йцукенгшщзхъфывапролджэячсмитьбю.ё";
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`";
const fromRuLayout = (text) => [...text.toLowerCase()].map((ch) => { const i = RU_KEYS.indexOf(ch); return i < 0 ? ch : EN_KEYS[i]; }).join("");

function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const rowsFor = (source, q, tags) => source.filter((r) => {
  for (const t of tags) if (!r.tags.includes(t)) return false;
  return !q || r._hay.includes(q);
});

const SEARCH_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'
  + '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>';
const PATREON_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
  + '<circle cx="15" cy="9" r="7"></circle><rect x="2" y="2" width="4" height="20"></rect></svg>';
const CHECK_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" '
  + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const SPIN_ICON = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
const FORMATS = ["webm", "lite", "webp"];
const DEFAULT_DIRS = { backdropsDir: "_Backdrops", tokensDir: "_Tokens" };
/** A folder as typed: forward slashes, none at the ends, no «..» or «.» steps; empty — the default. */
const cleanDir = (v, key) => String(v ?? "").trim().replace(/\\/g, "/").split("/")
  .filter((p) => p && p !== "." && p !== "..").join("/") || DEFAULT_DIRS[key];

const PROJECTS = [
  ["adm", "Animated Dungeon Maps", "https://www.patreon.com/animatedmaps"],
  ["fbm", "Fantasy Battle Maps", "https://www.patreon.com/aadmaps"],
  ["cbm", "Cybermaps", "https://www.patreon.com/cybermaps"],
];

let _Browser = null;
let _open = null;

/** The one window: brought to the front if it is open already. */
export function openBrowser() {
  if (_open?.rendered) { _open.bringToFront?.(); return _open; }
  const C = browserClass();
  _open = new C();
  _open.render(true);
  return _open;
}

function browserClass() {
  if (_Browser) return _Browser;
  const { ApplicationV2 } = foundry.applications.api;

  _Browser = class AdmapsBrowser extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: "admaps-browser",
      classes: ["admaps-browser"],
      window: { title: "ADMAPS_BROWSER.title", icon: "fa-solid fa-store", resizable: true },
      position: { width: 1200, height: 800 },
    };

    constructor(options = {}) {
      // A big window: most of the screen, centred by core.
      const width = Math.max(720, Math.min(1480, window.innerWidth - 80));
      const height = Math.max(520, Math.min(980, window.innerHeight - 80));
      super(foundry.utils.mergeObject({ position: { width, height } }, options));
      this.data = null;      // { maps, backdrops, tokens, facets, sets, errors }
      this.loading = false;
      this.me = null;        // the site's /api/me — a guest's too; null while unknown or unreachable
      this.login = null;     // the code being confirmed: { device, code, verifyUrl, interval, expires, timer, msg }
      // The site's state: the shelf on screen, its search and filters.
      this.s = { pane: "catalog", q: "", tags: new Set(), setting: "", showAllFacets: false, rows: [], shown: 0 };
      // The token shelf searches on its own: the other side's search and tags wait here.
      this.parked = { q: "", tags: new Set() };
      this.page = null;      // { kind: "map" | "backdrop", key, view } — a page open instead of the shelf
      this.history = [];     // where ← goes: snapshots of the places left
      this.tk = null;        // the token window
      // Downloads into Foundry, by what they are (data-dl): map:<release> | bd:<slug>:<webp|webm> | tk:<key> | set:<group>
      // → { state: probing | none | busy | done, p, fmt, dir }. One download at a time, the rest wait their turn.
      this.dl = new Map();
      this._dlWords = new WeakMap();   // a button's own words, for when it is neither busy nor done
      this._queue = Promise.resolve();
      this.prefsOpen = false;
    }

    async _renderHTML() {
      const root = document.createElement("div");
      root.className = "ab-root";
      root.innerHTML = `
        <header class="ab-top">
          <button type="button" class="ab-back" data-ab="back" aria-label="${esc(L("back"))}" hidden><i class="fa-solid fa-arrow-left"></i></button>
          <div class="search">
            ${SEARCH_ICON}
            <input class="ab-q" type="search" autocomplete="off" spellcheck="false" aria-label="${esc(L("searchMaps"))}" placeholder="${esc(L("searchMaps"))}">
            <button type="button" class="clear" data-ab="qclear" hidden aria-label="${esc(L("clearSearch"))}">&times;</button>
          </div>
          <div class="spacer"></div>
          <div class="ab-acc authwrap"></div>
        </header>
        <section class="ab-login" hidden></section>
        <section class="ab-prefs" hidden></section>
        <div class="ab-body">
          <main class="catalog">
            <aside class="side">
              <div class="head">
                <h2>${esc(L("filterByTag"))}</h2>
                <button type="button" class="clearall" data-ab="clearall" hidden>${esc(L("clear"))}</button>
              </div>
              <ul class="facets"></ul>
              <button type="button" class="showall" data-ab="showall" hidden></button>
              <h2 class="projects-head">${esc(L("myProjects"))}</h2>
              <ul class="projects">${PROJECTS.map(([c, name, url]) =>
                `<li data-c="${c}"><a href="${url}" target="_blank" rel="noopener">${esc(name)}</a></li>`).join("")}</ul>
            </aside>
            <section class="ab-shelf">
              <div class="bar">
                <span class="countline"></span>
                <div class="panes" role="tablist"><i class="pill"></i>${PANES.map((p) =>
                  `<button type="button" role="tab" data-ab="pane" data-pane="${p}">${esc(L(`tab.${SHELF[p]}`))}</button>`).join("")}</div>
              </div>
              <div class="grid ab-grid"></div>
              <div class="more" hidden><span class="ab-shown"></span><button type="button" data-ab="more">${esc(L("showMore"))}</button></div>
              <div class="empty" hidden>
                <p class="ab-emptymsg"></p>
                <p class="hint ab-emptyhint" hidden></p>
                <button type="button" data-ab="reset">${esc(L("reset"))}</button>
                <div class="rescue" hidden><h3></h3><div class="grid ab-rescuegrid"></div></div>
              </div>
              <div class="ab-msg" hidden></div>
            </section>
          </main>
          <main class="release" hidden></main>
        </div>`;
      return root;
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const root = this.root;
      if (!root || root.dataset.wired) return;
      root.dataset.wired = "1";
      setCardContext({ me: () => this._me(), base: () => base(), scroller: () => this._scroller() });
      root.addEventListener("click", (ev) => this._onClick(ev));
      // The middle button on the window's own links opens nothing in the browser either.
      root.addEventListener("auxclick", (ev) => { if (ev.target.closest("a[data-ab]")) ev.preventDefault(); });
      root.addEventListener("change", (ev) => this._onChange(ev));
      // The mouse's own Back button, as in a browser.
      root.addEventListener("mouseup", (ev) => { if (ev.button === 3 && this.history.length) { ev.preventDefault(); this._back(); } });
      const q = root.querySelector(".ab-q");
      q.addEventListener("input", () => {
        root.querySelector('[data-ab="qclear"]').hidden = !q.value;
        if (this.page) return;           // on a page the search runs on Enter, as on the site
        this.s.q = q.value.trim();
        this._render();
      });
      q.addEventListener("keydown", (ev) => {
        // Escape leaves the search, as on the site — and stops there: Foundry would close the window on it.
        if (ev.key === "Escape") { ev.stopPropagation(); q.blur(); return; }
        if (ev.key !== "Enter" || ev.isComposing || !this.page) return;
        this._go({ shelf: { pane: this.page.kind === "backdrop" ? "backdrops" : "catalog", q: q.value.trim() } });
      });
      this.tk = tokenWindow(root, {
        base: base(),
        me: () => this._me(),
        setOf: (g) => this.data?.sets.get(g),
        isTagOn: (t) => this.s.tags.has(t),
        onTag: (t) => this._toggleTag(t),
        onStep: (cur, delta) => {
          const rows = this.s.pane === "tokens" && this.s.rows.length ? this.s.rows : this.data.tokens;
          const i = rows.indexOf(cur);
          const next = rows[(Math.max(0, i) + delta + rows.length) % rows.length];
          if (next && next !== cur) this.tk.open(next);
        },
        onOpen: (over) => this._paintDl(over),
      });
      // Appending the next page when the foot of the list comes into view.
      this._moreObs = new IntersectionObserver(([e]) => { if (e?.isIntersecting && !this.page) this._grow(); },
        { root: this._scroller(), rootMargin: "600px" });
      this._moreObs.observe(root.querySelector(".more"));
      this._stickSide();
      addEventListener("resize", this._onResize = () => this._movePill());
      // The FREE countdowns, once in a while; a window that closed asks the server again.
      this._tick = setInterval(() => { if (this.root && tickFreeTags(this.root)) this._refreshMe(); }, 30_000);
      this._paintAccount();
      this._render();
      if (!this.data && !this.loading) this._load();
    }

    async close(options) {
      this._stopLogin();
      clearInterval(this._tick);
      removeEventListener("resize", this._onResize);
      this._moreObs?.disconnect();
      this._sideObs?.disconnect();
      this._closePage();
      for (const c of this.root?.querySelectorAll(".card") ?? []) teardown(c);
      stopWatching();
      if (_open === this) _open = null;
      return super.close(options);
    }

    get root() { return this.element?.querySelector(".ab-root") ?? null; }
    _scroller() { return this.root?.querySelector(".ab-body") ?? null; }
    _me() { return this.me ?? GUEST; }
    _$(s) { return this.root?.querySelector(s) ?? null; }

    // ── Data ──
    async _load() {
      this.loading = true;
      this._render();
      const [data, me] = await Promise.all([
        loadCatalogs().catch((e) => ({
          maps: [], tokens: [], sets: [], backdrops: [], facets: {},
          errors: { maps: e.message, tokens: e.message, backdrops: e.message },
        })),
        fetchMe().catch(() => null),
      ]);
      for (const r of data.maps) index(r);
      for (const r of data.backdrops) index(r);
      // A token reads like the others: title is its name, published the day it was added.
      for (const r of data.tokens) { r.tk = true; r.title = r.name; r.published = r.added; index(r); }
      data.sets = new Map(data.sets.map((s) => [s.group, s]));
      this.data = data;
      this.me = me;
      this.loading = false;
      if (!this.root) return;
      this._paintAccount();
      if (this.page) this._openPage(this.page.kind, this.page.key);
      else this._render();
      this._autoOffer();
    }

    async _refreshMe() {
      this.me = await fetchMe().catch(() => null);
      this._paintAccount();
      this._repaint();
    }

    /** The visitor changed (signed in or out, a promotion ran out): everything that paints by him, again. */
    _repaint() {
      if (!this.root) return;
      if (this.page) { this.page.view?.paint(); this._paintDl(this._$("main.release")); }
      else this._render({ keep: true });
      this._paintPrefs();
    }

    // ── Clicks ──
    _onClick(ev) {
      const root = this.root;
      // The AI note opens by a tap and closes by a tap elsewhere.
      const ai = ev.target.closest(".aibadge");
      for (const b of root.querySelectorAll(".aibadge.open")) if (b !== ai) b.classList.remove("open");
      if (ai) { ai.classList.toggle("open"); return; }
      const el = ev.target.closest("[data-ab]");
      if (!el || !root.contains(el)) return;
      // What the window links to itself stays in it. Core opens every link in the browser by its own listener on
      // the document (Game#_onClickHyperlink), whatever was prevented here — so the click goes no further.
      if (el.tagName === "A") { ev.preventDefault(); ev.stopPropagation(); }
      const s = this.s;
      const what = el.dataset.ab;
      switch (what) {
        case "map":
        case "backdrop":
          ev.preventDefault();
          this._go({ page: { kind: what, key: el.dataset.key } });
          break;
        case "token": {
          ev.preventDefault();
          const r = this.data?.tokens.find((x) => x.key === el.dataset.key);
          if (r) this.tk.open(r);
          break;
        }
        case "tag": {
          // On the shelf a tag filters; under a page («More like this») it leads to its shelf filtered by it.
          const t = el.dataset.tag;
          if (el.closest("main.release")) {
            const kind = el.closest(".card")?.querySelector(".stage")?.dataset.ab;
            this._go({ shelf: { pane: kind === "backdrop" ? "backdrops" : "catalog", tags: [t] } });
          } else this._toggleTag(t);
          break;
        }
        case "shelf":
          ev.preventDefault();
          this._go({ shelf: { pane: el.dataset.pane, tags: el.dataset.tags ? [el.dataset.tags] : [], setting: el.dataset.adventure ?? "" } });
          break;
        case "take": this._take(el); break;
        case "prefs": this.prefsOpen = !this.prefsOpen; this._paintPrefs(); break;
        case "pickdir": this._pickDir(el.dataset.pref); break;
        case "facet": {
          const t = el.dataset.tag;
          if (s.tags.has(t)) s.tags.delete(t); else s.tags.add(t);
          this._render();
          break;
        }
        case "pane": this._showPane(el.dataset.pane); break;
        case "clearall": s.tags.clear(); this._render(); break;
        case "showall": s.showAllFacets = !s.showAllFacets; this._render({ keep: true }); break;
        case "setfilter": s.setting = ""; this._render(); break;
        case "reset":
          s.tags.clear(); s.q = ""; s.setting = "";
          this._setSearch("");
          this._render();
          break;
        case "rescue":
          s.q = el.dataset.q;
          this._setSearch(s.q);
          this._render();
          break;
        case "rescue-pane": this._showPane(el.dataset.pane); break;
        case "more": this._grow(); break;
        case "qclear": {
          this._setSearch("");
          const q = root.querySelector(".ab-q");
          q.focus();
          if (!this.page) { s.q = ""; this._render(); }
          break;
        }
        case "back": this._back(); break;
        case "account": window.open(`${base()}/?view=profile`, "_blank", "noopener"); break;
        case "signin": this._startLogin(); break;
        case "cancel": this._cancelLogin(); break;
        case "signout": this._signOut(); break;
        case "retry": this.data = null; this._load(); break;
      }
    }

    _setSearch(v) {
      const q = this._$(".ab-q");
      if (!q) return;
      q.value = v;
      this._$('[data-ab="qclear"]').hidden = !v;
    }

    _toggleTag(t) {
      const s = this.s;
      if (s.tags.has(t)) s.tags.delete(t); else s.tags.add(t);
      this._render();
      this._scroller()?.scrollTo({ top: 0, behavior: "smooth" });
    }

    // ── Places: the shelves, the pages, and the way back ──

    _snapshot() {
      const s = this.s;
      return {
        page: this.page ? { kind: this.page.kind, key: this.page.key } : null,
        pane: s.pane, q: s.q, tags: [...s.tags], setting: s.setting, showAllFacets: s.showAllFacets,
        parked: { q: this.parked.q, tags: [...this.parked.tags] },
        shown: s.shown, scroll: this._scroller()?.scrollTop ?? 0,
      };
    }

    /** Go somewhere new — a page, or a shelf the way a fresh link to it opens — remembering where we were. */
    _go(target) {
      if (!this.data) return;
      this.history.push(this._snapshot());
      if (this.history.length > 50) this.history.shift();
      if (target.page) this._openPage(target.page.kind, target.page.key);
      else {
        const { pane = "catalog", tags = [], q = "", setting = "" } = target.shelf;
        const s = this.s;
        s.pane = PANES.includes(pane) ? pane : "catalog";
        s.q = q;
        s.tags = new Set(tags);
        s.setting = s.pane === "catalog" ? setting : "";
        s.showAllFacets = false;
        this.parked = { q: "", tags: new Set() };
        this._closePage();
        this._setSearch(s.q);
        this._render();
        this._scroller().scrollTop = 0;
      }
      this._paintBack();
    }

    _back() {
      const snap = this.history.pop();
      if (!snap) return;
      const s = this.s;
      s.pane = snap.pane; s.q = snap.q; s.tags = new Set(snap.tags); s.setting = snap.setting; s.showAllFacets = snap.showAllFacets;
      this.parked = { q: snap.parked.q, tags: new Set(snap.parked.tags) };
      if (snap.page) {
        this._openPage(snap.page.kind, snap.page.key);
        this._scroller().scrollTop = snap.scroll;
      } else {
        this._closePage();
        this._setSearch(s.q);
        this._render();
        while (s.shown < Math.min(snap.shown, s.rows.length)) this._grow(99);
        this._scroller().scrollTop = snap.scroll;
      }
      this._paintBack();
    }

    _paintBack() {
      const b = this._$(".ab-back");
      if (b) b.hidden = !this.history.length;
    }

    _openPage(kind, key) {
      const d = this.data;
      const r = kind === "map" ? d?.maps.find((x) => x.release === key) : d?.backdrops.find((x) => x.backdrop === key);
      if (!r) return;
      this._closePage();
      this.tk?.close();
      const view = (kind === "map" ? mapPage : backdropPage)(r, {
        base: base(), me: () => this._me(), maps: d.maps, backdrops: d.backdrops, scroller: () => this._scroller(),
      });
      this.page = { kind, key, view };
      const host = this._$("main.release");
      host.replaceChildren(view.el);
      host.hidden = false;
      this._$("main.catalog").hidden = true;
      this._setSearch("");
      const q = this._$(".ab-q");
      q.placeholder = L("searchMaps");
      view.paint();
      this._paintDl(host);
      this._scroller().scrollTop = 0;
    }

    _closePage() {
      if (!this.page) return;
      this.page.view?.destroy();
      this.page = null;
      const host = this._$("main.release");
      if (host) { host.replaceChildren(); host.hidden = true; }
      const cat = this._$("main.catalog");
      if (cat) cat.hidden = false;
    }

    // The token shelf searches and filters on its own; maps and backdrops share theirs.
    _swapFilters(from, to) {
      const scope = (p) => (p === "tokens" ? "tokens" : "maps");
      if (scope(from) === scope(to)) return;
      const was = { q: this.s.q, tags: this.s.tags };
      this.s.q = this.parked.q;
      this.s.tags = this.parked.tags;
      this.parked = was;
      this._setSearch(this.s.q);
    }

    _showPane(next) {
      if (!PANES.includes(next)) return;
      const s = this.s;
      this._closePage();
      this._swapFilters(s.pane, next);
      if (next !== "catalog") s.setting = "";
      s.pane = next;
      // What travelled from the other shelf and shows nothing here is dropped — an empty grid reads as broken.
      if (next !== "tokens" && s.tags.size && this.data && !this._selected().length) s.tags.clear();
      this._render();
      this._scroller()?.scrollTo({ top: 0, behavior: "smooth" });
    }

    _shelf(pane = this.s.pane) {
      return pane === "tokens" ? (this.data?.tokens ?? []) : pane === "backdrops" ? (this.data?.backdrops ?? []) : (this.data?.maps ?? []);
    }

    _selected() {
      const s = this.s;
      const q = fold(s.q);
      const setting = s.setting.toLowerCase();
      return this._shelf().filter((r) => {
        for (const t of s.tags) if (!r.tags.includes(t)) return false;
        if (setting && !(r.settings ?? []).some((x) => x.toLowerCase() === setting)) return false;
        return !q || r._hay.includes(q);
      });
    }

    // ── Painting the shelf ──

    _render({ keep = false } = {}) {
      const root = this.root;
      if (!root) return;
      const s = this.s;
      const scroller = this._scroller();
      const scroll = scroller.scrollTop;
      const keepShown = keep ? s.shown : 0;
      const grid = root.querySelector(".ab-grid");
      const msg = root.querySelector(".ab-msg");
      const empty = root.querySelector(".empty");
      const more = root.querySelector(".more");
      const shelf = SHELF[s.pane];
      this._paintPanes();
      root.querySelector(".ab-q").placeholder = L(s.pane === "tokens" ? "searchTokens" : "searchMaps");
      grid.classList.toggle("tkgrid", s.pane === "tokens");
      for (const card of grid.children) teardown(card);
      grid.replaceChildren();

      const error = this.data?.errors?.[shelf];
      if (!this.data || error) {
        s.rows = []; s.shown = 0;
        empty.hidden = true; more.hidden = true;
        msg.hidden = false;
        msg.innerHTML = !this.data
          ? `<p>${esc(L("loading"))}</p>`
          : `<p>${esc(L("loadFailed", { error }))}</p><button type="button" class="ab-retry" data-ab="retry">${esc(L("retry"))}</button>`;
        root.querySelector(".countline").replaceChildren();
        root.querySelector(".facets").replaceChildren();
        root.querySelector(".clearall").hidden = true;
        root.querySelector(".showall").hidden = true;
        return;
      }
      msg.hidden = true;

      s.rows = this._selected().sort(siteOrder(this._me()));
      s.shown = 0;
      this._paintCount();
      empty.hidden = s.rows.length > 0;
      if (!s.rows.length) this._paintEmpty();
      this._renderFacets(s.rows);
      this._grow();
      // A repaint for the visitor's sake keeps the place: as many cards as there were, the same scroll.
      while (keep && s.shown < Math.min(keepShown, s.rows.length)) this._grow(99);
      if (keep) scroller.scrollTop = scroll;
    }

    /** Append the next page, and keep appending while the foot is still in view. */
    _grow(guard = 0) {
      const root = this.root;
      if (!root || this.page) return;
      const s = this.s;
      const grid = root.querySelector(".ab-grid");
      const more = root.querySelector(".more");
      const next = s.rows.slice(s.shown, s.shown + PAGE);
      if (next.length) {
        grid.append(...next.map((r) => cardOf(r, (t) => s.tags.has(t))));
        fitAllTags(grid);
        this._paintDl(grid);
        s.shown += next.length;
      }
      const done = s.shown >= s.rows.length;
      more.hidden = done;
      root.querySelector(".ab-shown").textContent = done ? "" : L("showing", { shown: s.shown, total: s.rows.length });
      if (!done && guard < 20) {
        const r = more.getBoundingClientRect();
        if (r.height && r.top < this._scroller().getBoundingClientRect().bottom) this._grow(guard + 1);
      }
    }

    _paintPanes() {
      for (const b of this.root.querySelectorAll(".panes [data-pane]")) {
        const on = b.dataset.pane === this.s.pane;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", String(on));
      }
      this._movePill();
    }

    /** The highlight travels to the tab rather than appearing on it. */
    _movePill() {
      const box = this._$(".panes");
      if (!box) return;
      const on = box.querySelector("button.on");
      const pill = box.querySelector(".pill");
      if (!on || !box.offsetParent) { pill.hidden = true; return; }
      pill.hidden = false;
      const r = on.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const width = `${r.width}px`;
      const shift = `translateX(${r.left - b.left + box.scrollLeft - 2}px)`;
      if (!pill.dataset.ready) {
        pill.style.transition = "none";
        pill.style.width = width;
        pill.style.transform = shift;
        void pill.offsetWidth;
        pill.style.transition = "";
        pill.dataset.ready = "1";
        return;
      }
      pill.style.width = width;
      pill.style.transform = shift;
    }

    /** «52 releases made without AI», and the setting filter after it. */
    _paintCount() {
      const s = this.s;
      const shelf = SHELF[s.pane];
      const n = s.rows.length;
      const line = this._$(".countline");
      const parts = {
        n: () => Object.assign(document.createElement("strong"), { textContent: String(n) }),
        word: () => Object.assign(document.createElement("span"), { className: "countword", textContent: plural(`count.${shelf}`, n) }),
        ai: () => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = `aibadge ${AI_CLASS[shelf]}`;
          b.innerHTML = `<span class="aitext">${esc(plural(`ai.${shelf}`, n))}</span><span class="aitip" role="tooltip">${esc(L(`aitip.${shelf}`))}</span>`;
          return b;
        },
      };
      const nodes = L(`countLine.${shelf}`).split(/(\{\w+\})/).filter(Boolean).map((t) => {
        const m = /^\{(\w+)\}$/.exec(t);
        return m && parts[m[1]] ? parts[m[1]]() : document.createTextNode(t);
      });
      const set = document.createElement("button");
      set.type = "button";
      set.className = "setfilter";
      set.dataset.ab = "setfilter";
      set.hidden = !s.setting;
      // Written as the maps write it, whatever letters came in.
      const name = s.rows.flatMap((r) => r.settings ?? []).find((x) => x.toLowerCase() === s.setting.toLowerCase()) ?? s.setting;
      set.innerHTML = `<span class="setlabel">${esc(L("setting"))}</span> <span class="setname">${esc(name)}</span><i aria-hidden="true">×</i>`;
      line.replaceChildren(...nodes, set);
    }

    _renderFacets(rows) {
      const s = this.s;
      const reachable = {};
      for (const r of rows) for (const t of r.tags) reachable[t] = (reachable[t] || 0) + 1;
      // A tag pressed on the other shelf may not exist on this one: kept, pressed and at zero, so it can be released.
      const all = (this.data?.facets?.[SHELF[s.pane]] ?? []).slice();
      for (const t of s.tags) if (!all.some((f) => f.tag === t)) all.push({ tag: t, n: 0 });
      // Themes first, the other tags under a line (the owner, 22.10.2026, on the site; maps and backdrops). A theme is
      // a release's first tag — the studio always writes it first. Tokens have no themes: their list is as it was.
      const themes = new Set(s.pane === "tokens" ? [] : this._shelf().map((r) => r.tags?.[0]).filter(Boolean));
      const facets = [...all.filter((f) => themes.has(f.tag)), ...all.filter((f) => !themes.has(f.tag))];
      const list = s.showAllFacets ? facets : facets.slice(0, FACETS_COLLAPSED);
      const split = list.filter((f) => themes.has(f.tag)).length;
      const box = this._$(".facets");
      box.style.setProperty("--nw", String(Math.max(1, ...facets.map((f) => f.n || 0))).length);
      const items = list.map(({ tag, n }) => {
        const on = s.tags.has(tag);
        const live = reachable[tag] ?? 0;
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.className = "facet";
        b.type = "button";
        b.dataset.ab = "facet";
        b.dataset.tag = tag;
        b.setAttribute("aria-pressed", String(on));
        if (!on && live === 0) b.disabled = true;
        b.append(document.createTextNode(`${tag} `), Object.assign(document.createElement("b"), { textContent: String(on ? n : live) }));
        li.append(b);
        return li;
      });
      if (split > 0 && split < items.length) items.splice(split, 0, Object.assign(document.createElement("li"), { className: "sep", ariaHidden: "true" }));
      box.replaceChildren(...items);
      this._$(".clearall").hidden = s.tags.size === 0;
      const more = facets.length - FACETS_COLLAPSED;
      const showall = this._$(".showall");
      showall.hidden = more <= 0;
      showall.textContent = s.showAllFacets ? L("fewerTags") : L("moreTags", { n: more });
    }

    // ── An empty result is not a dead end ──

    _rescueFor(q) {
      const s = this.s;
      const folded = fold(q);
      const here = this._shelf();
      const there = s.pane === "tokens" ? [] : s.pane === "backdrops" ? this.data.maps : this.data.backdrops;
      if (q && /[а-яё]/i.test(q)) {
        const asEn = fold(fromRuLayout(q));
        const n = rowsFor(here, asEn, new Set()).length;
        if (asEn !== folded && n) return { kind: "layout", query: fromRuLayout(q), n };
      }
      if (q && q.length >= 3) {
        const words = new Set();
        for (const r of here) { for (const t of r.tags) words.add(t); words.add(r.title); }
        let best = null;
        for (const w of words) {
          const d = editDistance(folded, fold(w), 2);
          if (d > 0 && d <= 2 && (!best || d < best.d)) best = { w, d };
        }
        if (best) return { kind: "typo", query: best.w, n: rowsFor(here, fold(best.w), new Set()).length };
      }
      if (there.length) {
        const n = rowsFor(there, folded, s.tags).length;
        if (n) return { kind: "other", n };
      }
      return null;
    }

    _paintEmpty() {
      const s = this.s;
      const shelf = SHELF[s.pane];
      // Say what was searched for: «0 releases» over a blank page reads as a broken page.
      const bits = [];
      if (s.q) bits.push(L("empty.q", { q: s.q }));
      if (s.tags.size) bits.push([...s.tags].join(" + "));
      if (s.setting) bits.push(L("empty.setting", { name: s.setting }));
      this._$(".ab-emptymsg").textContent = bits.length ? L(`empty.match.${shelf}`, { bits: bits.join(L("empty.and")) }) : L("empty.none");

      const hint = this._$(".ab-emptyhint");
      const r = s.q ? this._rescueFor(s.q) : null;
      hint.hidden = !r;
      if (r) {
        const link = (text, data) => `<button type="button" class="linkish" ${data}>${esc(text)}</button>`;
        if (r.kind === "layout" || r.kind === "typo") {
          hint.innerHTML = L(`rescue.${r.kind}`).split(/(\{\w+\})/).map((t) =>
            t === "{link}" ? link(L("empty.q", { q: r.query }), `data-ab="rescue" data-q="${esc(r.query)}"`)
              : t === "{count}" ? esc(plural("rescue.results", r.n)) : esc(t)).join("");
        } else {
          const other = s.pane === "backdrops" ? "maps" : "backdrops";
          hint.innerHTML = `${esc(L(`rescue.other.${other}`, { n: r.n }))} `
            + link(L(`rescue.search.${other}`), `data-ab="rescue-pane" data-pane="${other === "backdrops" ? "backdrops" : "catalog"}"`);
        }
      }

      // The newest of this shelf: an empty screen lets go, a full one holds.
      const box = this._$(".rescue");
      const grid = this._$(".ab-rescuegrid");
      for (const c of grid.children) teardown(c);
      grid.replaceChildren();
      const fresh = this._shelf().filter((x) => !x.exclusive || inCircle(x, this._me())).slice().sort(byDate).slice(0, 6);
      box.hidden = fresh.length === 0;
      grid.classList.toggle("tkgrid", s.pane === "tokens");
      if (fresh.length) {
        box.querySelector("h3").textContent = L(`rescue.newest.${shelf}`);
        grid.append(...fresh.map((x) => cardOf(x, (t) => s.tags.has(t))));
        fitAllTags(grid);
        this._paintDl(grid);
      }
    }

    /** The column on the left sticks; one taller than the window sticks by its bottom instead. */
    _stickSide() {
      const side = this._$(".side");
      const box = this._scroller();
      if (!side || !box || typeof ResizeObserver !== "function") return;
      const set = () => {
        side.style.setProperty("--side-h", `${Math.round(side.offsetHeight)}px`);
        side.style.setProperty("--view-h", `${Math.round(box.clientHeight)}px`);
        this._movePill();
      };
      this._sideObs = new ResizeObserver(set);
      this._sideObs.observe(side);
      this._sideObs.observe(box);
      set();
    }

    // ── The account ──

    _paintAccount() {
      const acc = this._$(".ab-acc");
      if (!acc) return;
      const me = this._me();
      if (me.signedIn) {
        // The site's answer to «who am I here»: the tiers, all of them.
        const names = Object.values(me.grants ?? {}).map((c) => c.tier).filter(Boolean);
        const label = names.length ? [...new Set(names)].join(" / ") : (me.tiers?.[0] ?? L("account"));
        // The gear first, before the button to the site's profile (the owner, 22.10.2026).
        acc.innerHTML = `<button type="button" class="ab-gear${this.prefsOpen ? " on" : ""}" data-ab="prefs" aria-label="${esc(L("prefs.open"))}"><i class="fa-solid fa-gear"></i></button>`
          + `<button type="button" class="patreon in" data-ab="account">${PATREON_ICON}<span class="ab-tier">${esc(label)}</span></button>`
          + `<button type="button" class="ab-out" data-ab="signout">${esc(L("signOut"))}</button>`;
      } else {
        this.prefsOpen = false;
        acc.innerHTML = `<button type="button" class="patreon" data-ab="signin"${this.login ? " disabled" : ""}>${PATREON_ICON}<span>${esc(L("signIn"))}</span></button>`;
      }
      this._paintLogin();
      this._paintPrefs();
    }

    // ── The gear: the limits, the maps' format, the folders ──

    _paintPrefs() {
      const box = this._$(".ab-prefs");
      if (!box) return;
      const me = this._me();
      this._$(".ab-gear")?.classList.toggle("on", this.prefsOpen);
      box.hidden = !this.prefsOpen || !me.signedIn;
      if (box.hidden) { box.replaceChildren(); return; }
      const q = me.quota ?? {};
      const num = (v) => (Number.isFinite(Number(v)) ? String(v) : "—");
      const used = q.gbAllowance > 0 ? Math.max(0, Math.min(1, 1 - (q.gbLeft ?? 0) / q.gbAllowance)) : 0;
      const fmt = game.settings.get(MODULE_ID, "format");
      const dir = (key) => `<label class="ab-dir"><span>${esc(L(`prefs.${key === "backdropsDir" ? "backdrops" : "tokens"}`))}</span>`
        + `<input type="text" data-pref="${key}" value="${esc(game.settings.get(MODULE_ID, key))}" spellcheck="false">`
        + `<button type="button" class="ab-pick" data-ab="pickdir" data-pref="${key}" aria-label="${esc(L("prefs.browse"))}"><i class="fa-solid fa-folder-open"></i></button></label>`;
      box.innerHTML = `
        <div class="ab-pcol">
          <h3>${esc(L("prefs.limits"))}</h3>
          <div class="ab-meter"><i style="width:${(used * 100).toFixed(1)}%"></i></div>
          <p>${esc(L("prefs.month", { left: num(q.gbLeft), total: num(q.gbAllowance) }))}</p>
          <p>${esc(L("prefs.links", { n: num(q.linksLeftThisHour) }))}</p>
          <label class="ab-radio ab-open"><input type="checkbox" data-pref="openAfter"${game.settings.get(MODULE_ID, "openAfter") ? " checked" : ""}>`
            + `<span>${esc(L("prefs.openAfter"))}</span></label>
        </div>
        <div class="ab-pcol">
          <h3>${esc(L("prefs.format"))}</h3>
          ${FORMATS.map((f) => `<label class="ab-radio"><input type="radio" name="ab-fmt" value="${f}"${f === fmt ? " checked" : ""}>`
            + `<span><b>${esc(L(`fmt.${f}`))}</b> — ${esc(L(`fmtNote.${f}`))}</span></label>`).join("")}
        </div>
        <div class="ab-pcol">
          <h3>${esc(L("prefs.folders"))}</h3>
          <div class="ab-dir ab-maps"><span>${esc(L("prefs.maps"))}</span><code>_ADMaps</code>
            <label class="ab-radio ab-auto"><input type="checkbox" data-pref="autoDownload"${game.settings.get(MODULE_ID, "autoDownload") ? " checked" : ""}>`
            + `<span>${esc(L("auto.pref"))}</span></label></div>
          ${dir("backdropsDir")}
          ${dir("tokensDir")}
        </div>`;
    }

    async _onChange(ev) {
      const t = ev.target;
      if (t.name === "ab-fmt") await game.settings.set(MODULE_ID, "format", FORMATS.includes(t.value) ? t.value : "webm");
      else if (t.dataset?.pref === "openAfter") await game.settings.set(MODULE_ID, "openAfter", t.checked);
      else if (t.dataset?.pref === "autoDownload") {
        await game.settings.set(MODULE_ID, "autoDownload", t.checked);
        // Just turned on: what is waiting is offered now, not at the next opening.
        if (t.checked) { this._autoAsked = false; this._autoOffer(); }
      } else if (t.dataset?.pref) await this._setDir(t.dataset.pref, t.value);
    }

    async _setDir(key, value) {
      if (!(key in DEFAULT_DIRS)) return;
      const v = cleanDir(value, key);
      await game.settings.set(MODULE_ID, key, v);
      const input = this._$(`.ab-prefs input[data-pref="${key}"]`);
      if (input) input.value = v;
      // Backdrops and tokens are looked for in the folder now chosen.
      for (const k of [...this.dl.keys()]) {
        if (this.dl.get(k)?.state === "busy") continue;
        if ((key === "backdropsDir" && k.startsWith("bd:")) || (key === "tokensDir" && /^(tk|set):/.test(k))) this.dl.delete(k);
      }
      this._paintDl();
    }

    _pickDir(key) {
      if (!(key in DEFAULT_DIRS)) return;
      const FP = filePicker();
      new FP({ type: "folder", current: game.settings.get(MODULE_ID, key), callback: (path) => this._setDir(key, path) }).render(true);
    }

    // ── Downloading into Foundry: the buttons (data-dl), their state, the queue ──

    _dir(key) { return cleanDir(game.settings.get(MODULE_ID, key), key); }
    _map(release) { return this.data?.maps.find((x) => x.release === release) ?? null; }
    _backdrop(slug) { return this.data?.backdrops.find((x) => x.backdrop === slug) ?? null; }
    _token(key) { return this.data?.tokens.find((x) => x.key === key) ?? null; }

    /** Every download button under scope as its thing stands: its own words, busy with a percentage, or done (a map —
     *  «Open», to its scene; the rest — ✓). */
    _paintDl(scope = this.root) {
      for (const b of scope?.querySelectorAll("[data-dl]") ?? []) this._paintButton(b);
    }

    _paintKey(key) {
      for (const b of this.root?.querySelectorAll("[data-dl]") ?? []) if (b.dataset.dl === key) this._paintButton(b);
    }

    _paintButton(b) {
      if (!this._dlWords.has(b)) this._dlWords.set(b, b.innerHTML);
      const key = b.dataset.dl;
      const st = this.dl.get(key);
      if (!st) this._probe(key);
      const busy = st?.state === "busy", done = st?.state === "done";
      b.classList.toggle("is-busy", busy);
      b.classList.toggle("is-done", done);
      b.disabled = busy;
      if (busy) b.innerHTML = `${SPIN_ICON}<span>${Math.round((st.p ?? 0) * 100)}%</span>`;
      else if (done) b.innerHTML = this._doneHtml(key);
      else b.innerHTML = this._dlWords.get(b);
      if (done && !key.startsWith("map:")) b.setAttribute("aria-label", L("dl.done")); else b.removeAttribute("aria-label");
    }

    _doneHtml(key) {
      const [kind, , file] = key.split(":");
      if (kind === "map") return `<span>${esc(L("dl.open"))}</span>`;
      if (kind === "bd") return `${CHECK_ICON}<span>${esc(file.toUpperCase())}</span>`;
      if (kind === "set") return `${CHECK_ICON}<span>${esc(L("dl.setDone"))}</span>`;
      return CHECK_ICON;
    }

    /** Is it in Data already (the list of what was installed, or the files themselves). */
    async _probe(key) {
      if (this.dl.has(key) || !this.data) return;
      this.dl.set(key, { state: "probing" });
      const [kind, a, b] = key.split(":");
      let st = { state: "none" };
      try {
        if (kind === "map") {
          const r = this._map(a);
          const info = r && await probeMap(r);
          if (info) st = { state: "done", fmt: info.fmt, dir: info.dir };
        } else if (kind === "bd") {
          const r = this._backdrop(a);
          if (r && await probeBackdrop(r, b, this._dir("backdropsDir"))) st = { state: "done" };
        } else if (kind === "tk") {
          const r = this._token(a);
          if (r && await probeToken(r, this._dir("tokensDir"))) st = { state: "done" };
        } else if (kind === "set") {
          if ((await registry()).sets[a] === this._dir("tokensDir")) st = { state: "done" };
        }
      } catch (_e) { /* unknown — as not there */ }
      if (this.dl.get(key)?.state !== "probing") return;   // a download began meanwhile
      this.dl.set(key, st);
      this._paintKey(key);
    }

    async _take(el) {
      const key = el.dataset.dl;
      const st = this.dl.get(key);
      if (!key || st?.state === "busy") return;
      const [kind, a, b] = key.split(":");
      if (kind === "map") return this._takeMap(key, a, st);
      if (st?.state === "done") return;
      if (kind === "bd") {
        const r = this._backdrop(a);
        if (r) await this._download(key, r.title, (p) => installBackdrop(r, b, this._dir("backdropsDir"), p));
      } else if (kind === "tk") {
        const r = this._token(a);
        if (r) await this._download(key, r.name, (p) => installTokens({ key: a }, this._dir("tokensDir"), p));
      } else if (kind === "set") {
        const label = this.data?.sets.get(a)?.label ?? a;
        await this._download(key, label, (p) => installTokens({ group: a }, this._dir("tokensDir"), p));
        // The set's tokens are in the folder now: their own buttons are asked again.
        for (const k of [...this.dl.keys()]) if (k.startsWith(`tk:${a}/`) && this.dl.get(k)?.state !== "busy") this.dl.delete(k);
        this._paintDl();
      }
    }

    /** The format a release comes in: the gear's choice, as far as the release and the visitor's tier allow. */
    _wantFormat(r) {
      let fmt = game.settings.get(MODULE_ID, "format");
      const sets = r.sets ?? {};
      const { open } = offerOf(r, this._me(), base());
      if (fmt === "webp" && !(sets.fi > 0)) fmt = "webm";
      if (fmt !== "webp" && !open.includes("webm") && open.includes("stills")) fmt = "webp";   // a stills-only tier
      if (fmt === "lite" && !(sets.fvLite > 0 && sets.fvLite < (sets.fv ?? 0))) fmt = "webm";
      return FORMATS.includes(fmt) ? fmt : "webm";
    }

    /** A map: there already — to its scene (or, in another format, ask); not there — download, then to its scene. */
    async _takeMap(key, release, st) {
      const r = this._map(release);
      if (!r) return;
      if (!st || st.state === "probing") {   // clicked before the files were looked for
        const info = await probeMap(r).catch(() => null);
        st = info ? { state: "done", fmt: info.fmt, dir: info.dir } : { state: "none" };
        this.dl.set(key, st);
        this._paintKey(key);
      }
      const want = this._wantFormat(r);
      if (st?.state === "done") {
        if (st.fmt === want) return this._toScene(r, st);
        const choice = await this._askUpdate(r, st.fmt, want);
        if (choice === "open") return this._toScene(r, st);
        if (choice !== "update") return;
      }
      const res = await this._download(key, r.title, (p) => installMap(r, { fmt: want, base: base(), onProgress: p }));
      // Downloaded: to its scene — unless the gear says to stay («Open» on the button takes there any time).
      if (res && game.settings.get(MODULE_ID, "openAfter")) await this._toScene(r, res);
    }

    async _askUpdate(r, have, want) {
      const { DialogV2 } = foundry.applications.api;
      return DialogV2.wait({
        window: { title: L("upd.title") },
        content: `<p>${esc(L("upd.body", { title: r.title, have: L(`fmt.${have}`), want: L(`fmt.${want}`) }))}</p>`,
        buttons: [
          { action: "update", label: L("upd.yes"), default: true },
          { action: "open", label: L("upd.open") },
        ],
        rejectClose: false,
      });
    }

    // ── The last month's releases, downloaded by themselves (the gear; off by default) ──

    /** The month's maps: out this month and all of the last one (from its 1st, by the visitor's calendar), his to
     *  download — an exclusive only when it is his (offerOf) — newest first. */
    _autoReleases() {
      const me = this._me();
      const now = new Date();
      const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const from = day(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to = day(now);
      return (this.data?.maps ?? []).filter((r) => r.published >= from && r.published <= to && offerOf(r, me, base()).open.length > 0)
        .sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
    }

    /**
     * On entering (on signing in, and when the gear turns it on): «Releases available for automatic download» — the
     * month's maps not in Data yet, its name a link to its page on the site, its size beside (the owner, 22.10.2026).
     * The window comes only when there is one it has not shown before: whatever it showed counts as offered, however
     * it was closed (the owner: «I unticked it and closed the browser — why is it offered again? Only a new release on
     * the site would make sense»). A new one comes ticked as far as the limits go (this month's gigabytes, this hour's
     * links); the ones offered before are listed unticked, to be taken by hand. «Download» queues the ticked ones —
     * each scene imported as by hand, nothing opened. Once per opening of the window.
     */
    async _autoOffer() {
      if (this._autoAsked || !this.data || !this.root) return;
      if (!this._me().signedIn || !game.settings.get(MODULE_ID, "autoDownload")) return;
      this._autoAsked = true;
      const month = this._autoReleases();
      // Offered before — remembered while the release is still in the month's window.
      const shown = game.settings.get(MODULE_ID, "autoSkip");
      const seen = new Set(Object.keys(shown && typeof shown === "object" ? shown : {}).filter((id) => month.some((r) => r.release === id)));
      const missing = [];
      for (const r of month) {
        if (this.dl.get(`map:${r.release}`)?.state === "busy") continue;
        if (!(await probeMap(r).catch(() => null))) missing.push(r);
      }
      if (!missing.some((r) => !seen.has(r.release)) || !this.root) return;

      const q = this._me().quota ?? {};
      const GB = 1024 ** 3;   // as the site counts them (/api/me quota)
      const bytesOf = (r) => {
        const s = r.sets ?? {}, f = this._wantFormat(r);
        return Number(f === "webp" ? s.fi : f === "lite" ? s.fvLite : s.fv) || 0;
      };
      let roomBytes = Number.isFinite(q.gbLeft) ? q.gbLeft * GB : Infinity;
      let roomLinks = Number.isFinite(q.linksLeftThisHour) ? q.linksLeftThisHour : Infinity;
      const rows = missing.map((r) => {
        const bytes = bytesOf(r);
        const on = !seen.has(r.release) && bytes <= roomBytes && roomLinks > 0;
        if (on) { roomBytes -= bytes; roomLinks -= 1; }
        return { r, bytes, on };
      });
      const list = rows.map(({ r, bytes, on }) => `<li><label class="ab-auto-row">`
        + `<input type="checkbox" name="rel" value="${esc(r.release)}"${on ? " checked" : ""}>`
        + `<a href="${esc(`${base()}/map/${r.release}`)}" target="_blank" rel="noopener">${esc(r.title)}</a></label>`
        + `<span class="ab-auto-size">${esc(fmtSize(bytes))}</span></li>`).join("");
      const num = (v) => (Number.isFinite(Number(v)) ? String(v) : "—");
      // The ticked ones against the limits, again at every tick. Within them — not a word about limits (the owner,
      // 22.10.2026: «don't annoy him»); over them, «Download» is off and the line right above it says why, until
      // unticking brings it back within.
      const paintLimits = (root) => {
        const warn = root?.querySelector?.(".ab-auto-warn");
        if (!warn) return;
        const ticked = rows.filter(({ r }) => root.querySelector(`input[name="rel"][value="${CSS.escape(r.release)}"]`)?.checked);
        const bytes = ticked.reduce((s, x) => s + x.bytes, 0);
        const overGb = Number.isFinite(q.gbLeft) && bytes > q.gbLeft * GB;
        const overLinks = Number.isFinite(q.linksLeftThisHour) && ticked.length > q.linksLeftThisHour;
        warn.hidden = !(overGb || overLinks);
        warn.textContent = overGb ? L("auto.overGb", { size: (bytes / GB).toFixed(1), left: num(q.gbLeft) })
          : overLinks ? L("auto.overLinks", { n: num(q.linksLeftThisHour) }) : "";
        const button = root.querySelector('button[data-action="download"]');
        if (button) button.disabled = overGb || overLinks;
      };
      const picked = await foundry.applications.api.DialogV2.wait({
        window: { title: L("auto.title"), icon: "fa-solid fa-cloud-arrow-down" },
        classes: ["admaps-browser-auto"],
        position: { width: 480 },
        content: `<p>${esc(L("auto.lead"))}</p><ul class="ab-auto-list">${list}</ul><p class="ab-auto-warn" hidden></p>`,
        buttons: [{
          action: "download", label: L("download"), icon: "fa-solid fa-download", default: true,
          callback: (_ev, button) => [...button.form.querySelectorAll('input[name="rel"]')].map((i) => ({ id: i.value, on: i.checked })),
        }],
        rejectClose: false,
        render: (_ev, dialog) => {
          const root = dialog?.element ?? dialog;
          paintLimits(root);
          root?.addEventListener?.("change", () => paintLimits(root));
        },
      }).catch(() => null);
      // However it was closed, what it showed is offered by itself no more — until a release it has not shown comes.
      await game.settings.set(MODULE_ID, "autoSkip", Object.fromEntries([...seen, ...rows.map((x) => x.r.release)].map((id) => [id, 1])));
      if (!Array.isArray(picked)) return;
      const want = new Set(picked.filter((x) => x.on).map((x) => x.id));
      const todo = rows.map(({ r }) => r).filter((r) => want.has(r.release));
      if (!todo.length) return;
      ui.notifications.info(L("auto.start", { n: todo.length }));
      const done = await Promise.all(todo.map((r) => this._download(`map:${r.release}`, r.title,
        (p) => installMap(r, { fmt: this._wantFormat(r), base: base(), onProgress: p }))));
      ui.notifications.info(L("auto.done", { n: done.filter(Boolean).length, total: todo.length }));
    }

    async _toScene(r, info) {
      try {
        await openScene(r, info);
        await this.minimize?.();   // the scene is what he came for
      } catch (e) {
        ui.notifications.error(L("dl.openFailed", { title: esc(r.title), error: esc(e.message) }));
      }
    }

    /** Run one download in the queue, its button counting; the result, or null (failed, or the terms declined). */
    async _download(key, title, run) {
      const before = this.dl.get(key);
      this.dl.set(key, { state: "busy", p: 0 });
      this._paintKey(key);
      const job = this._queue.then(() => {
        let last = -1;
        return run((p) => {
          const pct = Math.floor(p * 100);
          if (pct === last) return;
          last = pct;
          this.dl.set(key, { state: "busy", p });
          this._paintKey(key);
        });
      });
      this._queue = job.catch(() => {});
      const back = () => this.dl.set(key, before?.state === "done" ? before : { state: "none" });
      try {
        const res = await job;
        if (res === null) { back(); this._paintKey(key); return null; }
        const st = { state: "done", ...(res && typeof res === "object" ? res : {}) };
        this.dl.set(key, st);
        this._paintKey(key);
        this._refreshQuota();
        return st;
      } catch (e) {
        back();
        this._paintKey(key);
        const error = e instanceof TypeError ? L("err.network") : e.message;
        ui.notifications.error(L("dl.failed", { title: esc(title), error: esc(error) }));
        return null;
      }
    }

    /** The limits again after a download — for the gear's panel; the shelf stays as it is. */
    async _refreshQuota() {
      const me = await fetchMe().catch(() => null);
      if (me) this.me = me;
      this._paintPrefs();
    }

    _paintLogin() {
      const box = this._$(".ab-login");
      if (!box) return;
      const lg = this.login;
      box.hidden = !lg;
      if (!lg) { box.innerHTML = ""; return; }
      box.innerHTML = `
        <p>${esc(L("login.step"))}</p>
        <div class="ab-code">${esc(lg.code)}</div>
        <div class="ab-login-btns">
          ${lg.verifyUrl ? `<a class="ab-btn ab-primary" href="${esc(lg.verifyUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i>${esc(L("login.open"))}</a>` : ""}
          <button type="button" class="ab-btn" data-ab="cancel">${esc(L("login.cancel"))}</button>
        </div>
        <p class="ab-wait">${esc(lg.msg ?? L("login.waiting"))}</p>`;
    }

    // ── Sign-in by code ──
    async _startLogin() {
      if (this.login || this._me().signedIn) return;
      let r;
      try {
        r = await startLogin();
      } catch (e) {
        ui.notifications.error(L("login.failed", { error: esc(e.message) }));
        return;
      }
      this.login = { ...r, expires: Date.now() + (r.expiresIn ?? 600) * 1000, msg: null, timer: null };
      this._paintAccount();
      // The site's page with the code filled in; blocked as a pop-up — the button in the panel opens it.
      if (r.verifyUrl) try { window.open(r.verifyUrl, "_blank", "noopener"); } catch (_e) { /* the link is in the panel */ }
      this._schedulePoll();
    }

    _schedulePoll() {
      const lg = this.login;
      if (!lg) return;
      lg.timer = setTimeout(() => this._poll(), Math.max(2, lg.interval ?? 3) * 1000);
    }

    async _poll() {
      const lg = this.login;
      if (!lg) return;
      if (Date.now() > lg.expires) return this._loginFailed("expired");
      let r;
      try { r = await pollLogin(lg.device); } catch (_e) { r = { pending: true }; }   // offline for a moment: ask again
      if (this.login !== lg) return;   // cancelled meanwhile
      if (r.done) {
        this.login = null;
        // What the site says of a person goes into a notification as text (core renders them as HTML).
        ui.notifications.info(L("login.done", { name: esc(r.user?.name || L("account")) }));
        await this._refreshMe();
        this._autoOffer();
        return;
      }
      if (r.error) return this._loginFailed(r.error, r.message);
      this._schedulePoll();
    }

    _loginFailed(kind, message) {
      this._stopLogin();
      this.login = null;
      if (kind === "denied") ui.notifications.warn(L("login.denied"));
      else if (kind === "expired") ui.notifications.warn(L("login.expired"));
      else ui.notifications.error(L("login.failed", { error: esc(message ?? kind) }));
      this._paintAccount();
    }

    _stopLogin() {
      if (this.login?.timer) clearTimeout(this.login.timer);
    }

    _cancelLogin() {
      this._stopLogin();
      this.login = null;
      this._paintAccount();
    }

    async _signOut() {
      await signOut();
      await this._refreshMe();
    }
  };
  return _Browser;
}

/** For the settings menu: the menu type must be an application — this one only opens the browser. */
export function openerClass() {
  const { ApplicationV2 } = foundry.applications.api;
  return class AdmapsBrowserOpener extends ApplicationV2 {
    async render() {
      openBrowser();
      return this;
    }
  };
}
