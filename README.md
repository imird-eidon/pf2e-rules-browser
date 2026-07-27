# PF2e Rules Browser

An internal, browser-like reader for all the rules content available inside your Foundry VTT world. One window, browser-style history, and a lightweight two-tier search — no more cascades of journal windows.

Built for **Foundry V13/V14** with the **PF2e** system (most of it is system-agnostic, but item rendering and trait styling assume PF2e).

## How to Use

### Opening it
- Click the book icon in the **Journal** sidebar tab.
- Press `Ctrl+S` (remappable in Foundry's Controls settings).
- From a macro or another module: `game.modules.get("pf2e-rules-browser").api.open()` — or `.open(uuid)` to jump straight to a document.

### Getting around
- Every rule link you click (`@UUID` references to feats, spells, conditions…) opens **in the same window**, never a cascade of new sheets.
- **Tabs** work like a browser: `+` for a new one, drag to reorder, middle-click (or `Ctrl/Cmd+click`) a link to open it in a background tab.
- **Pin** a tab (hover it, click the pin) to shrink it to an icon and protect it from accidental closing.
- **Back/forward** buttons and `Alt+←`/`Alt+→` step through each tab's own history.
- **Right-click** a sidebar item, a content-link, or a tab for a context menu (open in new tab, copy an `@UUID` link, bookmark, clear history, and more).
- A **scroll-to-top** button fades in once you've scrolled down a page.

### Finding things
- Type in the sidebar search box for instant title matches, plus a lazily-built full-text search across your journals.
- Press `Ctrl+K` (or the lightning-bolt toolbar button) for a **command palette**: a quick-jump overlay to any document by name.
- Browsing a compendium list (e.g. a class's feats)? Click the **filter icon** next to the section header to filter that list by name, with trait autocomplete and combinable chips.
- The **sliders button** in the toolbar opens **Advanced Search**: filter every indexed item at once by trait, type, level range, rarity and source, sorted by name or level. (Items only — journal pages like class descriptions have no traits/level to filter by.)

### Keeping track of things
- The **star** button bookmarks the current page; bookmarks show at the top of the sidebar on every screen, with optional folders (right-click a bookmark → assign a folder, e.g. to group everything for one adventure).
- **Recently viewed** tracks your last 15 documents, also pinned to the top of the sidebar.
- Sidebar sections (bookmarks, folders, compendium listings…) are **collapsible** — click a header to fold it away; the state is remembered per section.
- Enable **"Remember tab session"** in settings (on by default) to have your tabs and their histories restored the next time you open the browser, even after reloading Foundry.

### At the table
- The **share** button on any document posts a chat card with a button that opens that same page in **each player's own** Rules Browser (they still need permission to view world content, e.g. Observer on a shared journal).
- Inline damage rolls in descriptions (e.g. persistent damage) roll and post to chat directly, even for compendium-only content Foundry's own dialog can't otherwise handle.

### All keyboard shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+S` | Open the Rules Browser |
| `Ctrl+K` | Command palette |
| `Alt+T` | New tab |
| `Alt+W` | Close the active tab (skips pinned tabs) |
| `Alt+←` / `Alt+→` | Back / forward |
| `Alt+F` | Focus the search box |

All of the above are remappable in Foundry's **Controls** settings.

## Features (v0.5.0)

- **Advanced search.** A faceted search view (sliders button in the toolbar) that opens in its own tab, with facets in the sidebar and results in the main pane:
  - **Traits** with the same autocomplete-and-chips UX as the per-list filter, combinable with AND logic.
  - **Item type** (feat, spell, action, equipment…), **level range**, **rarity** and **source**, all built only from values actually present in your installed content.
  - **Sort** by name or level; result rows show level, type, traits and source inline for scanning; a result count with a "clear filters" button.
  - Facet changes re-render only the results, so typing keeps focus and stays responsive.
- **Scope note:** advanced search is **Item-only** (feats, spells, actions, equipment, conditions…). Journal pages — class descriptions, rules glossary and similar — carry no traits, level or rarity in Foundry, so they can't be faceted; they remain fully searchable via the normal search box (titles + full text).

## Features (v0.4.22)

- **Per-list filter for compendium item listings** (e.g. "Feats", 6044 documents). Click the filter icon next to a section header to reveal it, then type: the box filters items by name *and* autocompletes matching trait names as you go. Picking a trait adds it as a removable chip, and multiple chips combine with AND logic (e.g. Manipulate + Secret at once). Arrow keys move through suggestions, Enter picks one, Escape dismisses the dropdown; with no suggestions open and exactly one item left, Enter opens it. Hidden by default so it stays out of the way on shorter lists, and filtering is pure client-side DOM work (no re-render), so it stays fast on the largest compendiums.

## Bugfix (v0.4.20)

- Fixed the inline damage-roll chat message showing PF2e's raw formula syntax verbatim (e.g. "{1d6[acid,persistent]}") instead of a clean roll. The grouping braces and per-term `[type,category]` tags are now stripped before rolling, with the tags shown separately as a plain-language line ("acid, persistent") under the item name/icon.

## Features (v0.4.19)

- The inline damage-roll chat message now shows the item's icon and name instead of plain default flavor text.

## Bugfix (v0.4.18)

- Fixed inline damage-roll buttons (e.g. persistent damage) doing nothing and throwing a console error ("Failed to parse damage formula {}"). PF2e's own click handler resolves item context via a native sheet or, failing that, a non-compendium UUID — it explicitly skips that fallback for any UUID starting with "Compendium.", which is most of what this module displays. These clicks are now handled directly instead: the formula is already correctly resolved in the link (thanks to the rollData fix in 0.4.17), so it's rolled and posted to chat without needing PF2e's own resolution to succeed. This trades away the native configurable "Damage Roll" dialog (editable modifiers, roll visibility, etc.) for a roll that reliably works on unowned compendium content.

## Bugfix (v0.4.17)

- Fixed incorrect inline roll values in descriptions — e.g. a spell showing "0 persistent acid" instead of the correct "1". Neither `enrichHTML` call passed explicit `rollData`, so formulas referencing the item's own data had nothing to resolve against and silently fell back to 0. Both items and journal pages now pass `getRollData()`, matching what Foundry's native sheets do.

## Bugfix (v0.4.16)

- Fixed the "scroll to top" button appearing to scroll away with the text instead of staying pinned in its corner. It's now positioned in real screen pixels computed from the content pane's actual on-screen rectangle, rather than relying on CSS `position: absolute`, which didn't stay clamped to the visible box the way expected.

## Features (v0.4.15)

- **"Scroll to top" button.** Fades in near the bottom-right of the content pane once you've scrolled down a bit on a long page (like a class's level-by-level feature table), and fades back out once you're near the top. Subtle at rest, fully visible on hover, so it stays out of the way of reading.

## Features (v0.4.14)

- **Trait hover tooltips.** Trait pills (MANIPULATE, CONCENTRATE, etc.) now show the same hover tooltip with the trait's full description that Foundry's native item sheets show — using Foundry's own core tooltip system, so no custom popup code was needed. Depends on the PF2e system exposing a trait → description-key map (`CONFIG.PF2E.traitsDescriptions`); if a given trait doesn't show a tooltip, its slug may not be in that map, or the property name may differ from what's expected — let us know which trait if you spot one missing.

## Bugfix (v0.4.13)

- The right-click context menu now also works on content-links inside a document's description (e.g. "Shatter" referenced from a spell list) — previously it only worked on sidebar items, while middle-click already worked everywhere.

## Features (v0.4.12)

- **Bookmarks and Recently Viewed are now pinned to the sidebar everywhere.** They used to only show on Home — navigating into a feat or a journal page replaced them with that compendium's or journal's own listing. Now they sit at the top of the sidebar on every screen, updating live, with the contextual listing (compendium siblings, a journal's own pages, etc.) below them. They share the same collapse state across pages, so folding "Bookmarks" once keeps it folded everywhere.

## Features (v0.4.11)

- **Right-click context menus.**
  - On any sidebar item: open in a new (background) tab, copy an `@UUID[...]` content-link to the clipboard, bookmark/unbookmark, or open the document's native Foundry sheet.
  - On a tab: new tab, pin/unpin, clear that tab's history, clear every open tab's history, or close it.
- **Clearing history doesn't move you.** Clearing a tab's back/forward stack keeps you exactly on the page you're currently viewing — useful once a long session has built up a history that's more clutter than useful.

## Bugfix (v0.4.9)

- Fixed a blank sidebar when opening an item (feat, spell, etc.) in a tab that never "visited" its containing compendium first — this happened with middle-click, bookmarks, the command palette, and "recently viewed". The item's own compendium listing is now rebuilt on the fly, with the current item highlighted.
- Collapsible sections are no longer Home-only: pack listings, world journal listings, and a journal's own page list can now be folded too (and remember their state per user), so folding doesn't seem to "stop working" the moment you leave Home.

## Features (v0.4.8)

- **Collapsible sidebar sections.** Click any section header on Home (Bookmarks, folders, Recently viewed, Compendia, World) to fold it away — handy once you've built up a decent list of bookmarks. Each section shows its item count next to the chevron, and the collapsed/expanded state is remembered per user.
- **Bookmarks now lead the Home sidebar**, above Recently viewed, since they're the ones a GM curates on purpose.

## Bugfix (v0.4.7)

- Fixed middle-click not opening anything at all in some browsers — content-links and tabs have no real `href`, so a middle-click could be swallowed by the browser's autoscroll instead of firing a click. Now suppressed on mousedown so the click always goes through.

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
