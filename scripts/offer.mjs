// modules/admaps-browser/scripts/offer.mjs
// What the visitor may take of a release — the site's own rule, ported from site/assets/cards.js (inCircle,
// promoCoversMe, promoShownToMe, offerOf, tierNeeded …) and app.js (promoLive), so the window paints the same
// buttons, FREE pills, order and «Access» line the site paints. Painting only: the server decides again when a
// download is asked for.
//
// me — the site's /api/me as it is: a guest gets one too (no sign-in, but the campaigns with their tiers).

// Each map's project: its own colour and short name. Cyber Maps is not sold through the shop — it is not here.
export const CAMPAIGNS = {
  adm: { short: "ADM", color: "#d9a441" },
  fbm: { short: "FBM", color: "#4b9fd5" },
};
export const campaignLook = (id) => CAMPAIGNS[id] ?? { short: String(id ?? "").slice(0, 3).toUpperCase() || "ADM", color: "#8fa0b2" };

// Where «Buy on Patreon» leads when the release has no shop link of its own.
export const SHOP_PAGES = {
  adm: "https://www.patreon.com/c/animatedmaps/shop",
  fbm: "https://www.patreon.com/c/aadmaps/shop",
};
export const DEFAULT_MEMBERSHIP = "https://www.patreon.com/c/animatedmaps/membership";
export const DEFAULT_HOME = "https://www.patreon.com/animatedmaps";
export const HOME_PAGES = { adm: "https://www.patreon.com/animatedmaps", fbm: "https://www.patreon.com/aadmaps" };
export const MEMBERSHIP_PAGES = { adm: "https://www.patreon.com/c/animatedmaps/membership", fbm: "https://www.patreon.com/c/aadmaps/membership" };

const vanityOf = (c) => c?.vanity || /patreon\.com\/(?:c\/)?([A-Za-z0-9_-]+)/.exec(c?.url ?? "")?.[1] || null;
export const membershipUrl = (c) => { const v = vanityOf(c); return v ? `https://www.patreon.com/c/${v}/membership` : null; };
export const campaignHome = (c) => { const v = vanityOf(c); return v ? `https://www.patreon.com/${v}` : null; };

/** The campaign of the follow-for-free link: the primary one. */
export const primaryHome = (me) => campaignHome(Object.values(me?.grants ?? {}).find((c) => c.is_primary)) || DEFAULT_HOME;

// Thirty days of being the new thing, off the human-facing date.
export const isNew = (r) => {
  const at = Date.parse(`${r.published ?? ""}T00:00:00Z`);
  return Number.isFinite(at) && at <= Date.now() && Date.now() - at < 30 * 86400e3;
};

/** A release opened by a purchase code from Patreon — the buyer's for good and whole. */
export const codeOwned = (r, me) => (me?.codes ?? []).includes(r.release);

/** Inside the circle of an exclusive: paying in its campaign on the day it came out (r.circle). */
export function inCircle(r, me) {
  if (!r.exclusive) return true;
  if (codeOwned(r, me)) return true;
  if (me?.allAccess) return true;   // Big Boss holds every exclusive
  const shops = me?.grants ?? {};
  const primary = Object.values(shops).find((c) => c.is_primary)?.id ?? Object.keys(shops)[0];
  const pay = shops[r.campaign || primary]?.pay;
  if (!pay?.paid) return false;
  if (!r.circle) return false;
  const at = Date.parse(`${r.circle}T00:00:00Z`);
  if (Number.isNaN(at)) return false;
  return (pay.spans ?? []).some((s) => !(s.from && at < s.from) && !(s.till && at > s.till));
}

/** The cheapest tier that opens any of the release's sets, past the release's own bar. */
export function tierNeeded(shop, r, exists) {
  const want = exists?.length ? exists : ["webm", "4k"];
  return (shop?.tiers ?? [])
    .filter((t) => want.some((v) => t[v] && t.rank >= (r?.minRank?.[v] ?? -1)))
    .sort((a, b) => a.rank - b.rank)[0] ?? null;
}

/** Straight to that tier's checkout, coming back to the map's page on the site. */
export function tierUrl(tier, r, fallback, base) {
  if (!tier?.checkout) return fallback;
  const back = r?.release ? `${base}/map/${r.release}` : `${base}/`;
  return `${tier.checkout}&redirect_uri=${encodeURIComponent(back)}`;
}

export function upgradeUrl(shop, r, variant, fallback, base) {
  const need = r?.minRank?.[variant] ?? -1;
  const tier = (shop?.tiers ?? [])
    .filter((t) => t[variant] && t.rank >= need)
    .sort((a, b) => a.rank - b.rank)[0];
  if (!tier) return fallback;
  const back = r?.release ? `${base}/map/${r.release}` : `${base}/`;
  return `${tier.checkout}&redirect_uri=${encodeURIComponent(back)}`;
}

