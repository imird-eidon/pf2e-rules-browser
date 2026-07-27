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

    // Item packs: names plus the lightweight fields the advanced search
    // facets need. These all come from the pack index (cheap) rather than
    // loading full documents.
    for (const pack of this.itemPacks()) {
      const index = await pack.getIndex({
        fields: [
          "system.traits.value",
          "system.traits.rarity",
          "system.level.value",
          "system.publication.title",
          "system.source.value"
        ]
      });
      for (const e of index) {
        entries.push({
          name: e.name,
          uuid: e.uuid,
          type: e.type ?? "item",
          source: pack.title,
          isItem: true,
          traits: e.system?.traits?.value ?? [],
          rarity: e.system?.traits?.rarity ?? null,
          level: typeof e.system?.level?.value === "number" ? e.system.level.value : null,
          // Publication field names have shifted across PF2e versions
          // (system.source.value → system.publication.title), so try both.
          publication: e.system?.publication?.title || e.system?.source?.value || null
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
  /*  Advanced (faceted) search                   */
  /* -------------------------------------------- */

  /** Every indexed Item entry (advanced search is Item-only: journal pages
   *  carry no traits/level/rarity, so they can't be faceted). */
  async itemEntries() {
    await this.ensureNameIndex();
    return this.#nameEntries.filter((e) => e.isItem);
  }

  /**
   * Faceted search across every indexed item.
   * @param {object} criteria
   * @param {string} [criteria.text]      substring match on name
   * @param {string[]} [criteria.traits]  ALL of these must be present
   * @param {string} [criteria.type]      item type (feat, spell, action…)
   * @param {number|null} [criteria.levelMin]
   * @param {number|null} [criteria.levelMax]
   * @param {string} [criteria.rarity]
   * @param {string} [criteria.publication]
   * @param {string} [criteria.sort]      "name" | "level"
   * @param {number} [criteria.limit]
   */
  async searchAdvanced(criteria = {}) {
    const {
      text = "",
      traits = [],
      type = "",
      levelMin = null,
      levelMax = null,
      rarity = "",
      publication = "",
      sort = "name",
      limit = 300
    } = criteria;

    const query = text.trim().toLowerCase();
    const all = await this.itemEntries();

    const matches = all.filter((e) => {
      if (query && !e.name.toLowerCase().includes(query)) return false;
      if (traits.length && !traits.every((t) => e.traits.includes(t))) return false;
      if (type && e.type !== type) return false;
      if (rarity && e.rarity !== rarity) return false;
      if (publication && e.publication !== publication) return false;
      if (levelMin !== null && (e.level === null || e.level < levelMin)) return false;
      if (levelMax !== null && (e.level === null || e.level > levelMax)) return false;
      return true;
    });

    matches.sort((a, b) => {
      if (sort === "level") {
        // Null levels (many actions/conditions) sort last rather than as 0.
        const al = a.level ?? Number.POSITIVE_INFINITY;
        const bl = b.level ?? Number.POSITIVE_INFINITY;
        if (al !== bl) return al - bl;
      }
      return a.name.localeCompare(b.name, game.i18n.lang);
    });

    return { total: matches.length, results: matches.slice(0, limit), limit };
  }

  /** Distinct values present across indexed items, for building the facets.
   *  Only what actually exists gets offered, so no dead options. */
  async facetOptions() {
    const all = await this.itemEntries();
    const traits = new Set();
    const types = new Set();
    const rarities = new Set();
    const publications = new Set();

    for (const e of all) {
      for (const t of e.traits) traits.add(t);
      if (e.type) types.add(e.type);
      if (e.rarity) rarities.add(e.rarity);
      if (e.publication) publications.add(e.publication);
    }
    return { traits: [...traits], types: [...types], rarities: [...rarities], publications: [...publications] };
  }


  /* -------------------------------------------- */
  /*  Full-text index                             */
  /* -------------------------------------------- */

  /**
   * Kick off (or reuse) the lazy full-text build.
   * @param {(step: number, total: number) => void} [onProgress] - called
   *   after each journal pack (and the world-journals batch, if included)
   *   finishes loading. Only the caller of the *first* build gets progress
   *   ticks — later callers while a build is already in flight share the
   *   same promise without a callback attached.
   * @returns {Promise<void>}
   */
  buildTextIndex(onProgress) {
    this.#textBuildPromise ??= this.#buildTextIndex(onProgress);
    return this.#textBuildPromise;
  }

  async #buildTextIndex(onProgress) {
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

    const packs = this.journalPacks();
    const includeWorld = this.#includeWorldJournals();
    const total = packs.length + (includeWorld ? 1 : 0) || 1;
    let step = 0;

    for (const pack of packs) {
      const docs = await pack.getDocuments();
      for (const journal of docs) indexJournal(journal, pack.title);
      onProgress?.(++step, total);
    }

    if (includeWorld) {
      for (const journal of game.journal) {
        if (!journal.testUserPermission(game.user, "OBSERVER")) continue;
        indexJournal(journal, game.i18n.localize("PF2ERB.World"));
      }
      onProgress?.(++step, total);
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

/**
 * A single shared SearchIndex, reused by RulesBrowser and by module.js's
 * "ready" hook. Having it live outside the RulesBrowser class means the name
 * index can be warmed up in the background as soon as Foundry finishes
 * loading, well before the person ever opens the browser window.
 */
export const sharedSearchIndex = new SearchIndex();
