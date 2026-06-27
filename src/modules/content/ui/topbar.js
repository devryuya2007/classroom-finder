// Topbar UI component for search interface

import { gsap } from "gsap";
import { gcxConsole } from "../../shared/utils.js";
import {
  TOPBAR_WRAP,
  TOPBAR_INPUT,
  TOPBAR_ID,
  EXPANDED_CLASS,
  SVG_NS,
  ICON_PATH_DATA,
  RELOAD_ICON_PATH_DATA,
  SETTINGS_ICON_PATH_DATA,
  ERROR_ICON_PATHS,
  ERROR_ICON_COLOR,
  PLACEHOLDER_DEFAULT,
  STYLE_ID,
  STYLE_PATH,
} from "../constants.js";
import { getExtensionURL } from "../utils.js";

export let topbarInput = null;
const RADIAL_MENU_HOVER_DELAY_MS = 1000;

function applyMotionStyle(element, state) {
  if (!element?.style) return;
  const x = Number.isFinite(state.x) ? state.x : 0;
  const y = Number.isFinite(state.y) ? state.y : 0;
  const scale = Number.isFinite(state.scale) ? state.scale : 1;
  const opacity = Number.isFinite(state.opacity) ? state.opacity : 1;
  element.style.opacity = String(opacity);
  element.style.visibility = opacity <= 0 ? "hidden" : "visible";
  element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function createMotionState(element, initialState) {
  const state = {
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    ...initialState,
  };
  applyMotionStyle(element, state);
  return state;
}

function animateMotion(element, state, nextState) {
  gsap.to(state, {
    ...nextState,
    onUpdate: () => applyMotionStyle(element, state),
  });
}

export function ensureStyles() {
  try {
    const href = getExtensionURL(STYLE_PATH);
    const existing = document.getElementById(STYLE_ID);
    if (existing) {
      const current =
        existing instanceof HTMLLinkElement
          ? existing.getAttribute("href")
          : existing instanceof HTMLStyleElement
            ? existing.dataset.origin
            : null;
      if (current === href) return;
      existing.remove();
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.origin = href;
    style.textContent = "/* [GCX] topbar styles loading... */";
    document.head.appendChild(style);

    fetch(href)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then((css) => {
        style.textContent = css;
      })
      .catch((error) => {
        gcxConsole.debug("[GCX] Stylesheet load failed (non-critical):", error.message || error);
      });
  } catch {
    gcxConsole.debug("[GCX] Cannot load styles (non-critical), UI will still work");
  }
}

export function setTopbarPlaceholder(text) {
  if (!topbarInput) {
    topbarInput = document.querySelector(`.${TOPBAR_INPUT}`);
  }
  if (topbarInput) {
    topbarInput.placeholder = text;
    if (text === "同期に失敗しました") {
      topbarInput.classList.add("is-error");
    } else {
      topbarInput.classList.remove("is-error");
    }
  }
}

function ensureSVG() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("icon-svg");
  svg.setAttribute("viewBox", "0 0 512 512");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");

  ICON_PATH_DATA.forEach((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
  });

  return svg;
}

function ensureReloadSVG() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("icon-svg", "reload-icon");
  svg.setAttribute("viewBox", "0 0 512 512");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", RELOAD_ICON_PATH_DATA);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function ensureSettingsSVG() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("icon-svg", "settings-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", SETTINGS_ICON_PATH_DATA);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function ensureErrorSVG() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("error-icon-svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  ERROR_ICON_PATHS.forEach((d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", ERROR_ICON_COLOR);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });
  return svg;
}

function closeSettingsPanel(panel) {
  if (!panel || panel.hidden) return;
  const state = createMotionState(panel, { opacity: 1, y: 0, scale: 1 });
  animateMotion(panel, state, {
    opacity: 0,
    y: -6,
    scale: 0.98,
    duration: 0.16,
    ease: "power2.in",
    onComplete: () => {
      panel.hidden = true;
    },
  });
}

function openSettingsPanel(panel) {
  if (!panel) return;
  panel.hidden = false;
  const state = createMotionState(panel, { opacity: 0, y: -8, scale: 0.98 });
  animateMotion(panel, state, {
    opacity: 1,
    y: 0,
    scale: 1,
    duration: 0.24,
    ease: "back.out(1.4)",
  });
}

function createSettingsPanel() {
  const panel = document.createElement("section");
  panel.classList.add("gcx-settings-panel");
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Classroom Finder 設定");

  const header = document.createElement("div");
  header.classList.add("gcx-settings-header");

  const title = document.createElement("strong");
  title.textContent = "設定";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.classList.add("gcx-settings-close");
  closeButton.setAttribute("aria-label", "設定を閉じる");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => closeSettingsPanel(panel));

  header.append(title, closeButton);

  const userSection = document.createElement("div");
  userSection.classList.add("gcx-settings-section");
  userSection.innerHTML = `
    <span class="gcx-settings-kicker">User</span>
    <p>アカウントごとのClassroom API認証をここから管理します。</p>
  `;

  const developerSection = document.createElement("div");
  developerSection.classList.add("gcx-settings-section");
  developerSection.innerHTML = `
    <span class="gcx-settings-kicker">Developer</span>
    <p>同期状態や認証状態の確認項目をここに追加します。</p>
  `;

  panel.append(header, userSection, developerSection);
  return panel;
}

function createRefreshActionMenu(refreshBtn) {
  const actionWrap = document.createElement("div");
  actionWrap.classList.add("gcx-refresh-action-wrap");

  const hoverBridge = document.createElement("div");
  hoverBridge.classList.add("gcx-radial-hover-bridge");

  const radialMenu = document.createElement("div");
  radialMenu.classList.add("gcx-radial-menu");
  radialMenu.setAttribute("aria-hidden", "true");

  const radialSurface = document.createElement("div");
  radialSurface.classList.add("gcx-radial-surface");

  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.classList.add("gcx-radial-action", "gcx-radial-settings");
  settingsButton.title = "設定";
  settingsButton.setAttribute("aria-label", "設定を開く");
  settingsButton.appendChild(ensureSettingsSVG());

  for (let i = 0; i < 2; i += 1) {
    const emptySlot = document.createElement("span");
    emptySlot.classList.add("gcx-radial-empty-slot", `gcx-radial-slot-${i + 1}`);
    emptySlot.setAttribute("aria-hidden", "true");
    radialSurface.appendChild(emptySlot);
  }
  radialSurface.appendChild(settingsButton);

  const settingsPanel = createSettingsPanel();
  radialMenu.appendChild(radialSurface);
  actionWrap.append(refreshBtn, hoverBridge, radialMenu, settingsPanel);

  let hoverTimerId = null;
  let closeTimerId = null;
  let isMenuOpen = false;
  const menuMotion = createMotionState(radialMenu, { opacity: 0, scale: 0.7 });
  const settingsMotion = createMotionState(settingsButton, {
    opacity: 0,
    x: 0,
    y: 0,
    scale: 0.65,
  });

  const openMenu = () => {
    if (isMenuOpen) return;
    isMenuOpen = true;
    actionWrap.classList.add("is-radial-open");
    radialMenu.setAttribute("aria-hidden", "false");
    animateMotion(radialMenu, menuMotion, {
      opacity: 1,
      scale: 1,
      duration: 0.18,
      ease: "power2.out",
    });
    animateMotion(settingsButton, settingsMotion, {
      opacity: 1,
      x: -12,
      y: -46,
      scale: 1,
      duration: 0.32,
      ease: "back.out(1.7)",
    });
  };

  const closeMenu = () => {
    if (hoverTimerId) {
      clearTimeout(hoverTimerId);
      hoverTimerId = null;
    }
    if (closeTimerId) {
      clearTimeout(closeTimerId);
      closeTimerId = null;
    }
    if (!isMenuOpen || !settingsPanel.hidden) return;
    isMenuOpen = false;
    actionWrap.classList.remove("is-radial-open");
    radialMenu.setAttribute("aria-hidden", "true");
    animateMotion(settingsButton, settingsMotion, {
      opacity: 0,
      x: 0,
      y: 0,
      scale: 0.65,
      duration: 0.18,
      ease: "power2.in",
    });
    animateMotion(radialMenu, menuMotion, {
      opacity: 0,
      scale: 0.7,
      duration: 0.18,
      ease: "power2.in",
    });
  };

  const scheduleCloseMenu = () => {
    if (hoverTimerId) {
      clearTimeout(hoverTimerId);
      hoverTimerId = null;
    }
    if (closeTimerId) clearTimeout(closeTimerId);
    closeTimerId = window.setTimeout(closeMenu, 180);
  };

  actionWrap.addEventListener("pointerenter", () => {
    if (hoverTimerId) clearTimeout(hoverTimerId);
    if (closeTimerId) {
      clearTimeout(closeTimerId);
      closeTimerId = null;
    }
    hoverTimerId = window.setTimeout(openMenu, RADIAL_MENU_HOVER_DELAY_MS);
  });
  actionWrap.addEventListener("pointerleave", scheduleCloseMenu);
  actionWrap.addEventListener("focusin", openMenu);
  actionWrap.addEventListener("focusout", (event) => {
    if (event.relatedTarget && actionWrap.contains(event.relatedTarget)) {
      return;
    }
    closeSettingsPanel(settingsPanel);
    closeMenu();
  });
  actionWrap.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsPanel(settingsPanel);
      closeMenu();
    }
  });

  settingsButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openSettingsPanel(settingsPanel);
  });

  return actionWrap;
}

