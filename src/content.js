// Google Classroom のトップバーへ「クイック検索」UIを挿入するスクリプト
// - ネットワーク通信は行わず、DOM 監視で UI を差し込むだけ
// - スタイルは外部 CSS を <link> で一度だけ注入（UI 本体は後段で生成）
// - 検索アイコンはインライン SVG 要素で描画（CSS 変数で色変更可）

const { createElement } = require("react");

// ここから定数定義とスタイル注入ヘルパー
const STYLE_ID = "gcx-sarch-style"; // 注入する <link> の id（重複防止）
const STYLE_PATH = "src/gcx-topbar.css"; // 読み込むスタイルシートのパス
const TOPBAR_WRAP = "gcx-topbar"; // 検索 UI ラッパーのクラス
const TOPBAR_INPUT = "gcx-topbar-input"; // 検索入力のクラス
const TOPBAR_ID = "gcx-topbar-overlay"; // DOM 上の ID（重複防止）
const EXPANDED_CLASS = "is-expanded";
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATH_DATA = [
  "M172.625,102.4c-42.674,0-77.392,34.739-77.392,77.438c0,5.932,4.806,10.74,10.733,10.74c5.928,0,10.733-4.808,10.733-10.74c0-30.856,25.088-55.959,55.926-55.959c5.928,0,10.733-4.808,10.733-10.74C183.358,107.208,178.553,102.4,172.625,102.4z",
  "M361.657,301.511c19.402-30.436,30.645-66.546,30.645-105.244C392.302,88.036,304.318,0,196.151,0c-38.676,0-74.765,11.25-105.182,30.663C66.734,46.123,46.11,66.759,30.659,91.008C11.257,121.444,0,157.568,0,196.267c0,108.217,87.998,196.266,196.151,196.266c38.676,0,74.779-11.264,105.197-30.677C325.582,346.396,346.206,325.76,361.657,301.511z M259.758,320.242c-19.075,9.842-40.708,15.403-63.607,15.403c-76.797,0-139.296-62.535-139.296-139.378c0-22.912,5.558-44.558,15.394-63.644c13.318-25.856,34.483-47.019,60.323-60.331c19.075-9.842,40.694-15.403,63.578-15.403c76.812,0,139.296,62.521,139.296,139.378c0,22.898-5.558,44.53-15.394,63.616C306.749,285.739,285.598,306.916,259.758,320.242z",
  "M499.516,439.154L386.275,326.13c-16.119,23.552-36.771,44.202-60.309,60.345l113.241,113.024c8.329,8.334,19.246,12.501,30.148,12.501c10.916,0,21.833-4.167,30.162-12.501C516.161,482.83,516.161,455.822,499.516,439.154z",
];

// Classroom DOM ラベル備忘録（安定属性のみ）
// data-stream-item-id → ストリーム投稿ごとのユニーク ID
// data-actor-name / data-entity-name → 投稿者（教師）の表示名
// role="heading" + aria-level="2" → 投稿ヘッダー見出し（氏名と時刻が含まれる）
// time[datetime][data-timestamp] → 投稿日時（ISO 文字列と UNIX ミリ秒）
// data-stream-post-body → 投稿本文テキストを含むコンテナ
// data-material-parent-id → 添付資料一覧のルート（投稿 ID と紐付く）
// data-attachment-type → 添付アイテムの種類（driveFile, form など）
// data-drive-id → Google ドライブ添付のファイル ID
// aria-label / aria-labelledby → 代替テキストやタイトルの参照
// role="link" / a[href] → 添付アイテムへのリンク本体

/*imgタグは先生のアイコン画像
  h2タグに先生の名前　投稿：　〇〇　さん　のフォーマット
  jsmodel="N2jS6b hGbFme BrMJ0e" data-material-parent-id="N2jS6b"data-stream-item-id="807074161069"PDFのラベル
*/

// - メイン領域: div[role="main"]（SPA でも維持されるロール属性）
// - コース一覧ラッパー: div[role="main"] 内の ol[jsname="bN97Pc"] （class="JwPp0e avfKs" はハッシュ化）
// - 各コースカード: li[data-course-id][data-user-id] （class="gHz6xd…" はハッシュ化、data-* は安定）
//     * 本体ブロック: div.Tc9hUd.CNpREd.ee1HBc（クラス名は参考メモ：変化しやすい）
//     * タイトル: div.ScpeUc.Vu2fZd.XwD7Ke → テキスト（例: 体育　３－１・M）
//     * 担当者: div.z07MGc.Vu2fZd.jJIbcc.T30lh → 教員名
//     * 最新通知: div.xo2x2e > span.Y5vSD / span.nforOe
// - カード内ショートカット（課題・ドライブなど）: div.SZ0kZe 以下の div.ne2Ple-oshW8e-V67aGc

