// modules/admaps-browser/scripts/site.mjs
// ADMaps Browser — the site's side: the three catalogues, sign-in by code, who is signed in.
//
// admaps.cloud lets any origin read its catalogues and its API by token (CORS without cookies: a Foundry page is
// a third party to the site, its cookie never comes along). The token is this device's own: Foundry asks the site
// for a short code, the person confirms it on admaps.cloud/link/ where they are signed in with Patreon, and the
// site hands the token out once (server/lib/device.mjs). It is kept in this browser only (a client setting).

export const MODULE_ID = "admaps-browser";
const TIMEOUT_MS = 15000;

export const base = () => String(game.settings.get(MODULE_ID, "server") || "https://admaps.cloud").replace(/\/+$/, "");
export const token = () => game.settings.get(MODULE_ID, "token") || "";
export const storedUser = () => game.settings.get(MODULE_ID, "user") || {};

async function call(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (auth && token()) headers.authorization = `Bearer ${token()}`;
  const res = await fetch(base() + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let data = null;
  try { data = await res.json(); } catch (_e) { /* not JSON — the status says it */ }
  return { status: res.status, data };
}

/** The three shelves, each on its own: one failing does not take the others with it. Facets — the site's tag lists. */
export async function loadCatalogs() {
  const get = async (name) => {
    const res = await fetch(`${base()}/data/${name}.json`, { cache: "no-cache", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const [maps, tokens, backdrops] = await Promise.allSettled([get("catalog"), get("tokens"), get("backdrops")]);
  const err = (r) => (r.status === "rejected" ? String(r.reason?.message ?? r.reason) : null);
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    maps: list(maps.value?.releases),
    tokens: list(tokens.value?.tokens),
    sets: list(tokens.value?.sets),
    backdrops: list(backdrops.value?.releases),
    facets: { maps: list(maps.value?.facets), tokens: list(tokens.value?.facets), backdrops: list(backdrops.value?.facets) },
    errors: { maps: err(maps), tokens: err(tokens), backdrops: err(backdrops) },
  };
}

async function forget() {
  await game.settings.set(MODULE_ID, "token", "");
  await game.settings.set(MODULE_ID, "user", {});
}

/**
 * Who the visitor is — the site's /api/me as it is: signed in by this device's token, or a guest (the site answers a
 * guest too: the campaigns with their tiers, which the buttons and «Access» name). A token revoked on the site signs out.
 */
export async function fetchMe() {
  let r = await call("/api/me");
  if (r.status === 401 && token()) {
    await forget();
    r = await call("/api/me", { auth: false });
  }
  if (r.status !== 200 || !r.data) throw new Error(r.data?.message || `HTTP ${r.status}`);
  return r.data;
}

/** A code for this device: { device, code, verifyUrl, interval, expiresIn }. */
export async function startLogin() {
  const label = `Foundry ${game.version ?? ""} · ${location.host}`.replace(/\s+·/, " ·");
  const r = await call("/api/device/start", { method: "POST", body: { label }, auth: false });
  if (r.status !== 200 || !r.data?.code) throw new Error(r.data?.message || `HTTP ${r.status}`);
  // The page to confirm the code on — a web address, or none (the code alone is shown then).
  return { ...r.data, verifyUrl: /^https?:\/\//i.test(String(r.data.verifyUrl ?? "")) ? r.data.verifyUrl : null };
}

/** Has the code been confirmed on the site? { done, user } | { pending } | { error: denied | expired | failed }. */
export async function pollLogin(device) {
  const r = await call("/api/device/poll", { method: "POST", body: { device }, auth: false });
  if (r.status === 200 && r.data?.token) {
    await game.settings.set(MODULE_ID, "token", r.data.token);
    await game.settings.set(MODULE_ID, "user", r.data.user ?? {});
    return { done: true, user: r.data.user ?? {} };
  }
  if (r.status === 202 || r.status === 429) return { pending: true };
  if (r.status === 403) return { error: "denied" };
  if (r.status === 410) return { error: "expired" };
  return { error: "failed", message: r.data?.message || `HTTP ${r.status}` };
}

/**
 * A one-time link to a release's archive (the site's own /api/link, the picker's request): parts — the sets
 * (fv — the Foundry video with its scenes and props, fi — the stills, which then carry the scenes too), fmt — webm or
 * lite. { url, bytes, lite } | { error, message } (terms, tier, quota, rate, …).
 */
export async function mintLink(release, parts, fmt) {
  const r = await call("/api/link", { method: "POST", body: { release, parts, fmt } });
  if (r.status === 200 && onSite(r.data?.url)) return r.data;
  return { error: r.data?.error || `http${r.status}`, message: r.data?.message || `HTTP ${r.status}` };
}

/** A path on the site itself (/d/…, /b/…): the device's token goes nowhere else. */
const onSite = (path) => /^\/(?!\/)/.test(String(path ?? ""));

/** The site's terms of use, accepted once (the picker asks for it before the first link). */
export async function acceptTerms() {
  const r = await call("/api/terms/accept", { method: "POST", body: {} });
  return r.status === 200;
}

/** A file from the site by this device's token: an archive /d/…, a backdrop /b/…, tokens /t/…. The Response. */
export async function fetchFile(path) {
  if (!onSite(path)) throw new Error(`HTTP 400`);
  const res = await fetch(base() + path, { headers: token() ? { authorization: `Bearer ${token()}` } : {}, cache: "no-store" });
  if (!res.ok) {
    let text = "";
    try { text = (await res.text()).slice(0, 200); } catch (_e) { /* no body */ }
    throw Object.assign(new Error(text || `HTTP ${res.status}`), { status: res.status });
  }
  return res;
}

/** Sign out: the site forgets this device's token, and so does this browser. */
export async function signOut() {
  try { if (token()) await call("/api/device/signout", { method: "POST" }); } catch (_e) { /* offline — forget it here anyway */ }
  await forget();
}
