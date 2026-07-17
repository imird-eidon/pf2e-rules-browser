/**
 * PF2e Rules Browser
 * Entry point: registers settings, keybindings, the Journal Directory button
 * and exposes a small public API on the module object.
 */
import { MODULE_ID, RulesBrowser } from "./rules-browser.js";
import { sharedSearchIndex } from "./search-index.js";

Hooks.once("init", () => {
  // ------------------------------------------------------------------ Settings
  game.settings.register(MODULE_ID, "includeWorldJournals", {
    name: "PF2ERB.Settings.WorldJournals.Name",
    hint: "PF2ERB.Settings.WorldJournals.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => RulesBrowser.instance?.resetIndex()
  });

  game.settings.register(MODULE_ID, "includeItemPacks", {
    name: "PF2ERB.Settings.ItemPacks.Name",
    hint: "PF2ERB.Settings.ItemPacks.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => RulesBrowser.instance?.resetIndex()
  });

  game.settings.register(MODULE_ID, "rememberSession", {
    name: "PF2ERB.Settings.RememberSession.Name",
    hint: "PF2ERB.Settings.RememberSession.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      if (!value) game.user.unsetFlag(MODULE_ID, "session");
    }
  });

  // ---------------------------------------------------------------- Keybinding
  game.keybindings.register(MODULE_ID, "openBrowser", {
    name: "PF2ERB.Keybind.Open.Name",
    hint: "PF2ERB.Keybind.Open.Hint",
    editable: [{ key: "KeyS", modifiers: ["Control"] }],
    onDown: () => {
      RulesBrowser.open();
      return true;
    }
  });

  // The shortcuts below only act while the browser window is actually open,
  // so they never steal a combo from the rest of Foundry (or the browser
  // itself) when the person isn't using the tool. Ctrl+T/Ctrl+W/Ctrl+F are
  // avoided as defaults since most browsers reserve those at the OS/chrome
  // level and never deliver the keydown to page JS at all; everything here
  // is remappable in Foundry's Controls settings regardless.
  const whenOpen = (action) => (event) => {
    const app = RulesBrowser.instance;
    if (!app?.rendered) return false;
    action(app, event);
    return true;
  };

  game.keybindings.register(MODULE_ID, "commandPalette", {
    name: "PF2ERB.Keybind.Palette.Name",
    hint: "PF2ERB.Keybind.Palette.Hint",
    editable: [{ key: "KeyK", modifiers: ["Control"] }],
    onDown: whenOpen((app) => app.toggleCommandPalette())
  });

  game.keybindings.register(MODULE_ID, "newTab", {
    name: "PF2ERB.Keybind.NewTab.Name",
    hint: "PF2ERB.Keybind.NewTab.Hint",
    editable: [{ key: "KeyT", modifiers: ["Alt"] }],
    onDown: whenOpen((app) => app.quickNewTab())
  });

  game.keybindings.register(MODULE_ID, "closeTab", {
    name: "PF2ERB.Keybind.CloseTab.Name",
    hint: "PF2ERB.Keybind.CloseTab.Hint",
    editable: [{ key: "KeyW", modifiers: ["Alt"] }],
    onDown: whenOpen((app) => app.closeActiveTab())
  });

  game.keybindings.register(MODULE_ID, "historyBack", {
    name: "PF2ERB.Keybind.Back.Name",
    hint: "PF2ERB.Keybind.Back.Hint",
    editable: [{ key: "ArrowLeft", modifiers: ["Alt"] }],
    onDown: whenOpen((app) => app.goBack())
  });

  game.keybindings.register(MODULE_ID, "historyForward", {
    name: "PF2ERB.Keybind.Forward.Name",
    hint: "PF2ERB.Keybind.Forward.Hint",
    editable: [{ key: "ArrowRight", modifiers: ["Alt"] }],
    onDown: whenOpen((app) => app.goForward())
  });

  game.keybindings.register(MODULE_ID, "focusSearch", {
    name: "PF2ERB.Keybind.FocusSearch.Name",
    hint: "PF2ERB.Keybind.FocusSearch.Hint",
    editable: [{ key: "KeyF", modifiers: ["Alt"] }],
    onDown: whenOpen((app) => app.focusSearchBox())
  });
});

Hooks.once("ready", () => {
  // Public API: other modules/macros can call
  //   game.modules.get("pf2e-rules-browser").api.open("Compendium.pf2e....")
  const mod = game.modules.get(MODULE_ID);
  mod.api = {
    open: (uuid = null) => RulesBrowser.open(uuid)
  };

  // Warm the (cheap) name index in the background as soon as the world is
  // ready, so the very first search someone runs — in the sidebar or the
  // command palette — doesn't pay the index-build cost. The full-text index
  // is deliberately left lazy: it loads every journal's content, which is
  // fine on-demand but not worth doing unconditionally on every world load.
  sharedSearchIndex
    .ensureNameIndex()
    .catch((err) => console.warn(`${MODULE_ID} | Failed to warm the name index`, err));

  // "Share with table" chat cards: the button opens the shared document in
  // this client's Rules Browser. Delegated on the body so it works in the
  // sidebar chat log and in popped-out chat windows alike.
  document.body.addEventListener("click", (event) => {
    const button = event.target.closest(".pf2erb-open-link");
    if (!button?.dataset.uuid) return;
    event.preventDefault();
    event.stopPropagation();
    RulesBrowser.open(button.dataset.uuid);
  });
});

/**
 * Add an "open browser" button to the Journal sidebar directory.
 * In V13+ the directory is an ApplicationV2, so the hook provides an HTMLElement.
 */
Hooks.on("renderJournalDirectory", (_app, element) => {
  const el = element instanceof HTMLElement ? element : element?.[0];
  if (!el || el.querySelector(".pf2erb-open")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pf2erb-open";
  button.innerHTML = `<i class="fa-solid fa-book-open-reader"></i> ${game.i18n.localize("PF2ERB.OpenButton")}`;
  button.addEventListener("click", () => RulesBrowser.open());

  const header =
    el.querySelector(".header-actions") ??
    el.querySelector(".directory-header") ??
    el;
  header.append(button);
});
