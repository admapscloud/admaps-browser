// modules/admaps-browser/scripts/pages.mjs
// A map's page and a backdrop's page inside the window — the site's own (tools/release-page.mjs for the markup,
// site/assets/release.js and backdrop.js for what runs on it), ported whole: the preview with its frames, dots,
// the props frame and the video; the version tiles; tags and settings that lead back to the shelf filtered by them;
// the description with its polls; the facts with «Access»; the buttons and their hints; «Download & Setup»; the
// systems line; «More like this».
//
// Links that stay on the site there stay in the window here (data-ab, see browser.mjs); «Download» brings the release
// into Foundry (data-dl, install.mjs).

import { L, esc, html, dayText } from "./text.mjs";
import { offerOf, primaryHome } from "./offer.mjs";
import { DL_ICON, cardOf, fitAllTags, teardown, freeTagHtml, remaining, decodeImage, seenImage, putFrame } from "./cards.mjs";
import { renderRich, pollBlocks, mountPolls } from "./richtext.mjs";
import { pickRecs } from "./recs.mjs";

const ext = 'target="_blank" rel="noopener"';
const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;

// The maps are system-agnostic; the systems people search by, said out loud.
const SYSTEMS = "D&D 5e (2014 & 2024), Pathfinder 2e, Daggerheart, Draw Steel, Shadowdark, Savage Worlds, "
  + "Tales of the Valiant, Dragonbane, Old-School Essentials";

const CREATORS = {
  adm: { name: "Animated Dungeon Maps", url: "https://www.patreon.com/animatedmaps" },
  fbm: { name: "Fantasy Battle Maps", url: "https://www.patreon.com/aadmaps" },
};
const creatorOf = (r) => CREATORS[r?.campaign] ?? CREATORS.adm;
const creatorLink = (c) => `<a href="${esc(c.url)}" ${ext}>${esc(c.name)}</a>`;

// Our own module in «Recommended modules» — a link to its page; others' — as text.
const MODULE_LINKS = { admapstools: "https://github.com/admapscloud/admaps-tools" };
const modulesHtml = (mods) => mods.map((m) => {
  const url = MODULE_LINKS[String(m).toLowerCase().replace(/[^a-z0-9]/g, "")];
  return url ? `<a href="${url}" ${ext}>${esc(m)}</a>` : esc(m);
}).join(", ");

const PLAY_SVG = '<svg viewBox="0 0 68 48" width="68" height="48" aria-hidden="true">'
  + '<path class="pbg" d="M66.5 7.7a8 8 0 0 0-5.7-5.7C55.8.6 34 .6 34 .6s-21.8 0-26.8 1.4a8 8 0 0 0-5.7 5.7A83 83 0 0 0 .1 24a83 83 0 0 0 1.4 16.3 8 8 0 0 0 5.7 5.7c5 1.4 26.8 1.4 26.8 1.4s21.8 0 26.8-1.4a8 8 0 0 0 5.7-5.7A83 83 0 0 0 67.9 24a83 83 0 0 0-1.4-16.3z"/>'
  + '<path class="parrow" d="M45 24 27 14v20z"/></svg>';

/** Bytes per set (site/assets/picker.js setsOf): an entry from before the loose layout has only family totals. */
function setsOf(r) {
  const s = r?.sets;
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  if (s && typeof s === "object") return { fi: n(s.fi), fv: n(s.fv), fx: n(s.fx), ki: n(s.ki), kv: n(s.kv) };
  return { fi: 0, fv: n(r?.sizes?.webm), fx: 0, ki: 0, kv: n(r?.sizes?.["4k"]) };
}

/** A version's caption: its tags and the variant after «~» (Boss~left → «Dungeons · Lair · Boss · left»). */
function versionLabel(v) {
  const variant = /~([A-Za-z0-9_]+)$/.exec(v?.slug ?? "")?.[1]?.replaceAll("_", " ");
  return [...(v?.tags ?? []), ...(variant ? [variant] : [])].join(" · ");
}

const systemsLine = () => `<p class="systems">${esc(L("systems", { list: SYSTEMS }))}</p>`;

