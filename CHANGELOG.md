# Changelog

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
