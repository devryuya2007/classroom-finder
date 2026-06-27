import nodeTest from "node:test";
import assert from "node:assert/strict";
import { createTopbar } from "../src/modules/content/ui/topbar.js";
import { TOPBAR_INPUT } from "../src/modules/content/constants.js";

const test = globalThis.test ?? nodeTest;

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this.id = "";
    this.type = "";
    this.title = "";
    this.placeholder = "";
    this.autocapitalize = "";
    this.autocomplete = "";
    this.spellcheck = true;
    this.disabled = false;
    this.textContent = "";
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") {
      this.id = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  prepend(child) {
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  focus() {
    this.ownerDocument.activeElement = this;
    for (const listener of this.listeners.get("focus") ?? []) {
      listener({ target: this });
    }
  }

  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }

  contains(target) {
    if (target === this) return true;
    return this.children.some((child) => child.contains?.(target));
  }

  querySelector(selector) {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.find((node) => node.classList?.contains(className));
    }
    return null;
  }

  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find?.(predicate);
      if (found) return found;
    }
    return null;
  }
}

function createFakeDocument() {
  const document = {
    activeElement: null,
    listeners: new Map(),
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    createElementNS(_namespace, tagName) {
      return new FakeElement(tagName, document);
    },
    addEventListener(type, listener) {
      const listeners = document.listeners.get(type) ?? [];
      listeners.push(listener);
      document.listeners.set(type, listeners);
    },
    querySelector(selector) {
      return document.body.querySelector(selector);
    },
    getElementById(id) {
      return document.body.find((node) => node.id === id);
    },
  };
  document.body = new FakeElement("body", document);
  document.head = new FakeElement("head", document);
  document.activeElement = document.body;
  return document;
}

test("トップバー生成時に検索欄へ自動フォーカスしない", () => {
  const previousDocument = globalThis.document;
  const fakeDocument = createFakeDocument();
  globalThis.document = fakeDocument;

  try {
    const existingFocusTarget = fakeDocument.createElement("button");
    fakeDocument.body.appendChild(existingFocusTarget);
    fakeDocument.activeElement = existingFocusTarget;

    const topbar = createTopbar({});
    fakeDocument.body.appendChild(topbar);

    const input = topbar.querySelector(`.${TOPBAR_INPUT}`);
    assert.ok(input, "検索 input が生成されること");
    assert.equal(fakeDocument.activeElement, existingFocusTarget);
    assert.notEqual(fakeDocument.activeElement, input);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("リロードボタンには設定用の円形メニュー入口が付く", () => {
  const previousDocument = globalThis.document;
  const fakeDocument = createFakeDocument();
  globalThis.document = fakeDocument;

  try {
    const topbar = createTopbar({});
    fakeDocument.body.appendChild(topbar);

    const actionWrap = topbar.querySelector(".gcx-refresh-action-wrap");
    const refreshButton = topbar.querySelector(".gcx-refresh-btn");
    const radialMenu = topbar.querySelector(".gcx-radial-menu");
    const radialSurface = topbar.querySelector(".gcx-radial-surface");
    const hoverBridge = topbar.querySelector(".gcx-radial-hover-bridge");
    const settingsButton = topbar.querySelector(".gcx-radial-settings");
    const emptySlot = topbar.querySelector(".gcx-radial-empty-slot");
    const settingsPanel = topbar.querySelector(".gcx-settings-panel");

    assert.ok(actionWrap, "リロード操作用のラッパーが生成されること");
    assert.ok(refreshButton, "既存のリロードボタンが残ること");
    assert.ok(hoverBridge, "円形メニューへ移動するためのホバー範囲が生成されること");
    assert.ok(radialMenu, "円形メニューが生成されること");
    assert.ok(radialSurface, "円環メニューの背景が生成されること");
    assert.ok(emptySlot, "未使用アイコン枠が生成されること");
    assert.ok(settingsButton, "設定ボタンが生成されること");
    assert.ok(settingsPanel, "設定パネルが生成されること");
    assert.equal(settingsButton.getAttribute("aria-label"), "設定を開く");
    assert.equal(radialMenu.getAttribute("aria-hidden"), "true");
  } finally {
    globalThis.document = previousDocument;
  }
});