/** «Great for adventures in:» — each setting leads to the shelf filtered by it. */
function settingsBlock(r, base) {
  if (!r.settings?.length) return "";
  return `<div class="settings">
        <p><b>${esc(L("settings.lead"))}</b> ${r.settings.map((s) =>
          `<a href="${esc(`${base}/?adventure=${encodeURIComponent(s)}`)}" ${ext} data-ab="shelf" data-pane="catalog" data-adventure="${esc(s)}">${esc(s)}</a>`).join(", ")}</p>
        <p class="disclaimer">${esc(L("settings.note"))}</p>
      </div>`;
}

const aboutBlock = (text) => {
  const h = pollBlocks(renderRich(text));
  return h.trim() ? `<div class="about">${h}</div>` : "";
};

/** The video of switching versions in Foundry: plays by itself, no sound, no controls. */
function demoBlock(r, base) {
  if (!r.demo) return "";
  const v = r.demo.v ? `?v=${encodeURIComponent(r.demo.v)}` : "";
  return `<figure class="vardemo">
        <figcaption>${html("demo", { tools: "<b>ADMaps Tools</b>" })}</figcaption>
        <video autoplay muted loop playsinline preload="metadata" width="800" height="450">
          <source src="${esc(`${base}/media/${r.release}/demo.webm${v}`)}" type="video/webm">
          <source src="${esc(`${base}/media/${r.release}/demo.mp4${v}`)}" type="video/mp4">
        </video>
      </figure>`;
}

/** «More like this»: picked once per page view, drawn again when the visitor's rights change. */
function recsOf(el, pick) {
  const box = el.querySelector(".recs");
  const grid = box.querySelector(".grid");
  const { picks, mine } = pickRecs(pick);
  return () => {
    for (const c of grid.children) teardown(c);
    if (!picks.length) { box.hidden = true; return; }
    grid.replaceChildren(...picks.map((x) => cardOf(x, (t) => mine.has(String(t).toLowerCase()))));
    box.hidden = false;
    fitAllTags(grid);
  };
}

// ------------------------------------------------------------------ the map's page

/**
 * ctx: { base, me(), maps, backdrops, scroller() }. Returns { el, paint, destroy }: paint — the visitor's rights
 * again (signed in or out, a promotion ran out), destroy — the page is left.
 */
