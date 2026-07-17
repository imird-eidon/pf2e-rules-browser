# PF2e Rules Browser

An internal, browser-like reader for all the rules content available inside your Foundry VTT world. One window, browser-style history, and a lightweight two-tier search — no more cascades of journal windows.

Built for **Foundry V13/V14** with the **PF2e** system (most of it is system-agnostic, but item rendering and trait styling assume PF2e).

## Bugfix (v0.4.6)

- Fixed middle-clicking a content-link that came from a compendium (e.g. a feat) opening the whole compendium's listing in a new tab instead of that specific document — real Foundry content-links often carry both `data-uuid` and `data-pack` at once, and the descriptor resolver now always prefers the specific document over the pack listing.

## Features (v0.4.5)

- **Drag-and-drop tab reordering.** Grab any tab and drop it wherever you want. Pinning a tab still moves it to the front by default, but from then on tab order is entirely yours.
- **Faster first search.** The name index now warms up in the background as soon as Foundry finishes loading (instead of on first use), so the very first search in the sidebar or command palette is instant.
- **Real progress bar** for the lazy full-text index build, based on the number of journal packs actually processed, instead of a generic spinner.

## Features (v0.4.2)

- Default keybinding for opening the browser changed to `Ctrl+S`.

## Features (v0.4.1)

- **Bookmark folders.** Each bookmark item in the Home sidebar has a small folder icon (next to the remove ×) that prompts for a folder name — existing folder names are offered as suggestions, and leaving it blank moves the bookmark back to the general list. A folder is just a shared name across bookmarks: it appears in the sidebar once at least one bookmark uses it, and disappears on its own once none do. Handy for a GM to group "Shades of Blood #1" bookmarks separately from general rules lookups.
- **Fixed pinned tabs.** They previously shrank to icon-only with the unpin button appearing on top of the tab's icon on hover (a `position: absolute` overlap), making them hard to click reliably. The pin now sits inline next to the icon at a fixed spot, always visible, no jumping.

## Features (v0.4.0)

- **Command palette (`Ctrl+K` by default).** A quick-jump overlay independent of the per-tab sidebar search: type a few letters of any journal, page, feat, spell, condition… and hit Enter to go straight there. Reuses the existing name index, so it stays instant. Opens via the toolbar's lightning-bolt button or the keybinding (remappable in Foundry's Controls settings).
- **Keyboard shortcuts**, all only active while the Rules Browser window is open, all remappable in Controls:
  - `Ctrl+K` — command palette
  - `Alt+T` — new tab
  - `Alt+W` — close the active tab (skips pinned tabs)
  - `Alt+←` / `Alt+→` — back / forward in the active tab's history
  - `Alt+F` — focus the sidebar search box

  `Ctrl+T`/`Ctrl+W`/`Ctrl+F` were deliberately avoided as defaults: most browsers reserve those combos at the OS/chrome level and never deliver the keydown to page JavaScript at all.
- **Pinned tabs.** Pin a tab (hover it, click the pin icon) to shrink it to an icon and keep it out of the way of casual closing — middle-click and the "close tab" shortcut both skip pinned tabs. Pinned tabs always sort to the front of the tab strip and survive session restore.
- **Recently viewed**, on the Home screen above Bookmarks: the last 15 documents you opened, most recent first, stored per user.
- **Tabs.** Browser-style tabs, each with its own history stack, scroll positions and contextual sidebar. `Ctrl/Cmd+click` or middle-click any link to open it in a background tab.
- **Share with table.** Every document header has a share button that posts a chat card with the content link and an "Open in Rules Browser" button — clicking it opens the document inside the Rules Browser on that player's client (note: players still need permission to view the document, e.g. shared world journals must be at least Observer).
- **Single-window navigation.** All `@UUID` content links clicked *inside* the browser are intercepted and rendered in place — journal pages, feats, spells, actions, conditions, equipment…
- **Browser-style history.** Back / forward buttons with scroll position restoration, plus a Home view listing every journal compendium (and optionally world journals).
- **Two-tier search.**
  - *Title search*: instant, built from compendium indices (journal entries, their pages, and system Item packs).
  - *Full-text search*: built lazily on your first search (journals are loaded once, converted to plain text and cached in memory). Results show a highlighted snippet.
- **Bookmarks (per user).** The star button in the toolbar bookmarks the current document or compendium; bookmarks appear at the top of the Home sidebar with per-item remove buttons. Stored as a flag on your User document, so each player keeps their own set that follows them across devices.
- **Session persistence (per user).** Tabs and their histories are saved (debounced) as you browse and restored when you reopen the browser — even after reloading Foundry. Histories are capped at 30 entries per tab when persisted. Can be disabled in settings.
- **Escape hatch.** Every document has a corner button to open its native Foundry sheet when you actually want a separate window (e.g. to drag items to a character sheet).
- **Opening it:** button in the Journal sidebar tab, keybinding (default `Ctrl+S`, configurable), or the API:

  ```js
  game.modules.get("pf2e-rules-browser").api.open();                 // home
  game.modules.get("pf2e-rules-browser").api.open("Compendium....");  // straight to a UUID
  ```

## Installation (manual)

Copy the `pf2e-rules-browser` folder into your Foundry `Data/modules/` directory and enable the module in your world.

## How link interception works

Foundry binds a global, document-level click handler that opens a sheet for every `a.content-link`. This module adds a **capture-phase** listener scoped to the browser window's own element; capture on an inner element fires before the document-level bubble handler, so calling `preventDefault()` + `stopPropagation()` there fully suppresses the default behavior. The link's `data-uuid` is then resolved with `fromUuid()` and rendered inside the content pane. Links clicked anywhere *outside* the browser keep their normal behavior.

## Architecture

```
scripts/module.js         Entry point: settings, keybinding, sidebar button, API
scripts/rules-browser.js  RulesBrowser (ApplicationV2, 3 Handlebars parts)
scripts/search-index.js   SearchIndex (name index + lazy full-text index)
templates/*.hbs           toolbar / sidebar / content parts
styles/rules-browser.css  Layout + theming via core CSS variables
lang/{en,es}.json         Localization
```

The window is split into four `PARTS` (tabs, toolbar, sidebar, content) so that typing in the search box only re-renders the sidebar part — the input never loses focus.

## Ideas for future versions

- Heading-level TOC for the current page
- Fuzzy matching and accent-insensitive search
