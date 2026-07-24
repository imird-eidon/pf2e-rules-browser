# Changelog

## 0.4.18

- Fixed inline damage-roll buttons (e.g. persistent damage) doing nothing / throwing a console error ("Failed to parse damage formula {}"). PF2e's own click handler resolves item context via a native sheet or a non-compendium UUID — it explicitly skips that resolution for any "Compendium." UUID, which is most of what this module shows. These clicks are now handled directly: rolled with the formula already correctly baked into the link (via the rollData fix from 0.4.17) and posted to chat, bypassing PF2e's broken fallback. Trades away the native configurable "Damage Roll" dialog for a roll that actually works.

## 0.4.17

- Fixed incorrect inline roll values in descriptions (e.g. a spell showing "0 persistent acid" instead of the correct "1"). Neither enrichHTML call passed explicit `rollData`, so formulas referencing the item's own data had nothing to resolve against and fell back to 0. Both items and journal pages now pass `getRollData()`, matching what Foundry's native sheets do.

## 0.4.16

- Fixed the "scroll to top" button appearing to scroll away with the text instead of staying pinned. CSS-only anchoring (position:absolute) didn't stay clamped to the visible box in practice; it's now positioned in real screen pixels computed from the content pane's actual on-screen rectangle, which is immune to that.

## 0.4.15

- Added a "scroll to top" button that fades in once you've scrolled down a bit in a long page, and fades back out near the top. Subtle by default, fully visible on hover.

## 0.4.14

- Trait pills (e.g. MANIPULATE, CONCENTRATE) now show the same hover tooltip with the trait's full description that Foundry's native item sheets show, using Foundry's own core tooltip system.

## 0.4.13

- The right-click context menu now also works on content-links inside a document's description (e.g. "Shatter" referenced from a spell list) — previously it only worked on sidebar items, matching what middle-click already did everywhere.

## 0.4.12

- Bookmarks (and folders) and Recently Viewed now stay pinned to the top of the sidebar on every screen, not just Home — they no longer get replaced by the compendium/journal listing of whatever page you're currently viewing. They still update live and share the same collapse state everywhere.

## 0.4.11

- Right-click context menus: sidebar items (open in new tab, copy an `@UUID` link, bookmark/unbookmark, open native sheet) and tabs (new tab, pin/unpin, clear this tab's history, clear all tabs' history, close).
- Clearing a tab's history keeps you exactly where you are — it only wipes the back/forward stack, not your current page.

## 0.4.10

- Fixed the package listing's gallery images on foundryvtt.com — they were pointing at temporary GitHub attachment URLs (`private-user-images.githubusercontent.com`, which expire after a few minutes) instead of permanent raw file URLs. No module code changed.

## 0.4.9

- Fixed a blank sidebar when opening an item (feat, spell, etc.) in a tab that never "visited" its containing compendium first — happened with middle-click, bookmarks, the command palette, and "recently viewed". The item's own compendium listing is now rebuilt on the fly, with the current item highlighted.
- Collapsible sections are no longer Home-only: pack listings, world journal listings, and a journal's own page list can now be folded too, and remember their state per user.

## 0.4.8

- Sidebar sections (Bookmarks, folders, Recently viewed, Compendia, World) are now collapsible — click a section header to fold it away. Collapsed state is remembered per user.
- Reordered the Home sidebar: Bookmarks (and their folders) now appear first, above Recently viewed.

## 0.4.7

- Fixed middle-click not opening anything at all in some browsers. Content-links and tabs have no real `href`, so a middle-click could be swallowed by the browser's autoscroll instead of firing a click — now suppressed on mousedown so the click goes through.

## 0.4.6

- Fixed a bug where middle-clicking a content-link that came from a compendium (e.g. a feat) could open the whole compendium's listing in a new tab instead of that specific document. Real Foundry content-links often carry both `data-uuid` and `data-pack` at once; the descriptor resolver now always prefers the specific document.

## 0.4.5

- Drag-and-drop tab reordering. Pinning a tab still jumps it to the front by default, but any tab can be freely dragged anywhere afterward.
- Performance: the name search index is now warmed up in the background as soon as Foundry finishes loading, instead of on first use.
- The full-text index build now shows a real progress bar (based on the number of journal packs processed) instead of a generic spinner.

## 0.4.2

- Default keybinding for opening the browser changed to `Ctrl+S`.

## 0.4.1

- Fixed pinned tabs: the unpin button no longer overlaps the tab's icon on hover, making them reliably clickable.
- Added bookmark folders: group bookmarks (e.g. by adventure/chapter) via a folder icon next to each bookmark.

## 0.4.0

- Command palette (`Ctrl+K` by default): quick-jump overlay to any document, independent of the per-tab sidebar search.
- Keyboard shortcuts for new tab, close tab, back/forward, and focus search — all remappable in Foundry's Controls settings.
- Pinned tabs: icon-only, survive session restore, protected from accidental closing.
- "Recently viewed" section on the Home screen, alongside bookmarks.

## 0.3.x

- Dark-theme contrast fixes for enriched journal content (tables, headings, links) using a markup-agnostic computed-style sweep.
- Bookmarks (per user, stored as a User flag).
- Session persistence: tabs and their histories are restored across reloads.

## 0.2.0

- Tabs: each with its own history stack, scroll position and contextual sidebar. Ctrl/Cmd+click or middle-click opens links in a background tab.
- Share with table: posts a chat card with a content link and an "Open in Rules Browser" button.

## 0.1.0

- Initial release: single-window navigation with link interception, browser-style history, and two-tier (title + lazy full-text) search across journal compendia.
