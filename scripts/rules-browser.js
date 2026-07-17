/**
 * RulesBrowser
 * A single-window, browser-like reader for rules content.
 *
 * v0.4.0:
 *  - Command palette (Ctrl+K default): quick-jump overlay reusing the name
 *    index, independent of the per-tab sidebar search.
 *  - Keyboard shortcuts (new/close tab, back/forward, focus search),
 *    registered via game.keybindings so the person can remap them.
 *  - Pinned tabs: icon-only, survive session restore, can't be closed by
 *    accident (middle-click / close-tab shortcut skip them).
 *  - "Recently viewed" on the Home screen, alongside bookmarks.
 *
 * v0.2.0:
 *  - Tabs: each tab owns its history stack, scroll positions and contextual
 *    sidebar. Ctrl/Cmd+click or middle-click opens links in a background tab.
 *  - Share with table: posts a chat card with a content link and an
 *    "open in Rules Browser" button for every connected client.
 *
 * Key ideas (from v0.1.0):
 *  - Singleton ApplicationV2 with Handlebars parts (tabs / toolbar / sidebar /
 *    content) so partial re-renders keep focus in the search box.
 *  - A capture-phase click listener intercepts every `a.content-link` inside
 *    the window and renders the target in-place instead of letting Foundry's
 *    global handler open a new sheet.
 */
import { SearchIndex, sharedSearchIndex } from "./search-index.js";

