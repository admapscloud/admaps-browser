# ADMaps Browser

To install the **ADMaps Browser** module:
1. Go to the **Add-on Modules** tab in Foundry VTT.
2. Paste the manifest link below into the **Manifest URL** field at the bottom.
3. Click **Install**.

The module will be automatically downloaded and installed. Once complete, enable it in your world settings like any other module.

**Manifest URL:**

```
https://github.com/admapscloud/admaps-browser/releases/latest/download/module.json
```

---

The [Animated Dungeon Maps](https://admaps.cloud/) catalogue inside Foundry VTT: maps, NPC tokens and backdrops from
admaps.cloud, with the site's own search, filters and release pages — and a download button that puts a map straight
into your world, scene and all.

## Requirements

- Foundry VTT v12, v13 or v14
- An ADMaps account to download. Browsing works without signing in.

## Opening the browser

The GM opens it with the ADMaps icon:

- in the tools on the left, with the token tools (the default);
- in the Scenes list, between **Create Scene** and **Create Folder**;
- or both — the module setting **Where to show the button**.

It also opens from the module settings (**ADMaps Browser → Open**).

## Browsing

- Three shelves — **Maps**, **Backdrops** and **Tokens** — in the same order as on the site.
- Search by names and tags that forgives typos and a wrong keyboard layout; **Filter by tag** with the map themes first;
  the setting filter from a map's page («Great for adventures in…»).
- Map cards cycle through the release's versions. A card opens the release page: the preview with every version, the
  video, the description, the details and «More like this».
- A token opens in its own window with its portrait and the rest of its set.

## Downloading into Foundry

Sign in with your ADMaps account: the module shows a short code, you confirm it on admaps.cloud. No password is ever
typed into Foundry.

- **Maps** land in Data exactly as the site's archive lays them out — `_ADMaps/<Theme>/<Name>/`. The scene is imported
  into the **ADMaps** scene folder with all its variations and opens right away.
- A downloaded map's button turns into **Open**: it takes you to the map's scene, and makes it again in **ADMaps** if
  you deleted it — no new download.
- **Maps format** (the gear next to your account): **WEBM** — animated maps, **WEBM lite** — animated, lighter files,
  **WEBP** — still images. A map downloaded in another format offers to update it; its scenes keep their tokens.
- **Backdrops** go into `_Backdrops`, **tokens** — one with its portrait, or a whole set — into `_Tokens`. Both folders
  can be changed under the gear.
- The gear also shows your download limits: what is left this month and this hour.
- **Auto-download fresh releases** (under the gear, off by default): when you open the browser, it lists the maps
  released this month and the whole of the last one that you can download and do not have yet — exclusives only if
  they are yours. Each comes with a checkbox, a link to its page and its size; ticked are as many as your limits allow.
  **Download** takes the ticked ones one after another. What you untick yourself is not offered again.

## Updates

When a newer ADMaps Browser release is out, the GM gets a window on load: the installed and the new version and how to
update. **Don't show again** hides it until the next release; the module setting **Update notice** turns it off.

## Languages

English, Chinese (Simplified), French, German, Italian, Japanese, Korean, Polish, Portuguese (Brazil), Russian, Spanish,
Ukrainian.

## License

[MIT](LICENSE) © ADMaps
