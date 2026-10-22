# Changelog

## 0.1.2
- Open the scene after download (the gear, under the limits; on by default): off, a download ends on the shelf and
  the button reads **Open**.
- Auto-download: whatever the window has shown counts as offered, however it was closed. It comes back only when a
  release it has not shown yet is out — that one ticked, the earlier ones listed unticked.
- The gear no longer shows the line about concurrent downloads.
- Hardening: an archive's entries stay under their own folder whatever they are named; download links and files are
  taken from the site only; the sign-in page must be a web address; what the site says is shown as text in
  notifications.

## 0.1.1
- Update notice: when a newer release is out, the GM gets a window on load with the installed and the new version and
  how to update. «Don't show again» hides it until the next release; the module setting «Update notice» turns it off.
- Auto-download fresh releases (under the gear, next to the maps folder; off by default). On opening the browser it
  offers the maps released this month and the whole of the last one that you can download and do not have yet —
  exclusives only if they are yours: a checkbox for each, its name a link to its page, its size on the right. Ticked
  are as many as your limits allow; over them, **Download** turns off and says why until you untick enough. The ticked
  ones download one after another, their scenes imported into the **ADMaps** folder. What you untick yourself is not
  offered again.

## 0.1.0
First release.
- The admaps.cloud catalogue inside Foundry VTT v12–v14: maps, backdrops and NPC tokens in the site's own order, with
  search, the tag filter (themes first), the setting filter, release pages and «More like this».
- Sign-in with an ADMaps account by a short code confirmed on admaps.cloud.
- Downloads into Foundry: maps into `_ADMaps/<Theme>/<Name>/` with their scene imported into the **ADMaps** scene folder
  with its variations; backdrops into `_Backdrops`, tokens and whole token sets into `_Tokens`. Maps format — WEBM,
  WEBM lite or WEBP — and the folders are chosen under the gear, which also shows the download limits.
- A downloaded map's button reads **Open** and goes to its scene, making it again in **ADMaps** if it was deleted.
- The ADMaps icon opens the browser from the tools on the left, the Scenes list, or both (module setting).
- 12 languages: English, Chinese (Simplified), French, German, Italian, Japanese, Korean, Polish, Portuguese (Brazil),
  Russian, Spanish, Ukrainian.
