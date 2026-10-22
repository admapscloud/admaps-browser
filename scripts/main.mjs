// modules/admaps-browser/scripts/main.mjs
// ADMaps Browser — maps, NPC tokens and backdrops from admaps.cloud inside Foundry (12, 13, 14).
// Opened by the GM's button with the site's icon — in the left toolbar (with the Tokens tools; the default), in the
// Scenes sidebar between «Create Scene» and «Create Folder», or both (the setting «buttonPlace»); from the module's
// settings; or by game.modules.get("admaps-browser").api.open().

import { MODULE_ID } from "./site.mjs";
import { openBrowser, openerClass } from "./browser.mjs";
import { checkUpdate } from "./update.mjs";

const ICON = `modules/${MODULE_ID}/assets/admaps.svg`;   // the site's own favicon

/** Is the button shown there: "controls" (the left toolbar) or "scenes" (the Scenes sidebar); «both» — in each. */
function shows(where) {
  let place = "controls";
  try { place = game.settings.get(MODULE_ID, "buttonPlace"); } catch (_e) { /* not registered yet */ }
  return place === where || place === "both";
}

Hooks.once("init", () => {
  // This browser's own sign-in: the device token and the name it was issued to (client — never in the world).
  game.settings.register(MODULE_ID, "token", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "user", { scope: "client", config: false, type: Object, default: {} });
  // The site; another one only for testing (set from the console).
  game.settings.register(MODULE_ID, "server", { scope: "client", config: false, type: String, default: "https://admaps.cloud" });
  // Downloading into Foundry (the gear before the profile's button): the maps' format, where backdrops and tokens go.
  game.settings.register(MODULE_ID, "format", { scope: "client", config: false, type: String, default: "webm" });
  game.settings.register(MODULE_ID, "backdropsDir", { scope: "client", config: false, type: String, default: "_Backdrops" });
  game.settings.register(MODULE_ID, "tokensDir", { scope: "client", config: false, type: String, default: "_Tokens" });
  // The last month's releases downloaded by themselves (the gear; off by default), and what was unticked in their
  // window — not offered again (browser.mjs _autoOffer).
  game.settings.register(MODULE_ID, "autoDownload", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "autoSkip", { scope: "client", config: false, type: Array, default: [] });
  // «Update notice», as ADMaps Tools has (update.mjs); «Don't show again» keeps the version it was ticked for.
  game.settings.register(MODULE_ID, "updateNotice", {
    name: "ADMAPS_BROWSER.updateNotice.name", hint: "ADMAPS_BROWSER.updateNotice.hint",
    scope: "client", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "updateSkip", { scope: "client", config: false, type: String, default: "" });
  // Where the GM's button is (the owner, 22.10.2026): the left toolbar by default, the Scenes list, or both.
  game.settings.register(MODULE_ID, "buttonPlace", {
    name: "ADMAPS_BROWSER.place.name",
    scope: "client", config: true, type: String, default: "controls",
    choices: { controls: "ADMAPS_BROWSER.place.controls", scenes: "ADMAPS_BROWSER.place.scenes", both: "ADMAPS_BROWSER.place.both" },
    onChange: () => {
      // Both drawn again — the button comes or goes at once. 12 keeps its controls as an array and re-reads them in
      // initialize(); 13+ re-reads them on a render with reset.
      try {
        if (Array.isArray(ui.controls?.controls)) ui.controls.initialize();
        else ui.controls?.render({ reset: true });
      } catch (_e) { /* drawn on the next change of the controls */ }
      try { ui.scenes?.render(); } catch (_e) { /* the same */ }
    },
  });
  game.settings.registerMenu(MODULE_ID, "open", {
    name: "ADMAPS_BROWSER.menu.name",
    label: "ADMAPS_BROWSER.menu.label",
    hint: "ADMAPS_BROWSER.menu.hint",
    icon: "fa-solid fa-store",
    type: openerClass(),
    restricted: true,
  });
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { open: openBrowser };
});

// A newer release on GitHub — the GM is told on load (only a GM can update modules).
Hooks.once("ready", () => {
  if (!game.user?.isGM || !game.settings.get(MODULE_ID, "updateNotice")) return;
  checkUpdate().catch(() => {});
});

/**
 * The icon in the Scenes sidebar, right after «Create Scene» — the place ADMaps Tools' folder import had (it went to
 * a scene's right-click menu). Foundry 12 hands the hook jQuery, 13+ the element.
 */
Hooks.on("renderSceneDirectory", (app, html) => {
  if (!game.user?.isGM || !shows("scenes")) return;
  const root = html instanceof HTMLElement ? html : (html?.jquery ? html[0] : null);
  const actions = root?.querySelector(".header-actions");
  if (!actions || actions.querySelector(".admaps-browser-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "admaps-browser-open";
  btn.dataset.tooltip = game.i18n.localize("ADMAPS_BROWSER.open");
  btn.setAttribute("aria-label", btn.dataset.tooltip);
  btn.innerHTML = `<img src="${foundry.utils.getRoute(ICON)}" alt="">`;
  btn.addEventListener("click", (ev) => { ev.preventDefault(); openBrowser(); });
  const create = actions.querySelector('[data-action="createEntry"], .create-entry, .create-document');
  if (create) create.after(btn);
  else actions.prepend(btn);
});

/** The icon in the left toolbar, last of the Tokens tools (where the owner's other modules put theirs). */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM || !shows("controls")) return;
  const tokens = Array.isArray(controls) ? controls.find((c) => c.name === "tokens") : controls?.tokens;
  if (!tokens?.tools) return;
  const tool = { name: "admaps-browser", title: game.i18n.localize("ADMAPS_BROWSER.open"), icon: "admaps-browser-icon", button: true, visible: true };
  if (Array.isArray(tokens.tools)) {
    tool.onClick = () => openBrowser();               // 12 calls onClick
    tokens.tools.push(tool);
  } else {
    // 13+ call onChange — and onClick too, as deprecated: one of them only, or it opens twice.
    tool.order = Math.max(0, ...Object.values(tokens.tools).map((t) => Number(t.order) || 0)) + 1;
    tool.onChange = () => openBrowser();
    tokens.tools[tool.name] = tool;
  }
});