function ensureSuggestionsStructure(container) {
  if (!container) return null;
  let wrap = container.querySelector(".suggestions-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.classList.add("suggestions-wrap");
    container.appendChild(wrap);
  }
  let list = wrap.querySelector("ul");
  if (!list) {
    list = document.createElement("ul");
    list.classList.add("suggestions-ul");
    wrap.appendChild(list);
  }
  return list;
}

function clearSuggestions(container) {
  if (!container) return;
  container.classList.remove("has-results");
  const list = container.querySelector(".suggestions-ul");
  if (list) {
    list.replaceChildren();
  }
}

export class TopbarFocusController {
  constructor(wrapElement, inputElement, suggestionsElement) {
    this.wrap = wrapElement;
    this.input = inputElement;
    this.suggestions = suggestionsElement;
  }

  open() {
    this.wrap.classList.add(EXPANDED_CLASS);
  }

  close(options = {}) {
    this.wrap.classList.remove(EXPANDED_CLASS);
    clearSuggestions(this.suggestions);
    if (options.blur && this.input === document.activeElement) {
      this.input.blur();
    }
  }

  handleFocusOut(event) {
    const nextTarget = event.relatedTarget;
    if (nextTarget && this.wrap.contains(nextTarget)) {
      return;
    }

    const active = document.activeElement;
    if (active && this.wrap.contains(active)) {
      return;
    }

    this.close();
  }
}