// 注意: ensureStyles は CSS を注入するだけ。検索 UI 本体は createTopbar()/injectTopbar() で生成・挿入。
function ensureStyles() {
  const href = getExtensionURL(STYLE_PATH);
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    const current = existing.getAttribute("href");
    if (existing.tagName === "LINK" && current === href) {
      return;
    }
    existing.remove();
  }

  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = href;
  link.addEventListener("error", () => {
    console.warn(`[GCX] Failed to load stylesheet from ${href}`);
  });
  document.head.appendChild(link);
}

//取得してオブジェクトにして返す。
function extractStreamData(root = document) {
  const entries = collectStreamElements(root);
  return entries.map(({ index, streamId, element }) => {
    const header =
      element.querySelector('[role="heading"][aria-level="2"]') || element;

    const actorSource = header.querySelector(
      "[data-actor-name], [data-entity-name]"
    );
    const actorText =
      normalizeWhitespace(actorSource?.textContent) ||
      normalizeWhitespace(header.textContent);

    const timeEl = header.querySelector("time[datetime], [data-timestamp]");
    const postedAt = {
      text: normalizeWhitespace(timeEl?.textContent),
      datetime:
        timeEl?.getAttribute?.("datetime") ||
        timeEl?.getAttribute?.("data-timestamp") ||
        "",
    };
    const bodySource =
      element.querySelector("[data-stream-post-body]") ||
      element.querySelector('[jsname="r4nke"]');
    const bodyText = normalizeWhitespace(bodySource?.textContent || "");

    const attachmentNodes = element.querySelectorAll(
      '[data-material-parent-id] [data-attachment-type], [data-material-parent-id] [role="link"], [data-material-parent-id] a[href]'
    );

    const attachments = [...attachmentNodes].map((att) => {
      const linkElement = att.matches('[role="link"], a[href]')
        ? att
        : att.querySelector('[role="link"], a[href]');
      const type =
        att.getAttribute("data-attachment-type") ||
        linkElement?.getAttribute("data-attachment-type") ||
        "";
      const driveId =
        att.getAttribute("data-drive-id") ||
        linkElement?.getAttribute("data-drive-id") ||
        "";
      const href = linkElement?.getAttribute("href") || "";
      const title = normalizeWhitespace(
        linkElement?.getAttribute("aria-label") ||
          linkElement?.textContent ||
          ""
      );
      return { type, driveId, href, title };
    });

    return {
      index,
      streamId,
      teacherName: actorText,
      postedAt,
      body: bodyText,
      attachments,
    };
  });
}
//文字列化し、半角スペースに統一して返す
function normalizeWhitespace(value) {
  if (value == null) return "";
  return String(value)
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}
//extractStreamDataからindex streamId + elementを返す（配列 > オブジェ。）
function collectStreamElements(root = document) {
  const elements = [...(root?.querySelectorAll("[data-stream-item-id]") || [])];
  return elements.map((element, index) => ({
    index: index + 1,
    streamId: element.dataset.streamItemId || "",
    element,
  }));
}

const STREAM_DB_NAME = "gcx-stream";
const STREAM_DB_VERSION = 1;
const STREAM_STORE_NAME = "posts";

// streamIdを主としてopen
function openStreamDB() {
  const request = indexedDB.open(STREAM_DB_NAME, STREAM_DB_VERSION);
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STREAM_STORE_NAME)) {
      db.createObjectStore(STREAM_STORE_NAME, { keyPath: "streamId" });
    }
  };
  return request;
}
// openしたstoreにextractStreamData()をそのまま追加
async function persistStreamData(root = document) {
  const posts = extractStreamData(root);
  const request = openStreamDB();

  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; //TODO:event.target.result;にリファクタしろ
      const tx = db.transaction(STREAM_STORE_NAME, "readwrite");
      const store = tx.objectStore(STREAM_STORE_NAME);
      const savedAt = Date.now();
      for (const post of posts) {
        store.put({ ...post, savedAt });
      }
      tx.oncomplete = () => {
        db.close();
        resolve({ stored: posts.length, posts });
      };
      tx.onerror = () => {
        reject(tx.error || new Error("IndexedDB transaction failed"));
        db.close();
      };
      tx.onabort = () => {
        reject(new Error("Transaction aborted"));
        db.close();
        console.log(
          "A transaction is aborted for reasons other than an error."
        );
      };
    };
  });
}

