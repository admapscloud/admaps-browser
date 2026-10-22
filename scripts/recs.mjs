// modules/admaps-browser/scripts/recs.mjs
// «More like this» under a map or a backdrop page — the site's own pick (site/assets/recs.js), over the shelves the
// window has already loaded:
//   - kin first: a backdrop named after the map it was cut from, and the map to its backdrops;
//   - then the page's theme (its first tag), every same-theme row before any other theme;
//   - inside a theme, the shared tags besides the theme plus two for every word the names share, in tiers
//     (three or more, two, one, none), a lower tier only when the ones above are spent; a weighted draw (s+1)²;
//   - six when there are six: three maps and three backdrops, a short shelf hands its seats to the other.

/** { picks, mine } — the rows to show, and the page's own tags (lowercased) for the accent on theirs. */
export function pickRecs({ release = null, backdrop = null, maps = [], backdrops = [] }) {
  const self = release ? maps.find((x) => x.release === release) : backdrops.find((x) => x.backdrop === backdrop);
  const ownTags = (self?.tags ?? []).map((t) => String(t).toLowerCase());
  const mine = new Set(ownTags);
  if (!mine.size) return { picks: [], mine };
  const theme = ownTags[0];
  const themeOf = (x) => String(x?.tags?.[0] ?? "").toLowerCase();

  const score = (x) => (Array.isArray(x.tags)
    ? x.tags.reduce((n, t) => n + (String(t).toLowerCase() !== theme && mine.has(String(t).toLowerCase())), 0) : 0);

  const STOP = new Set(["and", "the", "of", "a", "an"]);
  const words = (v) => new Set(String(v ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)));
  const bdName = (slug) => String(slug ?? "").split("--")[0];
  const selfWords = release ? words(release) : words(bdName(backdrop));
  const kinOf = (x) => {
    if (!selfWords.size) return false;
    if (release) {
      const w = words(bdName(x.backdrop));
      return w.size > 0 && [...w].every((t) => selfWords.has(t));
    }
    const w = words(x.release);
    return w.size > 0 && [...selfWords].every((t) => w.has(t));
  };
  const KIN = 99;

  const stem = (w) => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y`
    : w.length > 4 && /(s|x|z|ch|sh)es$/.test(w) ? w.slice(0, -2)
      : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  const stems = (v) => new Set([...words(v)].filter((w) => w.length >= 3).map(stem).filter((w) => w !== stem(theme)));
  const selfStems = stems(release ? release : bdName(backdrop));
  const nameHits = (x) => {
    if (!selfStems.size) return 0;
    const own = stems(x.release ? x.release : bdName(x.backdrop));
    let n = 0;
    for (const w of own) n += selfStems.has(w);
    return n;
  };

  const pool = (rows, cross) => {
    const scored = rows.map((x) => {
      const kin = cross && kinOf(x);
      const s = score(x) + 2 * nameHits(x);
      return { x, s: kin ? Math.max(s, KIN) : s, rank: kin ? 2 : themeOf(x) === theme ? 1 : 0 };
    });
    const byOverlap = (rank) => {
      const g = scored.filter((p) => p.rank === rank);
      return [g.filter((p) => p.s >= 3), g.filter((p) => p.s === 2), g.filter((p) => p.s === 1), g.filter((p) => p.s === 0)];
    };
    return { tiers: [scored.filter((p) => p.rank === 2), ...byOverlap(1), ...byOverlap(0)] };
  };
  const mapPool = pool(maps.filter((x) => x.release !== release), !release);
  const backPool = pool(backdrops.filter((x) => x.backdrop !== backdrop), !!release);

  const draw = (arr, n) => {
    const out = [];
    while (arr.length && out.length < n) {
      const w = (p) => (p.s + 1) * (p.s + 1);
      const total = arr.reduce((sum, p) => sum + w(p), 0);
      let roll = Math.random() * total;
      let i = 0;
      while (i < arr.length - 1 && (roll -= w(arr[i])) > 0) i++;
      out.push(arr.splice(i, 1)[0]);
    }
    return out;
  };
  const take = (p, n) => {
    const out = [];
    for (const tier of p.tiers) if (out.length < n) out.push(...draw(tier, n - out.length));
    return out;
  };
  const chosen = [...take(mapPool, 3), ...take(backPool, 3)];
  if (chosen.length < 6) chosen.push(...take(mapPool, 6 - chosen.length));
  if (chosen.length < 6) chosen.push(...take(backPool, 6 - chosen.length));

  return { picks: chosen.sort((a, b) => (b.rank - a.rank) || (b.s - a.s)).map((p) => p.x), mine };
}
