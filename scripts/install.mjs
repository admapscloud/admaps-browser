// modules/admaps-browser/scripts/install.mjs
// Downloading into Foundry. A release, a backdrop, a token or a whole set comes from admaps.cloud by this device's
// token and lands in Data exactly where the site's archive puts it: maps under _ADMaps/<Theme>/<Name>/ (with the shared
// _ADMaps/constructor tiles their scenes use), backdrops into the backdrops folder (_Backdrops), tokens into the tokens
// folder (_Tokens). A map's scene is imported into the scene folder «ADMaps» from the JSON that carries the release's
// variations (flags admaps-scene-switch: the other versions are its variations, by their JSON files) and opened.
//
// The archives are store-only zips with the sizes in every local header (the site's server/lib/zipstream.mjs): they
// are read as they arrive, one file at a time, and each file goes up to Foundry before the next is read — a big
// release never sits in memory whole.
//
// What was installed is written to the module's persistent storage (modules/admaps-browser/storage/installed.json):
// Data is shared by every world, and so is this list. A release put in by hand is found by its files.

import { MODULE_ID, mintLink, acceptTerms, fetchFile } from "./site.mjs";
import { L, esc } from "./text.mjs";

const REG_FILE = "installed.json";
const SCENE_FOLDER = "ADMaps";
const SWITCH = "admaps-scene-switch";

// ------------------------------------------------------------------ Foundry's files

/** Core's file picker: foundry.applications.apps in 13 and 14, the global in 12. */
export const filePicker = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
const enc = (path) => path.split("/").map(encodeURIComponent).join("/");
const route = (path) => foundry.utils.getRoute(enc(path));
const ext = (fmt) => (fmt === "webp" ? "webp" : "webm");

