# Changelog

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