export function mapPage(r, ctx) {
  const base = ctx.base;
  const sets = setsOf(r);
  const has = {
    webm: r.sizes?.webm != null || sets.fi + sets.fv > 0,
    "4k": r.sizes?.["4k"] != null || sets.ki + sets.kv > 0,
  };
  const anyFiles = has.webm || has["4k"];
  const frames = r.preview?.frames ?? 1;
  const props = !!r.preview?.props;
  const pv = r.preview?.v ? `?v=${encodeURIComponent(r.preview.v)}` : "";
  const shotUrl = (i) => `${base}/media/${r.release}/preview-${i + 1}.webp${pv}`;

  const facts = [
    ["creator", creatorLink(creatorOf(r))],
    ["versions", r.versions.length > 1 ? esc(String(r.versions.length)) : null],
    ["grid", r.cells ? esc(L("gridCells", { x: r.cells.x, y: r.cells.y })) : null],
    ["square", r.grid?.px
      ? [
          ...(has["4k"] ? [L("square4k", { px: r.grid.px * 2 })] : []),
          ...(has.webm || !has["4k"] ? [L("squareHd", { px: r.grid.px })] : []),
        ].map(esc).join("<br>")
      : r.grid ? esc(L("perCell", { d: r.grid.distance, u: r.grid.units })) : null],
    ["foundry", r.foundry ? esc(`v${r.foundry}`) : null],
    ["modules", r.modules?.length ? modulesHtml(r.modules) : null],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  // A tile per version — its preview frame; only the versions in the preview; a single version gets no block.
  const versionsBlock = r.versions.length > 1 ? `
      <ul class="versions">${r.versions.slice(0, frames).map((v, i) => `
        <li><span class="shot"><img src="${esc(shotUrl(i))}" alt="" loading="lazy" decoding="async" width="800" height="450"></span>
          <span class="cap">${esc(versionLabel(v))}</span></li>`).join("")}
      </ul>` : "";

  const dots = r.versions.slice(0, frames).map((v, i) =>
    `<button class="dot" type="button" aria-current="${i === 0}" title="${esc(versionLabel(v))}" data-i="${i}"><i></i></button>`).join("")
    + (props ? `<button class="dot" type="button" title="${esc(L("propsLayout"))}" data-i="${frames}"><i></i></button>` : "");

  const setup = anyFiles ? `
    <h2>${esc(L("setup.title"))}</h2>
    <div class="setup">
      <p>${html("setup.intro", { download: `<b>${esc(L("download"))}</b>`, both: has.webm && has["4k"] ? esc(L("setup.both")) : "" })}</p>${has.webm ? `
      <h3>${esc(L("setup.vttTitle"))}</h3>
      <p>${html("setup.vtt1", { admaps: "<code>_ADMaps</code>", data: "<code>Data</code>", worlds: "<code>worlds</code>", modules: "<code>modules</code>" })}</p>
      <p>${html("setup.vtt2", { json: "<code>.json</code>" })}</p>` : ""}${has["4k"] ? `
      <h3>${esc(L("setup.tvTitle"))}</h3>
      <p>${html("setup.tv", { folder: "<code>&lt;map_name&gt;_4k</code>" })}</p>` : ""}
    </div>` : "";

  const el = document.createElement("div");
  el.className = "ab-page";
  el.innerHTML = `
  <nav class="crumbs"><a href="${esc(`${base}/`)}" ${ext} data-ab="shelf" data-pane="catalog">${esc(L("allMaps"))}</a> <span>/</span> <b>${esc(r.title)}</b></nav>
  <div class="toprow">
    <div class="hero">
      <div class="stage" style="--tint:${esc(r.preview?.colors?.[0] ?? "#05070a")}">
        <div class="layer"></div><div class="layer"></div>
        ${r.youtube ? `<button class="play" type="button" aria-label="${esc(L("playVideo"))}">${PLAY_SVG}</button>` : ""}
        <div class="dots">${dots}</div>
        <div class="vlabel">${esc(r.versions[0] ? versionLabel(r.versions[0]) : "")}</div>
      </div>
      ${versionsBlock}
      <ul class="tags">${r.tags.map((t) =>
        `<li><a href="${esc(`${base}/?tags=${encodeURIComponent(t)}`)}" ${ext} data-ab="shelf" data-pane="catalog" data-tags="${esc(t)}">${esc(t)}</a></li>`).join("")}
      </ul>
      ${r.descRight ? "" : aboutBlock(r.description)}
      ${r.descRight ? "" : settingsBlock(r, base)}
      ${r.descRight ? "" : demoBlock(r, base)}
    </div>
    <aside>
      <h1>${esc(r.title)}</h1>
      <dl class="facts">${facts.map(([k, v]) => `<div data-fact="${k}"><dt>${esc(L(`fact.${k}`))}</dt><dd>${v}</dd></div>`).join("")}
      </dl>
      ${r.descRight ? aboutBlock(r.description) : ""}
      ${r.descRight ? settingsBlock(r, base) : ""}
      ${r.descRight ? demoBlock(r, base) : ""}
      <div class="buy">
        <p class="hint"></p>
        ${anyFiles ? `<button class="dl ab-take" type="button" data-ab="take" data-dl="map:${esc(r.release)}" hidden>${DL_ICON}<span>${esc(L("download"))}</span></button>` : ""}
        <a class="dl wide ab-wide" ${ext} hidden></a>
        <button class="dl wide ab-wide-in" type="button" data-ab="signin" hidden>${esc(L("signIn"))}</button>
      </div>
    </aside>
  </div>
  <section class="wide">
    ${setup}
    ${systemsLine()}
  </section>
  <section class="wide recs" hidden>
    <h2>${esc(L("recs"))}</h2>
    <div class="grid"></div>
  </section>`;

  const $ = (s) => el.querySelector(s);
  const stage = $(".hero .stage");
  const renderRecs = recsOf(el, { release: r.release, maps: ctx.maps, backdrops: ctx.backdrops });

  // ---- the visitor's rights: the FREE pill, «Access», the buttons and the hint
  const paint = () => {
    const me = ctx.me();
    const { shop, shopUrl, homeUrl, buyUrl, outsideCircle, running, badgeNow, badgeSoon, followFree, need, needUrl, needImages, families, exists, open } = offerOf(r, me, base);

    let pills = stage.querySelector(".pills");
    if (!pills) {
      pills = document.createElement("div");
      pills.className = "pills";
      stage.append(pills);
    }
    pills.innerHTML = freeTagHtml(r, badgeNow, badgeSoon);
    const ft = pills.querySelector(".freetag[data-till]");
    if (ft) ft.querySelector("span").textContent = remaining(Number(ft.dataset.till)) ?? "";

    // What opens the map — a line in the facts; an exclusive opens by a date, not by a tier.
    const day = dayText(r.circle);
    const accessText = r.exclusive
      ? (day ? L("access.asOf", { date: day }) : L("access.monthly"))
      : need ? L("access.tier", { tier: need.name }) + (needImages ? L("access.images", { tier: needImages.name }) : "") : null;
    const factsEl = $(".facts");
    let row = factsEl.querySelector('[data-fact="access"]');
    if (accessText) {
      if (!row) {
        row = document.createElement("div");
        row.dataset.fact = "access";
        row.innerHTML = `<dt>${esc(L("fact.access"))}</dt><dd></dd>`;
        const anchor = factsEl.querySelector('[data-fact="versions"]') ?? factsEl.querySelector('[data-fact="creator"]');
        if (anchor) anchor.after(row); else factsEl.prepend(row);
      }
      row.querySelector("dd").textContent = accessText;
    } else row?.remove();

    const take = $(".ab-take");
    const wide = $(".ab-wide");
    const signIn = $(".ab-wide-in");
    const hint = $(".buy .hint");
    const anyOpen = open.length > 0;
    signIn.hidden = true;

    if (take) {
      take.hidden = !anyOpen;
      const allFree = anyOpen && open.every((v) => families[v].free);
      take.toggleAttribute("data-free", allFree);
      take.querySelector("span").textContent = allFree ? L("downloadFree") : L("download");
    }

    const link = (text, href) => { wide.textContent = text; wide.href = href; wide.hidden = false; };
    if (exists.length === 0) {
      // A post with no files sells with its words; the one door worth showing is a missed exclusive's shop.
      wide.hidden = true;
      if (outsideCircle) link(L("buy"), buyUrl);
      hint.textContent = "";
      return;
    }
    wide.hidden = true;
    if (!anyOpen) {
      if (followFree && !me.signedIn) signIn.hidden = false;
      else if (followFree) link(L("joinFree"), homeUrl);
      else if (outsideCircle) link(L("buy"), buyUrl);
      else if (!me.signedIn) signIn.hidden = false;
      else link(need ? L("joinTier", { tier: need.name }) : L("availableOn", { name: shop?.name || "Patreon" }), need ? needUrl : shopUrl);
    }

    const freeHint = !anyOpen && running && !me.signedIn && r.free?.who?.includes("free");
    if (freeHint) hint.innerHTML = html("hint.freeNow", { free: `<b class="freeword">${esc(L("free"))}</b>` });
    else if (anyOpen) hint.textContent = L("hint.pick");
    else if (r.exclusive && outsideCircle) hint.textContent = day ? L("hint.exclusiveAsOf", { day }) : L("hint.exclusiveWhen");
    else hint.textContent = "";
  };

  // ---- version captions: the FULL line at the bottom, the short rest on top; breaks only between tags
  const caps = [...el.querySelectorAll(".versions .cap")];
  let capsRo = null;
  if (caps.length) {
    const cx = document.createElement("canvas").getContext("2d");
    const layout = (cap) => {
      const text = (cap.dataset.text ??= cap.textContent.trim());
      const parts = text.split(" · ");
      if (parts.length < 2) { cap.textContent = text; return; }
      const cs = getComputedStyle(cap);
      const width = cap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      if (width <= 0) return;
      cx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const spacing = parseFloat(cs.letterSpacing) || 0;
      const fits = (s) => cx.measureText(s).width + spacing * s.length <= width;
      const tokens = parts.map((w, i) => (i < parts.length - 1 ? `${w} ·` : w));
      const lines = [];
      let end = tokens.length;
      while (end > 0) {
        let start = end - 1;
        while (start > 0 && fits(tokens.slice(start - 1, end).join(" "))) start--;
        lines.unshift(tokens.slice(start, end).join(" "));
        end = start;
      }
      cap.replaceChildren(...lines.flatMap((l, i) => (i ? [document.createElement("br"), l] : [l])));
    };
    const all = () => caps.forEach(layout);
    capsRo = new ResizeObserver(all);
    capsRo.observe(el.querySelector(".versions"));
    document.fonts?.ready.then(all);
  }

  // ---- the preview: frames cross-fade, dots, version tiles, the props frame, the video on the first click
  const shots = frames + (props ? 1 : 0);
  const layers = [...el.querySelectorAll(".hero .layer")];
  const dotEls = [...el.querySelectorAll(".hero .dot")];
  const label = $(".hero .vlabel");
  const names = dotEls.map((d) => d.title);
  const urlOf = (k) => `${base}/media/${r.release}/preview-${props && k >= frames ? "props" : k + 1}.webp${pv}`;
  // The frames the shelf has shown already come at once (cards.mjs keeps them for the session).
  const cache = new Map();
  const shot = (k) => {
    let p = cache.get(k);
    if (!p) {
      p = decodeImage(urlOf(k)).then((x) => { if (!x) cache.delete(k); return x; });
      cache.set(k, p);
    }
    return p;
  };
  let cur = 0, front = 0, timer = null, held = false, shown = false, seq = 0, target = 0, alive = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const tiles = [...el.querySelectorAll(".versions li")];

  const paintFrame = async (k) => {
    const my = ++seq;
    target = k;
    const known = seenImage(urlOf(k));
    const img = await shot(k);
    if (!alive || my !== seq || !img) return false;
    const url = `url("${urlOf(k)}")`;
    if (!shown) {
      putFrame(layers[front], urlOf(k), known);
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
    dotEls.forEach((d, i) => d.setAttribute("aria-current", String(i === k)));
    tiles.forEach((t, i) => t.setAttribute("aria-current", String(i === k)));
    if (names[k]) label.textContent = names[k];
    if (shots > 1) shot((k + 1) % shots);
    return true;
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = null;
    if (!alive || held || !shown || shots < 2 || reduced.matches) return;
    timer = setTimeout(async () => {
      timer = null;
      await paintFrame((cur + 1) % shots);
      if (!held) schedule();
    }, 3200);
  };
  paintFrame(0).then((ok) => { if (ok) schedule(); });
  dotEls.forEach((d) => d.addEventListener("click", () => { held = false; paintFrame(+d.dataset.i).then((ok) => { if (ok) schedule(); }); }));

  const hero = $(".hero");
  const play = $(".hero .play");
  let frame = null;
  const stopVideo = () => {
    if (!frame) return;
    frame.remove();
    frame = null;
    hero.classList.remove("playing");
    if (play) stage.append(play);
  };
  const showVersion = (k) => {
    stopVideo();
    held = true;
    clearTimeout(timer);
    if (k !== target || k !== cur) paintFrame(k);
    // The preview gone out of view: the window's body comes to it.
    const box = ctx.scroller?.();
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    const bottom = box.getBoundingClientRect().bottom;
    const rr = stage.getBoundingClientRect();
    if (rr.top < top || rr.bottom > bottom) {
      const want = top + Math.max(0, (bottom - top - rr.height) / 2);
      box.scrollBy({ top: rr.top - want, behavior: reduced.matches ? "auto" : "smooth" });
    }
  };
  tiles.forEach((t, i) => {
    if (i === 0) t.setAttribute("aria-current", "true");
    if (i >= frames) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick";
    b.append(...t.childNodes);
    t.append(b);
    b.addEventListener("click", () => showVersion(i));
  });
  const onVisible = () => { if (document.hidden) clearTimeout(timer); else if (!held) schedule(); };
  document.addEventListener("visibilitychange", onVisible);
  if (play && r.youtube) {
    play.addEventListener("click", () => {
      held = true;
      clearTimeout(timer);
      frame = document.createElement("iframe");
      const params = new URLSearchParams({ autoplay: "1", rel: "0", playsinline: "1", modestbranding: "1" });
      frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.youtube)}?${params}`;
      frame.title = r.title;
      frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      stage.append(frame);
      hero.classList.add("playing");
      play.remove();
    });
  }

  mountPolls(el, base, `${base}/map/${r.release}`).catch(() => {});

  return {
    el,
    paint() { paint(); renderRecs(); },
    destroy() {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      capsRo?.disconnect();
      stopVideo();
      for (const v of el.querySelectorAll("video")) { v.pause(); v.removeAttribute("src"); for (const s of v.querySelectorAll("source")) s.remove(); v.load(); }
      for (const c of el.querySelectorAll(".recs .grid > .card")) teardown(c);
    },
  };
}

// ------------------------------------------------------------------ the backdrop's page

/** One scene per backdrop: no variants, no cross-fade; the two files for any follower, free membership included. */
export function backdropPage(r, ctx) {
  const base = ctx.base;
  const kinds = [r.webm && "WEBM", r.webp && "WEBP"].filter(Boolean).join(" + ");
  const el = document.createElement("div");
  el.className = "ab-page";
  el.innerHTML = `
  <nav class="crumbs"><a href="${esc(`${base}/backdrops/`)}" ${ext} data-ab="shelf" data-pane="backdrops">${esc(L("allBackdrops"))}</a> <span>/</span> <b>${esc(r.title)}</b></nav>
  <div class="toprow">
    <div class="hero">
      <div class="stage" style="--tint:${esc(r.preview?.colors?.[0] ?? "#05070a")}">
        <div class="layer"></div><div class="layer"></div>
      </div>
      <ul class="tags">${r.tags.map((t) =>
        `<li><a href="${esc(`${base}/backdrops/?tags=${encodeURIComponent(t)}`)}" ${ext} data-ab="shelf" data-pane="backdrops" data-tags="${esc(t)}">${esc(t)}</a></li>`).join("")}
      </ul>
      ${systemsLine()}
    </div>
    <aside>
      <h1>${esc(r.title)}</h1>
      <dl class="facts">
        <div data-fact="creator"><dt>${esc(L("fact.creator"))}</dt><dd>${creatorLink(CREATORS.adm)}</dd></div>
        <div data-fact="size"><dt>${esc(L("fact.size"))}</dt><dd>1920 × 1080</dd></div>
        <div data-fact="format"><dt>${esc(L("fact.format"))}</dt><dd>${esc(kinds)}</dd></div>
      </dl>
      <div class="buy">
        <p class="hint">${esc(L("hint.backdrops"))}</p>
        ${r.webp ? `<button type="button" class="dl ab-take" data-ab="take" data-dl="bd:${esc(r.backdrop)}:webp" hidden><span>${esc(L("downloadWebp"))}</span><em>${mb(r.webp.bytes)}</em></button>` : ""}
        ${r.webm ? `<button type="button" class="dl ab-take" data-ab="take" data-dl="bd:${esc(r.backdrop)}:webm" hidden><span>${esc(L("downloadWebm"))}</span><em>${mb(r.webm.bytes)}</em></button>` : ""}
        <a class="dl wide ab-wide" ${ext} hidden></a>
        <button class="dl wide ab-wide-in" type="button" data-ab="signin" hidden>${esc(L("signIn"))}</button>
      </div>
    </aside>
  </div>
  <section class="wide recs" hidden>
    <h2>${esc(L("recs"))}</h2>
    <div class="grid"></div>
  </section>`;

  const $ = (s) => el.querySelector(s);
  const renderRecs = recsOf(el, { backdrop: r.backdrop, maps: ctx.maps, backdrops: ctx.backdrops });

  const paint = () => {
    const me = ctx.me();
    const open = !!me.backdrops;
    for (const a of el.querySelectorAll(".ab-take")) a.hidden = !open;
    const wide = $(".ab-wide");
    const signIn = $(".ab-wide-in");
    wide.hidden = true;
    signIn.hidden = open || !!me.signedIn;
    if (!open && me.signedIn) {
      wide.textContent = L("joinFree");
      wide.href = primaryHome(me);
      wide.hidden = false;
    }
    const hint = $(".buy .hint");
    hint.textContent = open ? "" : L("hint.backdrops");
    hint.hidden = open;
  };

  // One picture: decoded first, then shown — at once when the shelf has shown it already.
  let alive = true;
  (async () => {
    const src = `${base}/bmedia/${r.backdrop}/preview.webp`;
    const known = seenImage(src);
    const img = await decodeImage(src);
    if (!alive || !img) return;
    putFrame(el.querySelector(".hero .layer"), src, known);
  })();

  return {
    el,
    paint() { paint(); renderRecs(); },
    destroy() {
      alive = false;
      for (const c of el.querySelectorAll(".recs .grid > .card")) teardown(c);
    },
  };
}