export const MODULE_ID = "pf2e-rules-browser";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RulesBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {RulesBrowser|null} */
  static #instance = null;

  static get instance() {
    return this.#instance;
  }

  /**
   * Open (or focus) the browser. Optionally navigate straight to a UUID.
   * If the window is already open, UUIDs open in a new tab (browser-like).
   * @param {string|null} uuid
   */
  static async open(uuid = null) {
    this.#instance ??= new this();
    const app = this.#instance;
    if (!app.tabs.length && !app.#restoreSession()) app.createTab({ activate: true });
    if (uuid) {
      if (app.rendered) await app.openInNewTab({ uuid }, { activate: true });
      else await app.navigateTo({ uuid });
    }
    return app.render({ force: true });
  }

  /* -------------------------------------------- */
  /*  State                                       */
  /* -------------------------------------------- */

  /**
   * @typedef {object} BrowserTab
   * @property {string} id
   * @property {Array<object>} history   Entries: {home}|{world}|{pack}|{uuid,hash?} (+scroll)
   * @property {number} historyIndex
   * @property {object|null} lastSidebar Contextual sidebar reused for items
   * @property {string} label
   * @property {string} icon
   */

  /** @type {BrowserTab[]} */
  tabs = [];
  activeTabId = null;
  #tabCounter = 0;

  searchQuery = "";
  index = sharedSearchIndex;

  /** Scroll offset to restore after the next render (back/forward/tab switch). */
  #pendingScroll = null;
  /** Heading hash to scroll to after the next render. */
  #pendingHash = null;

  #debouncedSearch = foundry.utils.debounce(this.#performSearch.bind(this), 200);

  get activeTab() {
    return this.tabs.find((t) => t.id === this.activeTabId) ?? this.tabs[0] ?? null;
  }

  resetIndex() {
    this.index.reset();
  }

  /* -------------------------------------------- */
  /*  ApplicationV2 configuration                 */
  /* -------------------------------------------- */

  static DEFAULT_OPTIONS = {
    id: "pf2e-rules-browser",
    classes: ["pf2e-rules-browser"],
    window: {
      title: "PF2ERB.Title",
      icon: "fa-solid fa-book-open-reader",
      resizable: true
    },
    position: { width: 1020, height: 720 },
    actions: {
      back: RulesBrowser.#onBack,
      forward: RulesBrowser.#onForward,
      home: RulesBrowser.#onHome,
      navigate: RulesBrowser.#onNavigate,
      openSheet: RulesBrowser.#onOpenSheet,
      clearSearch: RulesBrowser.#onClearSearch,
      selectTab: RulesBrowser.#onSelectTab,
      closeTab: RulesBrowser.#onCloseTab,
      newTab: RulesBrowser.#onNewTab,
      share: RulesBrowser.#onShare,
      toggleBookmark: RulesBrowser.#onToggleBookmark,
      removeBookmark: RulesBrowser.#onRemoveBookmark,
      setBookmarkFolder: RulesBrowser.#onSetBookmarkFolder,
      togglePin: RulesBrowser.#onTogglePin,
      openPalette: RulesBrowser.#onOpenPalette
    }
  };

  static PARTS = {
    tabs: { template: `modules/${MODULE_ID}/templates/tabs.hbs` },
    toolbar: { template: `modules/${MODULE_ID}/templates/toolbar.hbs` },
    sidebar: {
      template: `modules/${MODULE_ID}/templates/sidebar.hbs`,
      scrollable: [""]
    },
    content: { template: `modules/${MODULE_ID}/templates/content.hbs` }
  };

  /* -------------------------------------------- */
  /*  Tab management                              */
  /* -------------------------------------------- */

  /** Create a new tab seeded with the Home view. */
  createTab({ activate = true } = {}) {
    const tab = {
      id: `t${++this.#tabCounter}`,
      history: [{ home: true }],
      historyIndex: 0,
      lastSidebar: null,
      label: game.i18n.localize("PF2ERB.Home"),
      icon: "fa-solid fa-house",
      pinned: false
    };
    this.tabs.push(tab);
    if (activate) this.activeTabId = tab.id;
    return tab;
  }

  /** Open a view in a fresh tab, optionally in the background. */
  async openInNewTab(view, { activate = false } = {}) {
    if (activate) this.#saveActiveScroll();
    const tab = this.createTab({ activate });
    await this.navigateTo(view, { tab, render: false });
    if (!this.rendered) return;
    if (activate) await this.render();
    else await this.render({ parts: ["tabs"] });
  }

  async closeTab(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const wasActive = this.tabs[idx].id === this.activeTabId;
    this.tabs.splice(idx, 1);

    if (!this.tabs.length) {
      this.createTab({ activate: true });
    } else if (wasActive) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeTabId = next.id;
      this.#pendingScroll = next.history[next.historyIndex]?.scroll ?? 0;
    }
    this.#persistSession();
    await this.render();
  }

  static async #onSelectTab(_event, target) {
    const id = target.dataset.tabId;
    if (!id || id === this.activeTabId) return;
    this.#saveActiveScroll();
    this.activeTabId = id;
    const tab = this.activeTab;
    this.#pendingScroll = tab.history[tab.historyIndex]?.scroll ?? 0;
    this.#pendingHash = null;
    this.#persistSession();
    await this.render();
  }

  static async #onCloseTab(event, target) {
    event.stopPropagation();
    await this.closeTab(target.dataset.tabId);
  }

  static async #onTogglePin(event, target) {
    event.stopPropagation();
    const tab = this.tabs.find((t) => t.id === target.dataset.tabId);
    if (!tab) return;
    tab.pinned = !tab.pinned;
    if (tab.pinned) {
      // Newly-pinned tabs jump to the front, like a browser's pinned strip.
      // After that, drag-and-drop is free to move any tab anywhere.
      this.tabs = [tab, ...this.tabs.filter((t) => t !== tab)];
    }
    this.#persistSession();
    await this.render({ parts: ["tabs"] });
  }

  /**
   * Move a tab to sit right before (or after) another tab. Backs the
   * drag-and-drop tab reordering; this.tabs' order is the single source of
   * truth for display, so this is the only place that needs to change it.
   */
  reorderTab(draggedId, targetId, placeAfter = false) {
    if (draggedId === targetId) return;
    const fromIndex = this.tabs.findIndex((t) => t.id === draggedId);
    let toIndex = this.tabs.findIndex((t) => t.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = this.tabs.splice(fromIndex, 1);
    if (fromIndex < toIndex) toIndex--; // splice above shifted later indices down
    this.tabs.splice(placeAfter ? toIndex + 1 : toIndex, 0, moved);

    this.#persistSession();
    this.render({ parts: ["tabs"] });
  }

  static async #onNewTab() {
    await this.quickNewTab();
  }

  /** Open a fresh Home tab and activate it. Used by the "+" button and by
   *  the "new tab" keyboard shortcut. */
  async quickNewTab() {
    this.#saveActiveScroll();
    this.createTab({ activate: true });
    this.#persistSession();
    await this.render();
  }

  /** Close whichever tab is currently active. Used by the "new tab" keyboard
   *  shortcut's sibling, "close tab". Pinned tabs are skipped, matching
   *  browser convention. */
  async closeActiveTab() {
    const tab = this.activeTab;
    if (tab && !tab.pinned) await this.closeTab(tab.id);
  }

  /** Resolve a human-readable label + icon for a tab's current view. */
  async #updateTabMeta(tab) {
    const view = tab.history[tab.historyIndex] ?? {};
    if (view.home) {
      tab.label = game.i18n.localize("PF2ERB.Home");
      tab.icon = "fa-solid fa-house";
    } else if (view.world) {
      tab.label = game.i18n.localize("PF2ERB.WorldJournals");
      tab.icon = "fa-solid fa-globe";
    } else if (view.pack) {
      tab.label = game.packs.get(view.pack)?.title ?? view.pack;
      tab.icon = "fa-solid fa-atlas";
    } else if (view.uuid) {
      const doc = await fromUuid(view.uuid);
      tab.label = doc?.name ?? game.i18n.localize("PF2ERB.NotFound");
      tab.icon = this.#iconForDocument(doc);
      if (doc) this.#recordRecent({ uuid: view.uuid, label: tab.label, icon: tab.icon });
    }
  }

  #iconForDocument(doc) {
    if (!doc) return "fa-solid fa-circle-question";
    switch (doc.documentName) {
      case "JournalEntry":
        return "fa-solid fa-book";
      case "JournalEntryPage":
        return "fa-solid fa-file-lines";
      case "Item":
        return SearchIndex.ICONS[doc.type] ?? SearchIndex.ICONS.default;
      default:
        return "fa-solid fa-file";
    }
  }

  /* -------------------------------------------- */
  /*  Navigation                                  */
  /* -------------------------------------------- */

  get currentView() {
    const tab = this.activeTab;
    return tab?.history[tab.historyIndex] ?? { home: true };
  }

  /**
   * Navigate a tab to a view descriptor, pushing it onto that tab's history.
   * @param {object} view - {home}|{world}|{pack: packId}|{uuid, hash?}
   */
  async navigateTo(view, { push = true, tab = null, render = true } = {}) {
    tab ??= this.activeTab ?? this.createTab({ activate: true });
    const isActive = tab.id === this.activeTabId;

    if (push) {
      if (isActive) this.#saveActiveScroll();
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(view);
      tab.historyIndex++;
    }
    await this.#updateTabMeta(tab);

    if (isActive) this.#pendingHash = view.hash ?? null;
    this.#persistSession();
    if (render && this.rendered) await this.render();
  }

  static async #onBack() {
    await this.goBack();
  }

  static async #onForward() {
    await this.goForward();
  }

  /** Step the active tab's history back one entry. Used by the toolbar
   *  button and by the "back" keyboard shortcut. */
  async goBack() {
    const tab = this.activeTab;
    if (!tab || tab.historyIndex <= 0) return;
    this.#saveActiveScroll();
    tab.historyIndex--;
    this.#pendingScroll = tab.history[tab.historyIndex].scroll ?? 0;
    await this.#updateTabMeta(tab);
    this.#persistSession();
    await this.render();
  }

  /** Step the active tab's history forward one entry. Used by the toolbar
   *  button and by the "forward" keyboard shortcut. */
  async goForward() {
    const tab = this.activeTab;
    if (!tab || tab.historyIndex >= tab.history.length - 1) return;
    this.#saveActiveScroll();
    tab.historyIndex++;
    this.#pendingScroll = tab.history[tab.historyIndex].scroll ?? 0;
    await this.#updateTabMeta(tab);
    this.#persistSession();
    await this.render();
  }

  static async #onHome() {
    await this.navigateTo({ home: true });
  }

  /**
   * Resolve a navigable view descriptor from a link/element dataset.
   * A specific document (data-uuid) always wins over a whole-pack listing
   * (data-pack) — real Foundry content-links (e.g. "Alchemical Crafting")
   * commonly carry BOTH attributes at once (the document's uuid, plus which
   * pack it came from), so checking pack first would send every one of them
   * to the pack's full listing instead of the document itself.
   */
  static #descriptorFromDataset({ uuid, pack, view, hash } = {}) {
    if (uuid) return { uuid, hash: hash ?? null };
    if (pack) return { pack };
    if (view === "world") return { world: true };
    return null;
  }

  static async #onNavigate(event, target) {
    const descriptor = RulesBrowser.#descriptorFromDataset(target.dataset);
    if (!descriptor) return;
    // Ctrl/Cmd+click: open in a background tab, browser-style.
    if (event.ctrlKey || event.metaKey) return this.openInNewTab(descriptor);
    return this.navigateTo(descriptor);
  }

  static async #onOpenSheet(_event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    doc?.sheet?.render(true);
  }

  /** Focus the sidebar's rule search box. Used by the "focus search"
   *  keyboard shortcut. */
  focusSearchBox() {
    const input = this.element?.querySelector("input.rb-search");
    if (input) {
      input.focus();
      input.select();
    }
  }

  static async #onClearSearch() {
    this.searchQuery = "";
    await this.render({ parts: ["sidebar", "toolbar"] });
    this.element.querySelector("input.rb-search")?.focus();
  }

  /* -------------------------------------------- */
  /*  Share with table                            */
  /* -------------------------------------------- */

  static async #onShare(_event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid);
    if (!doc) return;

    const name = doc.name ?? game.i18n.localize("PF2ERB.Title");
    const content = `
      <div class="pf2erb-share">
        <header><i class="fa-solid fa-book-open-reader"></i> ${game.i18n.localize("PF2ERB.SharedCard")}</header>
        <p>@UUID[${uuid}]{${name}}</p>
        <button type="button" class="pf2erb-open-link" data-uuid="${uuid}">
          <i class="fa-solid fa-book-open-reader"></i>
          ${game.i18n.localize("PF2ERB.OpenInBrowser")}
        </button>
      </div>`;

    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker()
    });
    ui.notifications.info(game.i18n.localize("PF2ERB.SharedNotification"));
  }

  /* -------------------------------------------- */
  /*  Bookmarks (per user, stored as a User flag) */
  /* -------------------------------------------- */

  /** @returns {Array<{key: string, view: object, label: string, icon: string, folder: string|null}>} */
  getBookmarks() {
    return foundry.utils.deepClone(game.user.getFlag(MODULE_ID, "bookmarks") ?? []);
  }

  /** Distinct folder names currently in use, alphabetically sorted. A folder
   *  only "exists" while at least one bookmark references it — there's no
   *  separate folder list to keep in sync. */
  getBookmarkFolders() {
    const names = new Set();
    for (const b of this.getBookmarks()) if (b.folder) names.add(b.folder);
    return [...names].sort((a, b) => a.localeCompare(b, game.i18n.lang));
  }

  /** Stable identity for bookmarkable views (documents and packs). */
  #viewKey(view) {
    if (view?.uuid) return view.uuid;
    if (view?.pack) return `pack:${view.pack}`;
    return null;
  }

  static async #onToggleBookmark() {
    const view = this.currentView;
    const key = this.#viewKey(view);
    if (!key) return;

    const bookmarks = this.getBookmarks();
    const existing = bookmarks.findIndex((b) => b.key === key);
    if (existing >= 0) bookmarks.splice(existing, 1);
    else {
      const tab = this.activeTab;
      bookmarks.push({
        key,
        view: view.uuid ? { uuid: view.uuid } : { pack: view.pack },
        label: tab?.label ?? key,
        icon: tab?.icon ?? "fa-solid fa-star",
        folder: null
      });
    }
    await game.user.setFlag(MODULE_ID, "bookmarks", bookmarks);
    await this.render({ parts: ["toolbar", "sidebar"] });
  }

  static async #onRemoveBookmark(event, target) {
    event.stopPropagation();
    const key = target.dataset.key;
    if (!key) return;
    const bookmarks = this.getBookmarks().filter((b) => b.key !== key);
    await game.user.setFlag(MODULE_ID, "bookmarks", bookmarks);
    await this.render({ parts: ["toolbar", "sidebar"] });
  }

  /** Prompts for a folder name (existing folders offered as suggestions) and
   *  assigns/reassigns the bookmark to it. An empty answer moves it back to
   *  the general, folder-less list. */
  static async #onSetBookmarkFolder(event, target) {
    event.stopPropagation();
    const key = target.dataset.key;
    const bookmarks = this.getBookmarks();
    const entry = bookmarks.find((b) => b.key === key);
    if (!entry) return;

    const folders = this.getBookmarkFolders();
    const options = folders
      .map((f) => `<option value="${f.replace(/"/g, "&quot;")}"></option>`)
      .join("");
    const current = entry.folder ?? "";

    const DialogV2 = foundry.applications.api.DialogV2;
    const result = await DialogV2.prompt({
      window: { title: game.i18n.localize("PF2ERB.Folder.DialogTitle") },
      content: `
        <p>${game.i18n.localize("PF2ERB.Folder.Prompt")}</p>
        <input type="text" name="folder" list="pf2erb-folder-list"
               value="${current.replace(/"/g, "&quot;")}"
               placeholder="${game.i18n.localize("PF2ERB.Folder.NoFolder")}" autocomplete="off">
        <datalist id="pf2erb-folder-list">${options}</datalist>
      `,
      ok: {
        label: game.i18n.localize("PF2ERB.Folder.Save"),
        callback: (_event, button) => button.form.elements.folder.value.trim()
      },
      rejectClose: false
    });
    if (result === null || result === undefined) return;

    entry.folder = result || null;
    await game.user.setFlag(MODULE_ID, "bookmarks", bookmarks);
    await this.render({ parts: ["sidebar"] });
  }

  /* -------------------------------------------- */
  /*  Recently viewed (per user, stored as a User flag) */
  /* -------------------------------------------- */

  static MAX_RECENTS = 15;

  /** @returns {Array<{uuid: string, label: string, icon: string}>} newest first */
  getRecents() {
    return foundry.utils.deepClone(game.user.getFlag(MODULE_ID, "recent") ?? []);
  }

  #persistRecent = foundry.utils.debounce((entries) => {
    game.user.setFlag(MODULE_ID, "recent", entries);
  }, 1500);

  /** Push a document to the front of "recently viewed", deduping by uuid and
   *  capping the list. Debounced so rapid back/forward doesn't spam writes;
   *  the in-memory copy is used for immediate rendering regardless. */
  #recordRecent({ uuid, label, icon }) {
    const entries = this.getRecents().filter((e) => e.uuid !== uuid);
    entries.unshift({ uuid, label, icon });
    entries.length = Math.min(entries.length, RulesBrowser.MAX_RECENTS);
    this.#recentsCache = entries;
    this.#persistRecent(entries);
  }

  /** In-memory mirror so Home reflects the latest visit immediately, without
   *  waiting for the debounced flag write to resolve. */
  #recentsCache = null;

  getRecentsForDisplay() {
    return this.#recentsCache ?? this.getRecents();
  }

  /* -------------------------------------------- */
  /*  Session persistence (per user)              */
  /* -------------------------------------------- */

  static MAX_PERSISTED_HISTORY = 30;

  /** Debounced: called after every navigation / tab operation. */
  #persistSession = foundry.utils.debounce(() => this.#saveSession(), 1000);

  async #saveSession() {
    if (!game.settings.get(MODULE_ID, "rememberSession")) return;
    this.#saveActiveScroll();
    const max = RulesBrowser.MAX_PERSISTED_HISTORY;
    const data = {
      activeTabId: this.activeTabId,
      tabs: this.tabs.map((t) => {
        const start = Math.max(0, t.history.length - max);
        return {
          id: t.id,
          history: foundry.utils.deepClone(t.history.slice(start)),
          historyIndex: Math.max(0, t.historyIndex - start),
          label: t.label,
          icon: t.icon,
          pinned: !!t.pinned
        };
      })
    };
    await game.user.setFlag(MODULE_ID, "session", data);
  }

  /** @returns {boolean} whether a previous session was restored */
  #restoreSession() {
    if (!game.settings.get(MODULE_ID, "rememberSession")) return false;
    const data = game.user.getFlag(MODULE_ID, "session");
    if (!data?.tabs?.length) return false;

    this.tabs = data.tabs
      .filter((t) => t.id && Array.isArray(t.history) && t.history.length)
      .map((t) => ({
        id: t.id,
        history: foundry.utils.deepClone(t.history),
        historyIndex: Math.clamp?.(t.historyIndex ?? 0, 0, t.history.length - 1)
          ?? Math.min(Math.max(t.historyIndex ?? 0, 0), t.history.length - 1),
        lastSidebar: null,
        label: t.label ?? game.i18n.localize("PF2ERB.Home"),
        icon: t.icon ?? "fa-solid fa-house",
        pinned: !!t.pinned
      }));
    if (!this.tabs.length) return false;

    this.activeTabId = this.tabs.some((t) => t.id === data.activeTabId)
      ? data.activeTabId
      : this.tabs[0].id;
    this.#tabCounter = Math.max(
      0,
      ...this.tabs.map((t) => Number.parseInt(t.id.slice(1)) || 0)
    );
    return true;
  }

  _onClose(options) {
    super._onClose?.(options);
    this.#tableObserver?.disconnect();
    this.#closeCommandPalette();
    this.#saveSession();
  }

  /* -------------------------------------------- */
  /*  Search                                      */
  /* -------------------------------------------- */

  async #performSearch(query) {
    this.searchQuery = query;
    await this.render({ parts: ["sidebar"] });
  }

  /* -------------------------------------------- */
  /*  Rendering context                           */
  /* -------------------------------------------- */

  async _prepareContext(_options) {
    const tab = this.activeTab ?? this.createTab({ activate: true });

    const bookmarkKey = this.#viewKey(this.currentView);
    const context = {
      canBack: tab.historyIndex > 0,
      canForward: tab.historyIndex < tab.history.length - 1,
      searchQuery: this.searchQuery,
      bookmarkable: !!bookmarkKey,
      bookmarked: !!bookmarkKey && this.getBookmarks().some((b) => b.key === bookmarkKey),
      tabs: this.tabs.map((t) => ({
        id: t.id,
        label: t.label,
        icon: t.icon,
        active: t.id === this.activeTabId,
        pinned: !!t.pinned
      }))
    };

    context.search = await this.#prepareSearch();

    const view = this.currentView;
    if (view.home) await this.#prepareHome(context, tab);
    else if (view.world) await this.#prepareWorld(context, tab);
    else if (view.pack) await this.#preparePack(context, tab, view.pack);
    else if (view.uuid) await this.#prepareDocument(context, tab, view);

    // Fallbacks so templates never explode.
    context.sidebar ??= tab.lastSidebar ?? { sections: [] };
    context.content ??= { error: game.i18n.localize("PF2ERB.NotFound") };
    return context;
  }

  /** Set while the full-text index is building; drives the progress bar. */
  #textIndexProgress = null;

  #debouncedProgressRender = foundry.utils.debounce(() => {
    if (this.rendered) this.render({ parts: ["sidebar"] });
  }, 150);

  /** Starts the full-text build exactly once (idempotent across renders)
   *  and wires its progress callback to a (debounced) sidebar re-render. */
  #ensureTextIndexBuilding() {
    if (this.index.isBuildingTextIndex || this.index.isTextIndexReady) return;
    this.index
      .buildTextIndex((step, total) => {
        this.#textIndexProgress = { step, total };
        this.#debouncedProgressRender();
      })
      .then(() => {
        this.#textIndexProgress = null;
        if (this.rendered && this.searchQuery.trim().length >= 2) {
          this.render({ parts: ["sidebar"] });
        }
      });
  }

  async #prepareSearch() {
    const q = this.searchQuery.trim();
    if (q.length < 2) return null;

    const names = await this.index.searchNames(q);
    let texts = this.index.searchText(q);
    let building = false;
    let progress = null;

    if (texts === null) {
      building = true;
      progress = this.#textIndexProgress
        ? Math.round((this.#textIndexProgress.step / this.#textIndexProgress.total) * 100)
        : 0;
      this.#ensureTextIndexBuilding();
    }

    texts ??= [];
    return {
      query: q,
      names,
      texts,
      building,
      progress,
      hasNames: names.length > 0,
      hasTexts: texts.length > 0,
      empty: !building && names.length === 0 && texts.length === 0
    };
  }

  async #prepareHome(context, tab) {
    const packItems = this.index.journalPacks().map((p) => ({
      name: p.title,
      pack: p.collection,
      icon: "fa-solid fa-atlas"
    }));

    const sections = [
      { label: game.i18n.localize("PF2ERB.Compendia"), items: packItems }
    ];

    const bookmarks = this.getBookmarks();
    if (bookmarks.length) {
      const toItem = (b) => ({
        name: b.label,
        icon: b.icon,
        uuid: b.view.uuid,
        pack: b.view.pack,
        removeKey: b.key,
        folderKey: b.key
      });

      // Built in display order (general bookmarks, then each folder), then
      // unshifted as a batch so that order is preserved at the front of the
      // sidebar. A folder only exists while at least one bookmark uses it.
      const bookmarkSections = [];
      const general = bookmarks.filter((b) => !b.folder);
      if (general.length) {
        bookmarkSections.push({
          label: game.i18n.localize("PF2ERB.Bookmarks"),
          items: general.map(toItem)
        });
      }
      for (const folder of this.getBookmarkFolders()) {
        bookmarkSections.push({
          label: folder,
          icon: "fa-solid fa-folder",
          items: bookmarks.filter((b) => b.folder === folder).map(toItem)
        });
      }
      sections.unshift(...bookmarkSections);
    }

    const recents = this.getRecentsForDisplay();
    if (recents.length) {
      sections.unshift({
        label: game.i18n.localize("PF2ERB.Recent"),
        items: recents.map((r) => ({ name: r.label, icon: r.icon, uuid: r.uuid }))
      });
    }
    if (game.settings.get(MODULE_ID, "includeWorldJournals")) {
      sections.push({
        label: game.i18n.localize("PF2ERB.World"),
        items: [
          {
            name: game.i18n.localize("PF2ERB.WorldJournals"),
            view: "world",
            icon: "fa-solid fa-globe"
          }
        ]
      });
    }

    context.sidebar = { sections };
    tab.lastSidebar = context.sidebar;
    context.content = { welcome: true };
  }

  async #prepareWorld(context, tab) {
    const items = game.journal
      .filter((j) => j.testUserPermission(game.user, "OBSERVER"))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
      .map((j) => ({ name: j.name, uuid: j.uuid, icon: "fa-solid fa-book" }));

    context.sidebar = {
      sections: [{ label: game.i18n.localize("PF2ERB.WorldJournals"), items }]
    };
    tab.lastSidebar = context.sidebar;
    context.content = {
      listing: {
        title: game.i18n.localize("PF2ERB.WorldJournals"),
        meta: game.i18n.format("PF2ERB.DocumentCount", { count: items.length })
      }
    };
  }

  async #preparePack(context, tab, packId) {
    const pack = game.packs.get(packId);
    if (!pack) return;
    const index = await pack.getIndex();
    const items = [...index]
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
      .map((e) => ({ name: e.name, uuid: e.uuid, icon: "fa-solid fa-book" }));

    context.sidebar = { sections: [{ label: pack.title, items }] };
    tab.lastSidebar = context.sidebar;
    context.content = {
      listing: {
        title: pack.title,
        meta: game.i18n.format("PF2ERB.DocumentCount", { count: items.length })
      }
    };
  }

  async #prepareDocument(context, tab, view) {
    const doc = await fromUuid(view.uuid);
    if (!doc) {
      context.content = { error: game.i18n.localize("PF2ERB.NotFound") };
      return;
    }

    switch (doc.documentName) {
      case "JournalEntry":
        return this.#prepareJournalEntry(context, tab, doc);
      case "JournalEntryPage":
        return this.#prepareJournalPage(context, tab, doc);
      case "Item":
        return this.#prepareItem(context, tab, doc);
      default:
        // Actors, RollTables, Macros... show a stub with an "open sheet" escape hatch.
        context.content = {
          header: { title: doc.name, subtitle: doc.documentName },
          sheetUuid: doc.uuid,
          unsupported: true
        };
    }
  }

  #journalSidebar(journal, activePageUuid = null) {
    const items = journal.pages.contents
      .sort((a, b) => a.sort - b.sort)
      .map((p) => ({
        name: p.name,
        uuid: p.uuid,
        icon: "fa-solid fa-file-lines",
        active: p.uuid === activePageUuid,
        level: p.title?.level ?? 1
      }));
    return { sections: [{ label: journal.name, items }] };
  }

  async #prepareJournalEntry(context, tab, journal) {
    context.sidebar = this.#journalSidebar(journal);
    tab.lastSidebar = context.sidebar;

    const pages = journal.pages.contents.sort((a, b) => a.sort - b.sort);
    // Single-page journals: show the page straight away.
    if (pages.length === 1) return this.#prepareJournalPage(context, tab, pages[0], journal);

    context.content = {
      header: { title: journal.name },
      sheetUuid: journal.uuid,
      pagesToc: pages.map((p) => ({ name: p.name, uuid: p.uuid }))
    };
  }

  async #prepareJournalPage(context, tab, page, journalOverride = null) {
    const journal = journalOverride ?? page.parent;
    context.sidebar = this.#journalSidebar(journal, page.uuid);
    tab.lastSidebar = context.sidebar;

    const content = {
      header: {
        title: page.name,
        crumb: { name: journal.name, uuid: journal.uuid }
      },
      sheetUuid: page.uuid
    };

    if (page.type === "text" && page.text?.content) {
      const TextEditorImpl =
        foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
      content.html = await TextEditorImpl.enrichHTML(page.text.content, {
        relativeTo: page,
        secrets: page.isOwner
      });
    } else if (page.type === "image" && page.src) {
      content.image = { src: page.src, caption: page.image?.caption ?? "" };
    } else {
      content.unsupported = true;
    }

    context.content = content;
  }

  async #prepareItem(context, tab, item) {
    // Keep whatever contextual sidebar we had (pack listing, journal pages...).
    context.sidebar = tab.lastSidebar ?? { sections: [] };

    const sys = item.system ?? {};
    const traits = (sys.traits?.value ?? []).map((t) =>
      game.i18n.localize(CONFIG.PF2E?.actionTraits?.[t] ?? CONFIG.PF2E?.featTraits?.[t] ?? t)
    );

    const content = {
      header: {
        title: item.name,
        subtitle: game.i18n.localize(`TYPES.Item.${item.type}`) ?? item.type,
        img: item.img,
        level: sys.level?.value,
        rarity: sys.traits?.rarity && sys.traits.rarity !== "common"
          ? game.i18n.localize(CONFIG.PF2E?.rarityTraits?.[sys.traits.rarity] ?? sys.traits.rarity)
          : null,
        traits,
        source: sys.publication?.title || sys.source?.value || null
      },
      sheetUuid: item.uuid
    };

    const description = sys.description?.value;
    if (description) {
      const TextEditorImpl =
        foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
      content.html = await TextEditorImpl.enrichHTML(description, {
        relativeTo: item,
        secrets: item.isOwner
      });
    }

    context.content = content;
  }

  /* -------------------------------------------- */
  /*  DOM lifecycle                               */
  /* -------------------------------------------- */

  #contentEl() {
    return this.element?.querySelector(".rb-content");
  }

  #saveActiveScroll() {
    const tab = this.activeTab;
    const entry = tab?.history[tab.historyIndex];
    if (entry) entry.scroll = this.#contentEl()?.scrollTop ?? 0;
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);

    // 1) Intercept every content-link click inside this window (capture phase,
    //    so we run BEFORE Foundry's document-level handler) and navigate
    //    in-place instead of opening a new sheet. Ctrl/Cmd+click opens the
    //    target in a background tab.
    this.element.addEventListener(
      "click",
      (event) => {
        const link = event.target.closest("a.content-link");
        if (!link) return;
        const uuid = link.dataset.uuid;
        if (!uuid) return;
        event.preventDefault();
        event.stopPropagation();
        const view = { uuid, hash: link.dataset.hash ?? null };
        if (event.ctrlKey || event.metaKey) this.openInNewTab(view);
        else this.navigateTo(view);
      },
      true
    );

    // 2) Middle-click: open links in a background tab / close tabs.
    this.element.addEventListener(
      "auxclick",
      (event) => {
        if (event.button !== 1) return;
        const link = event.target.closest("a.content-link, [data-action='navigate']");
        if (link) {
          event.preventDefault();
          event.stopPropagation();
          const descriptor = RulesBrowser.#descriptorFromDataset(link.dataset);
          if (descriptor) this.openInNewTab(descriptor);
          return;
        }
        const tabEl = event.target.closest(".rb-tab");
        if (tabEl) {
          event.preventDefault();
          const tab = this.tabs.find((t) => t.id === tabEl.dataset.tabId);
          if (!tab?.pinned) this.closeTab(tabEl.dataset.tabId);
        }
      },
      true
    );

    // 2b) Drag-and-drop tab reordering. Delegated on the app element so it
    // survives tab-strip re-renders without needing to be re-attached.
    this.element.addEventListener("dragstart", (event) => {
      const tabEl = event.target.closest(".rb-tab");
      if (!tabEl) return;
      event.dataTransfer.setData("text/plain", tabEl.dataset.tabId);
      event.dataTransfer.effectAllowed = "move";
      tabEl.classList.add("dragging");
    });

    this.element.addEventListener("dragend", (event) => {
      event.target.closest(".rb-tab")?.classList.remove("dragging");
      for (const el of this.element.querySelectorAll(".rb-tab.drag-over")) {
        el.classList.remove("drag-over");
      }
    });

    this.element.addEventListener("dragover", (event) => {
      const tabEl = event.target.closest(".rb-tab");
      if (!tabEl) return;
      event.preventDefault(); // required to allow a drop
      event.dataTransfer.dropEffect = "move";
      tabEl.classList.add("drag-over");
    });

    this.element.addEventListener("dragleave", (event) => {
      event.target.closest(".rb-tab")?.classList.remove("drag-over");
    });

    this.element.addEventListener("drop", (event) => {
      const tabEl = event.target.closest(".rb-tab");
      if (!tabEl) return;
      event.preventDefault();
      tabEl.classList.remove("drag-over");
      const draggedId = event.dataTransfer.getData("text/plain");
      if (draggedId) this.reorderTab(draggedId, tabEl.dataset.tabId);
    });

    // 3) Delegated search input (survives partial re-renders of the sidebar).
    this.element.addEventListener("input", (event) => {
      const input = event.target.closest("input.rb-search");
      if (!input) return;
      this.#debouncedSearch(input.value);
    });

    // 4) Enter in the search box opens the first result.
    this.element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (!event.target.closest("input.rb-search")) return;
      const first = this.element.querySelector(".rb-sidebar a[data-uuid]");
      if (first) this.navigateTo({ uuid: first.dataset.uuid });
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const contentEl = this.#contentEl();
    if (!contentEl) return;

    // Previous attempts assumed this content used real <table> markup and
    // that the surrounding area was already dark, then chose translucent
    // overlay colors on that assumption. Neither held reliably (the source
    // markup and its backdrop vary), so instead of guessing structure this
    // walks every element actually rendered, reads its *computed* background
    // and text color, and forces anything that would be unreadable against
    // our dark theme — regardless of whether it's a table, a div, or
    // anything else.
    this.#fixContentContrast(contentEl);
    this.#watchForLateContent(contentEl);

    if (this.#pendingScroll !== null) {
      contentEl.scrollTop = this.#pendingScroll;
      this.#pendingScroll = null;
    } else if (options.parts?.includes("content") ?? true) {
      contentEl.scrollTop = 0;
    }

    if (this.#pendingHash) {
      this.#scrollToHash(this.#pendingHash);
      this.#pendingHash = null;
    }
  }

  /** Reapplies the contrast fix if content changes after the initial render
   *  (e.g. an @Embed directive resolving and inserting content late). */
  #tableObserver = null;
  #debouncedRestyle = foundry.utils.debounce((el) => this.#fixContentContrast(el), 60);

  #watchForLateContent(contentEl) {
    this.#tableObserver?.disconnect();
    this.#tableObserver = new MutationObserver(() => this.#debouncedRestyle(contentEl));
    // childList/subtree only: setting inline styles doesn't trigger this, so
    // the contrast fix can't re-trigger itself in a loop.
    this.#tableObserver.observe(contentEl, { childList: true, subtree: true });
  }

  /**
   * Walk every element under the current document body and force anything
   * that would be unreadable against our dark theme: a light background
   * (designed to sit under dark text) or dark text (designed to sit on a
   * light background). Uses the browser's own *computed* styles, so it
   * doesn't matter whether the color came from an inline attribute, a class,
   * or the system's own stylesheet loading after ours — and it doesn't
   * matter whether the markup is a real `<table>`, a div-based grid, or
   * anything else.
   *
   * Uses `style.setProperty(prop, value, "important")`, a genuine inline
   * `!important` declaration that outranks any external stylesheet.
   */
  #fixContentContrast(root) {
    const body = root.querySelector(".rb-doc-body");
    if (!body) return;

    const HEADER_BG = "rgb(120 40 40 / 55%)";
    const HEADER_FG = "#f0dcc4";
    const NEUTRAL_BG = "rgb(255 255 255 / 4%)";
    const NEUTRAL_FG = "#d8d0c5";

    const setImportant = (el, prop, value) => el.style.setProperty(prop, value, "important");

    const parseColor = (str) => {
      const m = str?.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/
      );
      if (!m) return null;
      let a = m[4] !== undefined ? parseFloat(m[4]) : 1;
      if (m[4]?.endsWith("%")) a /= 100;
      return { r: +m[1], g: +m[2], b: +m[3], a };
    };
    const luminance = ({ r, g, b }) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    const isHeaderish = (el) =>
      el.tagName === "TH" ||
      el.closest("thead") !== null ||
      el.getAttribute("role") === "columnheader";

    for (const el of [body, ...body.querySelectorAll("*")]) {
      const cs = getComputedStyle(el);

      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a > 0.12 && luminance(bg) > 0.5) {
        setImportant(el, "background-color", isHeaderish(el) ? HEADER_BG : NEUTRAL_BG);
        setImportant(el, "background-image", "none");
      }

      const fg = parseColor(cs.color);
      if (fg && fg.a > 0.4 && luminance(fg) < 0.45) {
        setImportant(el, "color", isHeaderish(el) ? HEADER_FG : NEUTRAL_FG);
      }
    }
  }

  /* -------------------------------------------- */
  /*  Command palette (quick jump, Ctrl+K default) */
  /* -------------------------------------------- */

  #paletteEl = null;

  /** Opens the palette if closed, closes it if open. Bound to the
   *  "commandPalette" keybinding registered in module.js. */
  toggleCommandPalette() {
    if (this.#paletteEl) this.#closeCommandPalette();
    else this.#openCommandPalette();
  }

  static #onOpenPalette() {
    this.toggleCommandPalette();
  }

  #closeCommandPalette() {
    this.#paletteEl?.remove();
    this.#paletteEl = null;
  }

  /**
   * Builds the palette as a fixed-position overlay appended to
   * document.body (not to this.element), so a Handlebars re-render of the
   * app's parts can never wipe it out from under an in-progress search.
   */
  #openCommandPalette() {
    if (this.#paletteEl || !this.rendered) return;

    const backdrop = document.createElement("div");
    backdrop.className = "pf2e-rules-browser rb-palette-backdrop";

    const box = document.createElement("div");
    box.className = "rb-palette";

    const inputRow = document.createElement("div");
    inputRow.className = "rb-palette-input-row";
    const boltIcon = document.createElement("i");
    boltIcon.className = "fa-solid fa-bolt";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rb-palette-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = game.i18n.localize("PF2ERB.PaletteHint");
    inputRow.append(boltIcon, input);

    const list = document.createElement("ol");
    list.className = "rb-palette-results";

    box.append(inputRow, list);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    this.#paletteEl = backdrop;

    let results = [];
    let selected = 0;

    const renderResults = () => {
      list.innerHTML = "";
      results.forEach((r, i) => {
        const li = document.createElement("li");
        li.dataset.index = String(i);
        if (i === selected) li.classList.add("active");
        const icon = document.createElement("i");
        icon.className = r.icon;
        const name = document.createElement("span");
        name.className = "rb-item-name";
        name.textContent = r.name;
        const source = document.createElement("span");
        source.className = "rb-item-source";
        source.textContent = r.source ?? "";
        li.append(icon, name, source);
        list.appendChild(li);
      });
      if (!results.length && input.value.trim().length >= 2) {
        const li = document.createElement("li");
        li.className = "rb-hint";
        li.textContent = game.i18n.localize("PF2ERB.NoResults");
        list.appendChild(li);
      }
    };

    const runSearch = foundry.utils.debounce(async (query) => {
      results = query.trim().length >= 2 ? await this.index.searchNames(query, 20) : [];
      selected = 0;
      renderResults();
    }, 120);

    input.addEventListener("input", () => runSearch(input.value));

    const commit = (index) => {
      const result = results[index];
      if (!result) return;
      this.#closeCommandPalette();
      this.navigateTo({ uuid: result.uuid });
    };

    list.addEventListener("click", (event) => {
      const li = event.target.closest("li[data-index]");
      if (li) commit(Number(li.dataset.index));
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.#closeCommandPalette();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (results.length) {
          selected = (selected + 1) % results.length;
          renderResults();
        }
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (results.length) {
          selected = (selected - 1 + results.length) % results.length;
          renderResults();
        }
      } else if (event.key === "Enter") {
        event.preventDefault();
        commit(selected);
      }
    });

    // Click on the dimmed backdrop (not the box itself) closes the palette.
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) this.#closeCommandPalette();
    });

    requestAnimationFrame(() => input.focus());
  }

  /** Scroll to the heading whose slug matches a content-link's data-hash. */
  #scrollToHash(hash) {
    const body = this.element.querySelector(".rb-doc-body");
    if (!body) return;
    const PageCls = CONFIG.JournalEntryPage?.documentClass;
    for (const heading of body.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      try {
        if (PageCls?.slugifyHeading?.(heading) === hash) {
          heading.scrollIntoView({ block: "start" });
          return;
        }
      } catch {
        /* ignore malformed headings */
      }
    }
  }
}