/** Does the promotion name this visitor: one of his tiers, or «free» for any follower. Signed out never. */
export function promoCoversMe(r, me) {
  const f = r.free;
  if (!f || !(f.webm || f["4k"]) || !f.who?.length) return false;
  if (!me?.signedIn) return false;
  const mine = me.tierIds ?? [];
  return f.who.some((w) => mine.includes(w)) || (f.who.includes("free") && !!me.backdrops);
}

/** Should he be told it is free: wider — a «free» promotion is shown to a guest too. The pill and the order follow it. */
export function promoShownToMe(r, me) {
  const f = r.free;
  if (!f || !(f.webm || f["4k"]) || !f.who?.length) return false;
  return promoCoversMe(r, me) || f.who.includes("free");
}

/** Running right now, and shown to this visitor. What the order uses. */
export function promoLive(r, me) {
  if (!promoShownToMe(r, me)) return false;
  if (r.free.forever) return true;
  const now = Date.now();
  return now >= r.free.from && now <= r.free.till;
}

/**
 * What this visitor may have of a release, family by family: the Foundry files ride on the webm tier, the 4K files
 * on the 4k tier. The card, the release page and its «Access» line paint by it.
 */
export function offerOf(r, me, base) {
  me ??= { signedIn: false, can: {} };
  const shops = me.grants ?? {};
  const primary = Object.values(shops).find((c) => c.is_primary)?.id ?? Object.keys(shops)[0];
  const shop = shops[r.campaign || primary] ?? null;
  const shopUrl = membershipUrl(shop) || MEMBERSHIP_PAGES[r.campaign || primary] || DEFAULT_MEMBERSHIP;
  const homeUrl = campaignHome(shop) || HOME_PAGES[r.campaign || primary] || DEFAULT_HOME;
  const can = shop ? { webm: shop.webm, "4k": shop["4k"], stills: shop.stills ?? shop.webm } : (me.can ?? {});
  const rank = shop ? shop.rank : (me.rank ?? -1);

  const outsideCircle = !inCircle(r, me);

  const inPromo = promoCoversMe(r, me);
  const covers = r.free ? !!(r.free.webm || r.free["4k"]) : false;
  const running = !!r.free && (!!r.free.forever || (Date.now() >= r.free.from && Date.now() <= r.free.till));
  const freeNow = covers && inPromo && running;
  const freeSoon = !r.free?.forever && covers && inPromo && Date.now() < r.free.from;
  const shown = promoShownToMe(r, me);
  const badgeNow = covers && shown && running;
  const badgeSoon = !r.free?.forever && covers && shown && Date.now() < r.free.from;

  const byCode = codeOwned(r, me);
  const families = {};
  for (const v of ["webm", "4k"]) {
    // The promotion first, even against an exclusive — the server's order.
    const byWindow = freeNow && !!r.free?.[v];
    let ok;
    if (byWindow) ok = true;
    else if (byCode) ok = true;
    else if (outsideCircle) ok = false;
    else if (r.exclusive) ok = true;
    else ok = !!can[v] && rank >= (r.minRank?.[v] ?? -1);
    families[v] = { has: r.sizes?.[v] != null, ok, free: byWindow, locked: !ok, upgradeUrl: upgradeUrl(shop, r, v, shopUrl, base) };
  }
  // HD stills only (the stills right): a tier without webm but with stills gets the one row of stills.
  const stillsOk = families.webm.ok
    || (!outsideCircle && !r.exclusive && !!can.stills && rank >= (r.minRank?.webm ?? -1));
  families.stills = {
    has: (r.sets?.fi ?? 0) > 0, ok: stillsOk, free: families.webm.free, locked: !stillsOk,
    upgradeUrl: upgradeUrl(shop, r, "stills", shopUrl, base),
  };
  const exists = ["webm", "4k"].filter((v) => families[v].has);
  const open = exists.filter((v) => families[v].ok);
  if (!families.webm.ok && families.stills.ok && families.stills.has) open.push("stills");
  const stillsTier = (shop?.tiers ?? []).filter((t) => t.stills && !t.webm && t.rank >= (r.minRank?.webm ?? -1))
    .sort((a, b) => a.rank - b.rank)[0] ?? null;
  // A tier is named only where it decides: not for a post without archives, not for an exclusive, not during a promotion.
  const need = exists.length && !r.exclusive && !badgeNow ? tierNeeded(shop, r, exists) : null;

  return {
    me, shop, shopUrl, homeUrl, primary, outsideCircle,
    campId: r.campaign || primary || "adm",
    need, needUrl: tierUrl(need, r, shopUrl, base),
    needImages: need && families.stills.has && stillsTier && stillsTier.rank < need.rank ? stillsTier : null,
    inPromo, running, freeNow, freeSoon, badgeNow, badgeSoon,
    // FREE for any follower, but this visitor cannot take it yet: following for free is the one step left.
    followFree: badgeNow && !freeNow && !!r.free?.who?.includes("free"),
    families, exists, open,
    buyUrl: r.shopUrl || SHOP_PAGES[r.campaign || primary] || SHOP_PAGES.adm,
  };
}
