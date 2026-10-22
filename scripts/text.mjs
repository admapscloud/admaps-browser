// modules/admaps-browser/scripts/text.mjs
// The window's words. admaps.cloud speaks English; here its interface speaks the module's twelve languages
// (lang/*.json). What the site shows as data — titles, tags, settings, tier names, descriptions — stays as it is there.

const P = "ADMAPS_BROWSER.";
const LOCALES = { cn: "zh-CN" };

export const esc = (s) => String(s ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export const L = (k, data) => (data ? game.i18n.format(P + k, data) : game.i18n.localize(P + k));

const has = (k) => (typeof game.i18n.has === "function" ? game.i18n.has(P + k, false) : game.i18n.localize(P + k) !== P + k);

/** The interface language as Intl knows it (Foundry calls Chinese «cn»). */
export const locale = () => LOCALES[game.i18n.lang] ?? game.i18n.lang ?? "en";

let rules = null;
let rulesFor = null;
/** A counted phrase: key.one / key.few / key.many / key.other by the language's own plural rule, {n} filled in. */
export function plural(k, n, data = {}) {
  const lang = locale();
  if (rulesFor !== lang) {
    try { rules = new Intl.PluralRules(lang); } catch (_e) { rules = new Intl.PluralRules("en"); }
    rulesFor = lang;
  }
  const cat = `${k}.${rules.select(n)}`;
  return L(has(cat) ? cat : `${k}.other`, { n, ...data });
}

/**
 * A sentence with markup in it: the words are escaped, each {name} becomes the HTML given for it — a link, a bold
 * word, a folder name in code. A {name} not given stays as written.
 */
export function html(k, parts = {}) {
  return L(k).split(/(\{\w+\})/).map((s) => {
    const m = /^\{(\w+)\}$/.exec(s);
    return m && m[1] in parts ? parts[m[1]] : esc(s);
  }).join("");
}

/** «March 15, 2026» in the interface language; UTC, as the site counts the day. */
export function dayText(day) {
  const at = Date.parse(`${day ?? ""}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  try {
    return new Date(at).toLocaleDateString(locale(), { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  } catch (_e) {
    return new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
}