export function createTopbar(handlers) {
  const wrap = document.createElement("div");
  wrap.classList.add(TOPBAR_WRAP);
  wrap.setAttribute("role", "search");
  wrap.setAttribute("aria-label", "クイック検索");
  const icon = ensureSVG();

  const field = document.createElement("div");
  field.classList.add("svg-input-wrap");

  const input = document.createElement("input");
  input.type = "search";
  input.classList.add(TOPBAR_INPUT);
  input.placeholder = PLACEHOLDER_DEFAULT;
  input.setAttribute("role", "searchbox");
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;
  topbarInput = input;

  const stop = (e) => e.stopPropagation();
  [
    "click",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "touchmove",
    "keydown",
    "keypress",
    "keyup",
  ].forEach((t) => input.addEventListener(t, stop, { passive: true }));

  const suggestions = document.createElement("div");
  suggestions.classList.add("gcx-suggestions");
  suggestions.setAttribute("aria-live", "polite");
  ensureSuggestionsStructure(suggestions);

  const focusController = new TopbarFocusController(wrap, input, suggestions);
  input.addEventListener("focus", () => {
    focusController.open();

    const value = input.value.trim();
    if (value && handlers.onInputFocus) {
      handlers.onInputFocus(value);
    }
  });
  wrap.addEventListener(
    "focusout",
    (event) => {
      focusController.handleFocusOut(event);
    },
    true,
  );
  input.addEventListener("input", (e) => {
    if (handlers.onSearchInput) {
      handlers.onSearchInput(e);
    }
  });

  const handleOutsidePointerDown = (event) => {
    if (!wrap.contains(event.target)) {
      focusController.close({ blur: true });
    }
  };
  document.addEventListener("pointerdown", handleOutsidePointerDown, true);

  field.appendChild(icon);
  field.appendChild(input);
  field.appendChild(suggestions);
  wrap.appendChild(field);

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.classList.add("gcx-refresh-btn");
  refreshBtn.title = "新規投稿を同期";
  refreshBtn.setAttribute("aria-label", "更新");
  refreshBtn.prepend(ensureReloadSVG());
  const errorTag = document.createElement("span");
  errorTag.classList.add("error-tag");
  errorTag.appendChild(ensureErrorSVG());
  errorTag.setAttribute("aria-hidden", "true");
  refreshBtn.append(errorTag);
  [
    "click",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "keydown",
    "keyup",
  ].forEach((t) => refreshBtn.addEventListener(t, stop, { passive: true }));

  refreshBtn.addEventListener("click", async () => {
    if (handlers.onRefreshClick) {
      try {
        refreshBtn.disabled = true;
        refreshBtn.classList.add("is-spinning");
        await handlers.onRefreshClick();
      } catch (err) {
        gcxConsole.warn("[GCX] manual sync failed", err);
        if (handlers.flashRefreshError) {
          handlers.flashRefreshError(err);
        }
      } finally {
        refreshBtn.classList.remove("is-spinning");
        refreshBtn.disabled = false;
      }
    }
  });

  if (suggestions.parentNode === field) {
    field.removeChild(suggestions);
  }
  field.appendChild(createRefreshActionMenu(refreshBtn));
  field.appendChild(suggestions);

  return wrap;
}

export function ensureTopbar(handlers) {
  ensureStyles();
  if (!document.body) return null;

  let topbar = document.getElementById(TOPBAR_ID);
  if (!topbar) {
    topbar = createTopbar(handlers);
    topbar.id = TOPBAR_ID;
    document.body.appendChild(topbar);
  }
  return topbar;
}