// DBの中身を取得
async function loadStreamPostsFromDb() {
  return new Promise((resolve, reject) => {
    const request = openStreamDB();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STREAM_STORE_NAME, "readonly");
      const store = tx.objectStore(STREAM_STORE_NAME);
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        resolve(getAll.result || []);
        db.close();
      };
      getAll.onerror = () => {
        reject(getAll.error);
        db.close();
      };
    };
  });
}

// ２つのオブジェが違うかどうか、違うならtrue
function diffPosts(oldList, newList) {
  if (oldList.length !== newList.length) return true;
  const map = new Map(oldList.map((p) => [p.streamId, JSON.stringify(p)]));
  return newList.some((p) => map.get(p.streamId) !== JSON.stringify(p));
}

let syncInFlight = false;

//非同期でloadStreamPostsFromDbとextractStreamDataを比べる。
async function syncStreamPosts(root = document) {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const [savedPosts, currentPosts] = await Promise.all([
      loadStreamPostsFromDb(),
      Promise.resolve(extractStreamData(root)),
    ]);
    if (diffPosts(savedPosts, currentPosts)) {
      await persistStreamData(root);
    }
  } finally {
    syncInFlight = false;
  }
}

// 後方互換用の別名（古いコードが小文字関数名を呼ぶ場合のため）
const ensurestyle = ensureStyles;

// ===== ローカル配布ライブラリ ローダー =====
const LIB_SPECS = {
  fuse: {
    marker: "Fuse", // 名札（<script data-gcx-lib="Fuse">）重複注入の識別に使用
    sources: ["src/libs/fuse.min.js"],
  },
  idb: {
    marker: "idb",
    sources: ["src/libs/idb.min.js"],
  },
  hotkeys: {
    marker: "hotkeys",
    sources: ["src/libs/hotkeys.min.js"],
  },
};

function getExtensionURL(relativePath) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(relativePath);
    }
  } catch {
    // no-op: Firefox などの互換 API へフォールバック
  }
  if (typeof browser !== "undefined" && browser.runtime?.getURL) {
    return browser.runtime.getURL(relativePath);
  }
  return relativePath;
}

function addScript(src, attrs = {}) {
  // 動的に <script> を生成して読み込む
  // - src: URL 文字列（相対/絶対）
  // - attrs: { 属性名: 値 } のプレーンオブジェクト（data-* 等を想定）
  // - 成功(load): 実行完了後に src で resolve
  // - 失敗(error): エラーで reject
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true; // 動的挿入の既定。順序保証はしないため依存順は呼び出し側で await 直列化する。
    // 属性は data-* を中心に明示付与（重複注入の検知や CORS 制御に利用）
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null) s.setAttribute(k, v); // 値は文字列化される。ブール属性は presence 管理が必要な場合あり。
    }
    s.addEventListener("load", () => resolve(src));
    s.addEventListener("error", () => reject(new Error(`Failed: ${src}`)));
    document.head.appendChild(s);
  });
}
// 既に同じ名札(data-gcx-lib)の <script> が head にあるか

function alreadyInjected(marker) {
  return !!document.head.querySelector(`script[data-gcx-lib="${marker}"]`);
}

// 指定ライブラリを拡張パッケージから読み込む（開発・本番共通）
// 戻り値: Promise<boolean>（成功 true / 全候補失敗 false）
// 手順:
//  1) 定義がない場合は false
//  2) 既に注入済みなら true
//  3) 候補 URL を順に直列で試す（最初に成功した時点で終了）
//  4) 結果を CustomEvent "gcx:libs-loaded" で通知
async function injectLib(name) {
  const spec = LIB_SPECS[name];
  if (!spec) return false;
  if (alreadyInjected(spec.marker)) return true;
  let lastErr; // 直近の失敗（全滅時のイベント detail 用）
  for (const relative of spec.sources) {
    const url = getExtensionURL(relative);
    try {
      await addScript(url, { "data-gcx-lib": spec.marker });
      const detail = {
        name,
        success: true,
        message: "",
        source: url,
      };
      window.dispatchEvent(new CustomEvent("gcx:libs-loaded", { detail }));
      return true;
    } catch (err) {
      lastErr = err;
    }
  }

  const detail = {
    name,
    success: false,
    message: String(lastErr || ""),
    source: LIB_SPECS[name]?.sources.at(-1) || "",
  };
  window.dispatchEvent(new CustomEvent("gcx:libs-loaded", { detail }));
  return false;
}

// ローカルバンドルをまとめて読み込む
async function loadLocalLibs() {
  try {
    const names = Object.keys(LIB_SPECS);
    const results = await Promise.all(names.map((name) => injectLib(name)));
    return results.every(Boolean);
  } catch {
    return false;
  }
}

