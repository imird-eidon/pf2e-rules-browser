/**
 * SearchIndex
 * Two-tier lightweight search:
 *  1. Name search: built from compendium indices (cheap, near-instant). Covers
 *     journal entries, their pages, and (optionally) system Item packs.
 *  2. Full-text search: built lazily the first time it is needed. Loads all
 *     journal documents once, extracts plain text with DOMParser and caches it
 *     in memory. Subsequent searches are simple substring scans.
 */
export class SearchIndex {
  /** @type {Array<object>|null} */
  #nameEntries = null;

  /** @type {Array<object>|null} */
  #textEntries = null;

  /** @type {Promise<void>|null} */
  #textBuildPromise = null;

  static ICONS = {
    journal: "fa-solid fa-book",
    page: "fa-solid fa-file-lines",
    feat: "fa-solid fa-medal",
    spell: "fa-solid fa-wand-sparkles",
    action: "fa-solid fa-person-running",
    condition: "fa-solid fa-face-dizzy",
    equipment: "fa-solid fa-toolbox",
    default: "fa-solid fa-suitcase"
  };

  get isTextIndexReady() {
    return this.#textEntries !== null;
  }

  get isBuildingTextIndex() {
    return this.#textBuildPromise !== null && this.#textEntries === null;
  }

  /** Drop all cached data (e.g. after a settings change). */
  reset() {
    this.#nameEntries = null;
    this.#textEntries = null;
    this.#textBuildPromise = null;
  }

  /* -------------------------------------------- */
  /*  Sources                                     */
  /* -------------------------------------------- */

  journalPacks() {
    return game.packs.filter((p) => p.documentName === "JournalEntry" && p.visible);
  }

  itemPacks() {
    const moduleId = "pf2e-rules-browser";
    if (!game.settings.get(moduleId, "includeItemPacks")) return [];
    // Only the game system's own Item packs (feats, spells, actions, ...):
    // world/module item packs tend to be homebrew and add noise.
    return game.packs.filter(
      (p) =>
        p.documentName === "Item" &&
        p.visible &&
        p.metadata.packageType === "system"
    );
  }

  #includeWorldJournals() {
    return game.settings.get("pf2e-rules-browser", "includeWorldJournals");
  }

  /* -------------------------------------------- */
  /*  Name index                                  */
  /* -------------------------------------------- */

  async ensureNameIndex() {
    if (this.#nameEntries) return;
    const entries = [];

    // Journal compendia: entries + their pages (page names come with the index).
    for (const pack of this.journalPacks()) {
      const index = await pack.getIndex({ fields: ["pages._id", "pages.name"] });
      for (const e of index) {
        entries.push({
          name: e.name,
          uuid: e.uuid,
          type: "journal",
          source: pack.title
        });
        for (const p of e.pages ?? []) {
          if (!p?.name) continue;
          entries.push({
            name: p.name,
            uuid: `${e.uuid}.JournalEntryPage.${p._id}`,
            type: "page",
            source: `${pack.title} · ${e.name}`
          });
        }
      }
    }

    // Item packs: names only.
    for (const pack of this.itemPacks()) {
      const index = await pack.getIndex();
      for (const e of index) {
        entries.push({
          name: e.name,
          uuid: e.uuid,
          type: e.type ?? "item",
          source: pack.title
        });
      }
    }

    // World journals.
    if (this.#includeWorldJournals()) {
      for (const journal of game.journal) {
        if (!journal.testUserPermission(game.user, "OBSERVER")) continue;
        entries.push({
          name: journal.name,
          uuid: journal.uuid,
          type: "journal",
          source: game.i18n.localize("PF2ERB.World")
        });
        for (const page of journal.pages) {
          entries.push({
            name: page.name,
            uuid: page.uuid,
            type: "page",
            source: `${game.i18n.localize("PF2ERB.World")} · ${journal.name}`
          });
        }
      }
    }

    this.#nameEntries = entries;
  }

  /**
   * Search by name. Prefix matches are ranked before substring matches.
   * @returns {Promise<Array<object>>}
   */
  async searchNames(query, limit = 30) {
    await this.ensureNameIndex();
    const q = query.toLowerCase();
    const starts = [];
    const contains = [];
    for (const e of this.#nameEntries) {
      const idx = e.name.toLowerCase().indexOf(q);
      if (idx === 0) starts.push(e);
      else if (idx > 0) contains.push(e);
      if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit).map((e) => ({
      ...e,
      icon: SearchIndex.ICONS[e.type] ?? SearchIndex.ICONS.default
    }));
  }

  /* -------------------------------------------- */
  /*  Full-text index                             */
  /* -------------------------------------------- */

  /**
   * Kick off (or reuse) the lazy full-text build.
   * @returns {Promise<void>}
   */
  buildTextIndex() {
    this.#textBuildPromise ??= this.#buildTextIndex();
    return this.#textBuildPromise;
  }

  async #buildTextIndex() {
    const entries = [];
    const parser = new DOMParser();

    const indexJournal = (journal, sourceLabel) => {
      for (const page of journal.pages) {
        if (page.type !== "text" || !page.text?.content) continue;
        const doc = parser.parseFromString(page.text.content, "text/html");
        const text = doc.body.textContent.replace(/\s+/g, " ").trim();
        if (!text) continue;
        entries.push({
          uuid: page.uuid,
          name: `${journal.name} · ${page.name}`,
          source: sourceLabel,
          text,
          lower: text.toLowerCase()
        });
      }
    };

    for (const pack of this.journalPacks()) {
      const docs = await pack.getDocuments();
      for (const journal of docs) indexJournal(journal, pack.title);
    }

    if (this.#includeWorldJournals()) {
      for (const journal of game.journal) {
        if (!journal.testUserPermission(game.user, "OBSERVER")) continue;
        indexJournal(journal, game.i18n.localize("PF2ERB.World"));
      }
    }

    this.#textEntries = entries;
  }

  /**
   * Full-text search. Returns null when the index has not been built yet.
   * @returns {Array<object>|null}
   */
  searchText(query, limit = 20) {
    if (!this.#textEntries) return null;
    const q = query.toLowerCase();
    const results = [];
    for (const e of this.#textEntries) {
      const i = e.lower.indexOf(q);
      if (i === -1) continue;
      const start = Math.max(0, i - 60);
      const end = Math.min(e.text.length, i + q.length + 60);
      results.push({
        uuid: e.uuid,
        name: e.name,
        source: e.source,
        snippet: {
          before: (start > 0 ? "…" : "") + e.text.slice(start, i),
          match: e.text.slice(i, i + q.length),
          after: e.text.slice(i + q.length, end) + (end < e.text.length ? "…" : "")
        }
      });
      if (results.length >= limit) break;
    }
    return results;
  }
}