/** Is the file there (a request for its head; Data is served as it lies). */
export async function exists(path) {
  try {
    const res = await fetch(route(path), { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch (_e) { return false; }
}

const made = new Set();
/** The folder and every one above it; an existing one is fine. */
async function mkdirs(dir) {
  let cur = "";
  for (const part of dir.split("/").filter(Boolean)) {
    cur = cur ? `${cur}/${part}` : part;
    if (made.has(cur)) continue;
    try { await filePicker().createDirectory("data", cur, {}); }
    catch (e) { if (!/exist/i.test(String(e?.message))) throw e; }
    made.add(cur);
  }
}

/** One file into Data: path relative to Data, the bytes as Blob parts. */
async function putFile(path, parts) {
  const cut = path.lastIndexOf("/");
  const dir = path.slice(0, cut);
  const name = path.slice(cut + 1);
  await mkdirs(dir);
  const r = await filePicker().upload("data", dir, new File(parts, name), {}, { notify: false });
  if (!r?.path) throw new Error(L("err.upload", { file: name }));
  return r.path;
}

// ------------------------------------------------------------------ the archive, as it arrives

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/**
 * Read a store-only zip from a Response: each file whole, handed to onEntry(name, parts, size) before the next is
 * read; onBytes(n) — every chunk that came. The table of contents at the tail is read through, not used: the site
 * counts a download done only when its last byte is taken.
 */
export async function readZip(res, onEntry, onBytes) {
  const reader = res.body.getReader();
  let buf = new Uint8Array(0);
  const pull = async () => {
    const { value, done } = await reader.read();
    if (done) return false;
    onBytes?.(value.length);
    if (!buf.length) buf = value;
    else { const b = new Uint8Array(buf.length + value.length); b.set(buf); b.set(value, buf.length); buf = b; }
    return true;
  };
  const need = async (n) => { while (buf.length < n) if (!(await pull())) throw new Error(L("err.broken")); };
  for (;;) {
    await need(4);
    if (u32(buf, 0) !== 0x04034b50) break;   // the table of contents: no files after it
    await need(30);
    const flags = u16(buf, 6), method = u16(buf, 8), size = u32(buf, 18), nameLen = u16(buf, 26), extraLen = u16(buf, 28);
    if (method !== 0 || (flags & 8)) throw new Error(L("err.broken"));
    await need(30 + nameLen + extraLen);
    const name = new TextDecoder().decode(buf.subarray(30, 30 + nameLen));
    buf = buf.subarray(30 + nameLen + extraLen);
    const parts = [];
    let left = size;
    while (left > 0) {
      if (!buf.length && !(await pull())) throw new Error(L("err.broken"));
      const take = Math.min(left, buf.length);
      parts.push(buf.subarray(0, take));
      buf = buf.subarray(take);
      left -= take;
    }
    await onEntry(name, parts, size);
  }
  buf = new Uint8Array(0);
  while (await pull()) buf = new Uint8Array(0);
}

// ------------------------------------------------------------------ what is installed

let reg = null;
const regUrl = () => `${route(`modules/${MODULE_ID}/storage/${REG_FILE}`)}?t=${Date.now()}`;

/** { maps: {release: {fmt, dir, at}}, backdrops: {slug: {webp, webm}}, tokens: {key: path}, sets: {group: dir} }. */
export async function registry() {
  if (reg) return reg;
  try {
    const res = await fetch(regUrl(), { cache: "no-store" });
    reg = res.ok ? await res.json() : {};
  } catch (_e) { reg = {}; }
  if (!reg || typeof reg !== "object") reg = {};
  for (const k of ["maps", "backdrops", "tokens", "sets"]) reg[k] ??= {};
  return reg;
}

async function saveRegistry() {
  const file = new File([JSON.stringify(reg)], REG_FILE, { type: "application/json" });
  await mkdirs(`modules/${MODULE_ID}/storage`);
  await filePicker().uploadPersistent(MODULE_ID, "", file, {}, { notify: false });
}

/** The release's own folder, by the site's layout: _ADMaps/<theme — the first tag>/<name before «--»>. */
export function mapDir(r) {
  const v = r?.versions?.[0];
  if (!v?.slug) return null;
  return `_ADMaps/${v.tags?.[0] ?? ""}/${String(v.slug).split("--")[0]}`;
}

/** Is the release in Data, and how: { fmt, dir } | null. The list first; a release put in by hand — by its files. */
export async function probeMap(r) {
  const R = await registry();
  const v = r.versions?.[0];
  if (!v) return null;
  const known = R.maps[r.release];
  if (known && await exists(`${known.dir}/${v.slug}.${ext(known.fmt)}`)) return known;
  const dir = mapDir(r);
  for (const fmt of ["webm", "webp"]) if (await exists(`${dir}/${v.slug}.${fmt}`)) return { fmt, dir, byHand: true };
  return null;
}

export async function probeBackdrop(r, kind, dir) {
  return r[kind] ? exists(`${dir}/${r[kind].file}`) : false;
}

export async function probeToken(r, dir) {
  return r.token?.file ? exists(`${dir}/${r.group}/${r.token.file}`) : false;
}

// ------------------------------------------------------------------ scenes

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (_e) { return s; } };

/**
 * The world's scenes of a release that this module made (its flag — wherever they were moved since). A scene put in
 * by hand is the visitor's own: not opened, not repointed. «Open» with none of the module's makes it anew in «ADMaps»
 * (the owner, 22.10.2026: a deleted one is made again there, to be moved on — not an old one found by its picture).
 */
export function scenesOf(r) {
  return game.scenes.filter((s) => s.getFlag(MODULE_ID, "release") === r.release);
}

async function sceneFolder() {
  const f = game.folders.find((x) => x.type === "Scene" && x.name === SCENE_FOLDER && !x.folder);
  return f ?? getDocumentClass("Folder").create({ name: SCENE_FOLDER, type: "Scene" });
}

/**
 * The scene JSON to import: the root of the variations — one that carries them and is no other's variation (a
 * variation may be a JSON with its own: Onyx Dragon Lair, Fort Joy); else any scene. Ties go by the site's order of
 * versions (the first is the release's own picture): the archive comes sorted by name, a variation often first.
 */
function pickMain(jsons, r) {
  const scenes = jsons.map((j) => {
    try {
      const data = JSON.parse(j.text);
      return data && typeof data === "object" && ("walls" in data || "background" in data) ? { ...j, data } : null;
    } catch (_e) { return null; }
  }).filter(Boolean);
  const name = (p) => safeDecode(String(p ?? "")).split("/").pop();
  const order = (r.versions ?? []).map((v) => `${v.slug}.json`);
  const rank = (j) => { const i = order.indexOf(name(j.path)); return i < 0 ? order.length : i; };
  scenes.sort((a, b) => rank(a) - rank(b));
  const vars = (j) => j.data.flags?.[SWITCH]?.config?.variations ?? [];
  const nested = new Set(scenes.flatMap((j) => vars(j).map((v) => name(v.file))));
  return scenes.find((j) => vars(j).length && !nested.has(name(j.path))) ?? scenes[0] ?? null;
}

/** Import a scene JSON into the folder «ADMaps» — the way core imports one (migrated to this core), its own thumbnail. */
async function importScene(r, data, fmt) {
  const folder = await sceneFolder();
  const cls = getDocumentClass("Scene");
  let src = foundry.utils.deepClone(data);
  try {
    if (typeof cls.fromImport === "function") src = game.scenes.fromCompendium(await cls.fromImport(src), { clearFolder: true });
  } catch (e) {
    // A scene from a newer core than this one: created as it is (core drops what it does not know).
    console.warn(`${MODULE_ID} | ${e.message}`);
  }
  delete src._id;
  delete src.thumb;   // the studio's world path; core draws its own on create
  src.folder = folder.id;
  src.navigation = false;
  delete src.active;
  foundry.utils.setProperty(src, `flags.${MODULE_ID}`, { release: r.release, fmt });
  return cls.create(src);
}

/**
 * The release's scene JSON in Data: the pick of the JSONs in its folder as they are (a release put in by hand has
 * them named as it was made, not always as the site's versions are now), with the one its download noted.
 */
async function findMain(r, dir) {
  const read = async (path) => {
    try {
      const res = await fetch(route(path), { cache: "no-store" });
      return res.ok ? { path, text: await res.text() } : null;
    } catch (_e) { return null; }
  };
  let files = [];
  try { files = (await filePicker().browse("data", enc(dir))).files ?? []; } catch (_e) { /* no such folder */ }
  const paths = files.map(safeDecode).filter((p) => /\.json$/i.test(p));
  const noted = (await registry()).maps[r.release]?.main;
  if (noted && !paths.includes(noted)) paths.push(noted);
  return pickMain((await Promise.all(paths.map(read))).filter(Boolean), r);
}

/** The release's scene in this world — imported from its JSON in Data when there is none yet; then opened. */
export async function openScene(r, info) {
  let scene = scenesOf(r)[0];
  if (!scene) {
    const main = await findMain(r, info.dir);
    if (!main) throw new Error(L("err.noScene"));
    scene = await importScene(r, main.data, info.fmt);
  }
  await scene?.view();
  return scene;
}

/** Other format, same scenes: their pictures point to the new files (webm ↔ webp; lite is the same names). */
async function repointScenes(r, dir, from, to) {
  if (ext(from) === ext(to)) return;
  const slugs = r.versions.map((v) => v.slug);
  const swap = (s) => {
    let t = String(s ?? "");
    for (const sl of slugs) t = t.replaceAll(`${dir}/${sl}.${ext(from)}`, `${dir}/${sl}.${ext(to)}`);
    return t;
  };
  for (const scene of scenesOf(r)) {
    const upd = { [`flags.${MODULE_ID}`]: { release: r.release, fmt: to } };
    if (scene.background?.src) upd["background.src"] = swap(safeDecode(scene.background.src));
    if (scene.foreground) upd.foreground = swap(safeDecode(scene.foreground));
    const of = scene.flags?.[SWITCH]?.config?.originalFile;
    if (of) upd[`flags.${SWITCH}.config.originalFile`] = swap(of);
    await scene.update(upd);
  }
}

// ------------------------------------------------------------------ downloading

/** The site's refusals, in the module's words. */
const REFUSALS = { tier: "err.tier", quota: "err.quota", rate: "err.rate", concurrent: "err.concurrent", syncing: "err.syncing", missing: "err.missing", hidden: "err.missing", toobig: "err.toobig" };
const refusal = (r) => new Error(REFUSALS[r.error] ? L(REFUSALS[r.error]) : (r.message || r.error));

/** The terms of use, once: their page on the site, and «Accept» here. */
async function askTerms(base) {
  const { DialogV2 } = foundry.applications.api;
  const ok = await DialogV2.confirm({
    window: { title: L("terms.title") },
    content: `<p>${esc(L("terms.body"))}</p><p><a href="${esc(`${base}/terms/`)}" target="_blank" rel="noopener">${esc(L("terms.read"))}</a></p>`,
    yes: { label: L("terms.accept") },
    no: { label: L("cancel") },
    rejectClose: false,
  });
  return ok ? acceptTerms() : false;
}

/**
 * A release into Data and its scene into the world. fmt — webm | lite | webp, as the visitor may have it (see the
 * caller); onProgress(0..1). Returns { fmt, dir } — what was installed.
 */
export async function installMap(r, { fmt, base, onProgress }) {
  const was = await probeMap(r);   // before the new files land: a release by hand is known by them
  const parts = fmt === "webp" ? ["fi"] : ["fv"];
  let link = await mintLink(r.release, parts, fmt === "lite" ? "lite" : "webm");
  if (link.error === "terms") {
    if (!(await askTerms(base))) return null;
    link = await mintLink(r.release, parts, fmt === "lite" ? "lite" : "webm");
  }
  if (link.error) throw refusal(link);
  const res = await fetchFile(link.url);
  const total = link.bytes || Number(res.headers.get("content-length")) || 0;
  let got = 0;
  const first = r.versions[0].slug;
  let dir = null;   // the release's folder as the archive has it (by its first version's file)
  const jsons = [];
  await readZip(res, async (name, data) => {
    // The license sits at the archive's root; here — in the release's own folder, not in Data's.
    const path = name.includes("/") ? name : `${dir ?? mapDir(r)}/${name}`;
    if (!dir && path.slice(path.lastIndexOf("/") + 1).startsWith(`${first}.`)) dir = path.slice(0, path.lastIndexOf("/"));
    if (/\.json$/i.test(path)) jsons.push({ path, text: await new Blob(data).text() });
    await putFile(path, data);
  }, (n) => { got += n; onProgress?.(total ? Math.min(1, got / total) : 0); });
  dir ??= mapDir(r);

  // What came: lite only when the site had light copies to give.
  const installed = fmt === "webp" ? "webp" : link.lite ? "lite" : "webm";
  const main = pickMain(jsons, r);
  const R = await registry();
  R.maps[r.release] = { fmt: installed, dir, main: main?.path ?? null, at: Date.now() };
  await saveRegistry();
  // The scenes already in this world keep their tokens: only their pictures move to the new files.
  if (was && scenesOf(r).length) await repointScenes(r, dir, was.fmt, installed);
  else if (main) await importScene(r, main.data, installed);
  return { fmt: installed, dir };
}

/** A backdrop's file (webp or webm) into the backdrops folder. */
export async function installBackdrop(r, kind, dir, onProgress) {
  const f = r[kind];
  const res = await fetchFile(`/b/${r.backdrop}/${encodeURIComponent(f.file)}`);
  const blob = await streamed(res, f.bytes, onProgress);
  const path = await putFile(`${dir}/${f.file}`, [blob]);
  const R = await registry();
  R.backdrops[r.backdrop] = { ...(R.backdrops[r.backdrop] ?? {}), [kind]: path };
  await saveRegistry();
  return path;
}

/** One token with its portrait (key) or a whole set (group), into the tokens folder as the site lays them out. */
export async function installTokens({ key = null, group = null }, dir, onProgress) {
  const res = await fetchFile(key ? `/t/one/${key}.zip` : `/t/set/${group}.zip`);
  const total = Number(res.headers.get("content-length")) || 0;
  let got = 0;
  await readZip(res, async (name, data) => {
    await putFile(`${dir}/${name.replace(/^_Tokens\//, "")}`, data);
  }, (n) => { got += n; onProgress?.(total ? Math.min(1, got / total) : 0); });
  const R = await registry();
  if (key) R.tokens[key] = dir;
  else R.sets[group] = dir;
  await saveRegistry();
}

/** A whole response as one Blob, counting as it comes. */
async function streamed(res, total, onProgress) {
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress?.(total ? Math.min(1, got / total) : 0);
  }
  return new Blob(parts);
}