// メニュー側への注入は削除し、トップバー専用に単純化

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
// containerにulがなかったらulをcontainerにappend
function ensureSuggestionsStructure(container) {
  if (!container) return null;
  let list = container.querySelector("ul");
  if (!list) {
    list = document.createElement("ul");
    list.classList.add("suggestions-ul");
    container.appendChild(list);
  }
  return list;
}

// ===== トップバー UI（固定オーバーレイ） =====
function createTopbar() {
  // 検索コンテナを生成（ロールとラベルは ARIA を付与）
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
  input.placeholder = "クラス全体を検索…";
  input.setAttribute("role", "searchbox");
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;

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

  input.addEventListener("focus", () => {
    wrap.classList.add(EXPANDED_CLASS);
  });
  input.addEventListener("blur", () => {
    wrap.classList.remove(EXPANDED_CLASS);
  });
  input.addEventListener("input", onSerchInput);

  field.appendChild(icon);
  field.appendChild(input);
  field.appendChild(suggestions);
  wrap.appendChild(field);
  return wrap;
}
//Topbarにidを付与してbodyに挿入
function ensureTopbar() {
  ensureStyles();
  if (!document.body) return null;

  let topbar = document.getElementById(TOPBAR_ID);
  if (!topbar) {
    topbar = createTopbar();
    topbar.id = TOPBAR_ID;
    document.body.appendChild(topbar);
  }
  return topbar;
}
//DOMを監視して変化があれば再挿入
function observe() {
  void syncStreamPosts().catch(console.error);
  // DOM 変化を監視し、必要に応じて再注入（軽量）
  const observer = new MutationObserver((mutations) => {
    if (
      mutations.some(
        (m) => m.type === "childList" || m.type === "characterData"
      )
    ) {
      ensureTopbar();
      void syncStreamPosts().catch(console.error);
    }
  });
  const target = document.body || document.documentElement;
  if (target) {
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  // 監視で取りこぼした場合のフォールバックとして定期チェック
  setInterval(() => ensureTopbar(), 2000);
}

const options = {
  includeScore: true,
  shouldSort: true,
  threshold: 0.3,
  keys: [
    { name: "teacherName", weight: 0.4 },
    { name: "body", weight: 0.4 },
    { name: "attachments.title", weight: 0.2 },
    { name: "postedAt.text", weight: 0.05 },
  ],
  minMatchCharLength: 2,
};

let fuse = null;
async function initFuse() {
  try {
    const posts = await loadStreamPostsFromDb();
    fuse = new window.Fuse(posts, options);
  } catch (error) {
    console.error("[GCX] Failed to init fuse", error);
    fuse = null;
  }
}

//ユーザーからの入力をfuseのsearchにかけている。返り値は{item,score,refindex,...}
function onSerchInput(event) {
  const query = event.target.value.trim();
  if (!query || !fuse) {
    renderSuggestions([]);
    return;
  }
  const results = fuse.search(query);
  renderSuggestions(results.map((item) => item.item)); //{item,score,refindex,...}
}
//　ヒットしたfuseのうちitemをliに入れる。fragmentで一括で入れている。。
function renderSuggestions(items = []) {
  const container = document.querySelector(".gcx-suggestions");
  if (!container) return;
  const list = ensureSuggestionsStructure(container);
  if (!list) return;

  list.replaceChildren();

  if (!items.length) {
    container.classList.remove("has-results"); //非表示や余白調整
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const li = document.createElement("li");
    li.classList.add("suggestion-item");
    li.textContent = typeof item === "string" ? item : "";
    fragment.appendChild(li);
  }

  list.appendChild(fragment);
  container.classList.add("has-results");
}

function init() {
  // 初期化フロー: スタイル注入 → ライブラリ読み込み → UI 注入 → DOM 監視
  ensureTopbar();
  loadLocalLibs();
  initFuse();
  observe();
  console.debug("[GCX] search input injection initialized");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

// jsmodel = "N2jS6b"ストリームタブの投稿クラス

// Classroom DOM ラベル備忘録（安定属性のみ）
// data-stream-item-id → ストリーム投稿ごとのユニーク ID
// data-actor-name / data-entity-name → 投稿者（教師）の表示名
// role="heading" + aria-level="2" → 投稿ヘッダー見出し（氏名と時刻が含まれる）
// time[datetime][data-timestamp] → 投稿日時（ISO 文字列と UNIX ミリ秒）
// data-stream-post-body → 投稿本文テキストを含むコンテナ
// data-material-parent-id → 添付資料一覧のルート（投稿 ID と紐付く）
// data-attachment-type → 添付アイテムの種類（driveFile, form など）
// data-drive-id → Google ドライブ添付のファイル ID
// aria-label / aria-labelledby → 代替テキストやタイトルの参照
// role="link" / a[href] → 添付アイテムへのリンク本体
