// modules/admaps-browser/scripts/update.mjs
// «Update notice», as ADMaps Tools has it (its tools/update-notice.mjs): when a newer ADMaps Browser release is out on
// GitHub, the GM gets a window on load — the installed and the new version, how to update and the release notes.
// «Don't show again» hides it for THAT version only (saved the moment it is ticked, so the cross keeps it too); the
// next release shows it again. The module setting «Update notice» turns it off altogether.
//
// The latest version comes from the GitHub API (api.github.com/repos/<owner>/<repo>/releases/latest), not from the
// manifest's URL: a release download on github.com answers with a redirect that carries no CORS header, and the
// browser refuses to read it; the API sends Access-Control-Allow-Origin: *. The repository is the manifest's "url".
// No network, the API's rate limit, no release yet — silently nothing.

import { MODULE_ID } from "./site.mjs";
import { L, esc } from "./text.mjs";

const REPO_FALLBACK = "admapscloud/admaps-browser";
const TIMEOUT_MS = 10000;

/** "owner/repo" from the manifest's "url" (https://github.com/owner/repo). */
function repo() {
  const m = String(game.modules.get(MODULE_ID)?.url ?? "").match(/github\.com\/([^/]+\/[^/#?]+)/i);
  return (m?.[1] ?? REPO_FALLBACK).replace(/\.git$/i, "");
}

/** { version, url } of the latest GitHub release, or null. */
async function latestRelease() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo()}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" }, cache: "no-store", signal: ctl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const version = String(data?.tag_name ?? "").trim().replace(/^v/i, "");
    return version ? { version, url: String(data?.html_url ?? "") } : null;
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The window, when there is something newer and it was not waved away for that version. */
export async function checkUpdate() {
  const current = String(game.modules.get(MODULE_ID)?.version ?? "");
  const latest = await latestRelease();
  if (!current || !latest || !foundry.utils.isNewerVersion(latest.version, current)) return;
  if (game.settings.get(MODULE_ID, "updateSkip") === latest.version) return;

  const notes = /^https:\/\/github\.com\//i.test(latest.url)
    ? `<p><a href="${esc(latest.url)}" target="_blank" rel="noopener">${esc(L("update.notes"))}</a></p>` : "";
  const content = `<p>${esc(L("update.body", { latest: latest.version, current }))}</p>
    <p>${esc(L("update.how"))}</p>
    ${notes}
    <div class="form-group" style="margin-top:.8em;">
      <label class="checkbox" style="display:flex;align-items:center;gap:.4em;">
        <input type="checkbox" name="skip"> ${esc(L("update.skip"))}
      </label>
    </div>`;

  await foundry.applications.api.DialogV2.wait({
    window: { title: L("update.title"), icon: "fa-solid fa-circle-up" },
    position: { width: 420 },
    content,
    buttons: [{ action: "ok", label: L("update.ok"), icon: "fa-solid fa-check", default: true }],
    rejectClose: false,
    render: (_event, dialog) => {
      const root = dialog?.element ?? dialog;
      const box = root?.querySelector?.('input[name="skip"]');
      box?.addEventListener("change", () => {
        game.settings.set(MODULE_ID, "updateSkip", box.checked ? latest.version : "").catch(() => {});
      });
    },
  }).catch(() => null);
}
