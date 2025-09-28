// Google Classroom のトップバーへ「クイック検索」UIを挿入するスクリプト
// - ネットワーク通信は行わず、DOM 監視で UI を差し込むだけ
// - スタイルは外部 CSS を <link> で一度だけ注入（UI 本体は後段で生成）
// - 検索アイコンはインライン SVG 要素で描画（CSS 変数で色変更可）
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
      console.warn(`[GCX] Failed to load stylesheet from ${href}`, error);
      style.remove();
    });
}

//取得してオブジェクトにして返す。
function extractStreamData(root = document) {
  const entries = collectStreamElements(root);
  return entries.map(({ index, element, streamId: presetId }) => {
    const header =
      element.querySelector('[role="heading"][aria-level="2"]') || element;

    const headerTexts = collectJsnameTexts(header);
    const headerFallbackText = normalizeWhitespace(header.textContent);

    const teacherText = selectTeacherText(
      headerTexts,
      headerFallbackText,
      header
    );

    const timeEl = header.querySelector("time[datetime], [data-timestamp]");
    const timeFromAttr = normalizeWhitespace(timeEl?.textContent);
    const timeFromJsname = selectTimeText(headerTexts, timeFromAttr, header);
    const postedAt = {
      text: timeFromJsname,
      datetime:
        timeEl?.getAttribute?.("datetime") ||
        timeEl?.getAttribute?.("data-timestamp") ||
        "",
    };

    const bodyText = selectBodyText(element, header);

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

    const streamId = deriveStreamId({
      element,
      fallbackId: presetId,
      index,
      teacherName: teacherText,
      postedAt,
      bodyText,
    });

    return {
      index,
      streamId,
      teacherName: teacherText,
      postedAt,
      body: bodyText,
      attachments,
    };
  });
}
//jsnameを使ってDOMを取得
function collectJsnameTexts(scope) {
  if (!scope) return [];
  const results = [];
  const seen = new Set();
  scope.querySelectorAll("[jsname]").forEach((node) => {
    if (!node || node.getAttribute?.("aria-hidden") === "true") return;
    const text = normalizeWhitespace(node.textContent || "");
    if (!text) return;
    const key = `${node.getAttribute("jsname") || ""}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ node, text, jsname: node.getAttribute("jsname") || "" });
  });
  return results;
}

function textFromSelectors(scope, selectors = []) {
  if (!scope) return "";
  for (const selector of selectors) {
    const node = scope.querySelector(selector);
    if (node) {
      const text = normalizeWhitespace(node.textContent || "");
      if (text) return text;
    }
  }
  return "";
}

function selectTeacherText(headerTexts, fallbackText = "", headerScope) {
  const preferred = textFromSelectors(headerScope, [
    ".Vu2fZd.asQXV",
    ".lziZub .Vu2fZd",
  ]);
  if (preferred) return stripHonorifics(preferred);

  const teacherHints =
    /さん|先生|教員|教師|投稿者|作成者|shared by|posted by|先生から|教師から/i;
  const candidateByHint = headerTexts.find(({ text }) =>
    teacherHints.test(text)
  );
  if (candidateByHint) return stripHonorifics(candidateByHint.text);

  const shortCandidate = headerTexts
    .filter(({ text }) => text.length <= 40 && text.split(/\s+/).length <= 6)
    .sort((a, b) => a.text.length - b.text.length)[0];
  if (shortCandidate) return stripHonorifics(shortCandidate.text);

  if (fallbackText) {
    return stripHonorifics(fallbackText.split(/\s+/)[0] || fallbackText);
  }
  return "";
}

function stripHonorifics(value) {
  return normalizeWhitespace(
    value
      .replace(/さん|先生|先生方|先生から|教師から/g, "")
      .replace(/^投稿\s*:?\s*/, "")
  );
}

function selectTimeText(headerTexts, fallback = "", headerScope) {
  const explicit = textFromSelectors(headerScope, [
    ".IMvYId.dDKhVc.Vu2fZd",
    ".IMvYId .jzdBjc",
  ]);
  if (explicit) return explicit;

  const timePattern = /[0-9０-９年月日時分秒前後週曜日AMPM午前午後\.\/:\-]/i;
  const candidate = headerTexts.find(({ text }) => timePattern.test(text));
  if (candidate) return candidate.text;
  return fallback;
}

function selectBodyText(element, header) {
  const preferred = textFromSelectors(element, [
    '[jsname="z3vRcc"]',
    ".lziZub .jzdBjc",
    ".n8L8cc .jzdBjc",
  ]);
  if (preferred) return preferred;

  const bodyCandidates = collectJsnameTexts(element).filter(
    ({ node, text }) => {
      if (!text) return false;
      if (header && header.contains(node)) return false;
      if (node.closest("nav, button, label, svg")) return false;
      if (node.getAttribute("role") === "button") return false;
      return text.length >= 4;
    }
  );

  bodyCandidates.sort((a, b) => b.text.length - a.text.length);
  if (bodyCandidates.length) {
    return bodyCandidates[0].text;
  }

  const legacySource =
    element.querySelector("[data-stream-post-body]") ||
    element.querySelector('[jsname="r4nke"]');
  if (legacySource) {
    return normalizeWhitespace(legacySource.textContent || "");
  }

  const fullText = normalizeWhitespace(element.textContent || "");
  const headerText = normalizeWhitespace(header?.textContent || "");
  if (headerText && fullText.startsWith(headerText)) {
    return normalizeWhitespace(fullText.slice(headerText.length));
  }
  return fullText;
}
//文字列化し、半角スペースに統一して返す
function normalizeWhitespace(value) {
  if (value == null) return "";
  return String(value)
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}
//extractStreamDataからindex streamId + elementを返す（配列 > オブジェ。）
// Classroom 側の DOM 変更に負けないよう、確実に投稿本体を拾うためのセレクタ
// 1. data-stream-item-id を最優先で探す（公式属性）
// 2. data-item-id + jsmodel でも拾えるように広げておく（UI 改修の保険）
const STREAM_SELECTOR_PRIMARY =
  '[data-stream-item-id], [data-item-id][jsmodel*="N2jS6b"]';
// 3. それでも見つからない場合は記事（article / c-wiz）単位で拾ってフォールバック
const STREAM_SELECTOR_FALLBACK =
  'c-wiz[jsmodel*="N2jS6b"], article[jsmodel*="N2jS6b"], li[jsmodel*="N2jS6b"]';
// data-stream-item-id or data-item-id をまとめて探す共通セレクタ
const STREAM_ID_SELECTOR = '[data-stream-item-id], [data-item-id]';

let domFallbackLogged = false; // 初心者向けメモ: 同じ警告を何度も出さないためのフラグ
let idFallbackLogged = false;

function collectStreamElements(root = document) {
  const primary = [...(root?.querySelectorAll(STREAM_SELECTOR_PRIMARY) || [])];
  let elements = primary;

  if (elements.length === 0) {
    const fallback = [
      ...(root?.querySelectorAll(STREAM_SELECTOR_FALLBACK) || []),
    ];

    if (fallback.length && !domFallbackLogged) {
      console.warn(
        "[GCX] Fallback selector engaged. Classroom DOM might have changed."
      );
      domFallbackLogged = true;
    }

    elements = fallback;
  }

  const seenIds = new Set();
  const results = [];

  for (const element of elements) {
    const idCarrier = element.matches(STREAM_ID_SELECTOR)
      ? element
      : element.querySelector(STREAM_ID_SELECTOR);
    // 初心者向けメモ: idCarrier は「ID 属性を実際に持っている子要素」。
    // 投稿カードそのものに data-stream-item-id が無い場合でも、
    // 内側の子要素から拾ってユニーク ID を復元するために使うよ。
    const rawId =
      idCarrier?.dataset?.streamItemId ||
      idCarrier?.getAttribute?.("data-stream-item-id") ||
      idCarrier?.dataset?.itemId ||
      idCarrier?.getAttribute?.("data-item-id") ||
      "";

    if (rawId) {
      if (seenIds.has(rawId)) {
        continue;
      }
      seenIds.add(rawId);
    }

    results.push({
      // index: 1 から始まる連番。hashString の種にも使うので安定していると嬉しい。
      index: results.length + 1,
      streamId: rawId || null,
      element,
    });
  }

  return results;
}

// DOM から ID が取れない場合の保険。投稿の先生名/日時/本文からハッシュを作る。
function deriveStreamId({
  element,
  fallbackId,
  index,
  teacherName,
  postedAt,
  bodyText,
}) {
  const descendantCarrier =
    element?.matches?.(STREAM_ID_SELECTOR)
      ? element
      : element?.querySelector?.(STREAM_ID_SELECTOR);
  // 初心者向けメモ: descendantCarrier は「子孫にある ID 持ちの要素」。
  // directId を探すときに最後の切り札として使うイメージ。
  const directId =
    fallbackId ||
    element?.dataset?.streamItemId ||
    element?.getAttribute?.("data-stream-item-id") ||
    element?.dataset?.itemId ||
    element?.getAttribute?.("data-item-id") ||
    descendantCarrier?.dataset?.streamItemId ||
    descendantCarrier?.getAttribute?.("data-stream-item-id") ||
    descendantCarrier?.dataset?.itemId ||
    descendantCarrier?.getAttribute?.("data-item-id") ||
    element?.id;

  if (directId) return directId;

  const seedParts = [
    teacherName || "",
    postedAt?.datetime || "",
    (bodyText || "").slice(0, 160),
    String(index),
  ];
  const seed = seedParts.join("|");

  if (!idFallbackLogged) {
    console.warn(
      "[GCX] Stream ID fallback used. Check selector coverage in content.js."
    );
    idFallbackLogged = true;
  }

  return `auto-${hashString(seed)}`;
}

// 超シンプルなハッシュ関数（djb2 風）で安定IDを生成
function hashString(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
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
async function persistStreamData(rootOrPosts = document) {
  const posts = Array.isArray(rootOrPosts)
    ? rootOrPosts
    : extractStreamData(rootOrPosts);
  if (!posts.length) return { stored: 0, posts: [] };
  const request = openStreamDB();

  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; //TODO:event.target.result;にリファクタしろ
      const tx = db.transaction(STREAM_STORE_NAME, "readwrite");
      const store = tx.objectStore(STREAM_STORE_NAME);
      const savedAt = Date.now();
      const stored = [];
      posts.forEach((post, index) => {
        const streamId = ensureStableStreamId(post, index + 1);
        if (!streamId) {
          console.warn("[GCX] skip store: missing fallback streamId", post);
          return;
        }
        const record = { ...post, streamId, savedAt };
        store.put(record);
        stored.push(record);
      });
      if (!stored.length) {
        console.warn("[GCX] No posts persisted. Check selector / parser logic.");
      }
      tx.oncomplete = () => {
        db.close();
        resolve({ stored: stored.length, posts: stored });
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
function normalizeStreamId(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

// Classroom から拾った投稿が ID を持っていないとき、最小限の情報で
// ハッシュを再計算して安定 ID を復元するよ。
function ensureStableStreamId(post, fallbackIndex = 0) {
  const existing = normalizeStreamId(post?.streamId);
  if (existing) return existing;

  const seedParts = [
    normalizeWhitespace(post?.teacherName || ""),
    normalizeWhitespace(post?.postedAt?.datetime || post?.postedAt?.text || ""),
    normalizeWhitespace((post?.body || "").slice(0, 160)),
    String(post?.index || fallbackIndex || 0),
  ];

  const seed = seedParts.join("|");
  if (!seed.trim()) {
    return ""; // 先生名も本文も空っぽなら諦める（ほぼ発生しないけど安全策）
  }
  return `auto-${hashString(seed)}`;
}

function findNewPosts(oldList, newList) {
  const known = new Set();

  // 既存レコード分の ID を事前に集める。欠損していてもここで補完する。
  oldList.forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    known.add(id);
  });

  const fresh = [];

  newList.forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    if (known.has(id)) return;
    known.add(id);
    post.streamId = id; // 初心者向けメモ: 欠損 ID はここでその場で埋めておく。
    fresh.push(post);
  });

  return fresh;
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

    if (!currentPosts.length) {
      return; //投稿が描画されるまで保存を触らない。
    }

    if (!currentPosts.length) {
      return;
    }
    const newPosts = findNewPosts(savedPosts, currentPosts);
    if (newPosts.length) {
      await persistStreamData(newPosts);
      const updated = await loadStreamPostsFromDb();
      if (fuse) {
        fuse.setCollection(updated); //元データが増えたら最新の配列に差し替えるAPI
        rerunLastQuery();
      }
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
    sources: ["src/libs/fuse.esm.js"],
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

// 指定ライブラリを拡張パッケージから読み込む（開発・本番共通）
// 戻り値: Promise<boolean>（成功 true / 全候補失敗 false）
// 手順:
//  1) 定義がない場合は false
//  2) 既に注入済みなら true
//  3) 候補 URL を順に直列で試す（最初に成功した時点で終了）
//  4) 結果を CustomEvent "gcx:libs-loaded" で通知

//　FuseをESModule形式でインポート　その他のライブラリはIIFS
async function injectLib(name) {
  if (name !== "fuse") return false;
  if (window.Fuse) return true;
  const url = getExtensionURL(LIB_SPECS.fuse.sources[0]);
  try {
    const module = await import(url);
    const FuseExport = module?.default || module?.Fuse || module;
    if (typeof FuseExport !== "function") {
      throw new Error("Fuse module did not export a constructor");
    }
    window.Fuse = FuseExport;
    const detail = {
      name,
      success: true,
      message: "",
      source: url,
    };
    window.dispatchEvent(new CustomEvent("gcx:libs-loaded", { detail }));
    return true;
  } catch (err) {
    const detail = {
      name,
      success: false,
      message: String(err || ""),
      source: url,
    };
    window.dispatchEvent(new CustomEvent("gcx:libs-loaded", { detail }));
    return false;
  }
}

async function loadLocalLibs() {
  try {
    return await injectLib("fuse");
  } catch {
    return false;
  }
}

// メニュー側への注入は削除し、トップバー専用に単純化

// フォーカス制御専用のクラス（オブジェクト指向で管理）
class TopbarFocusController {
  // wrapElement: .gcx-topbar の要素をそのまま受け取る
  constructor(wrapElement) {
    this.wrap = wrapElement;
  }

  // 入力欄などがフォーカスを得た瞬間に展開クラスを追加
  open() {
    this.wrap.classList.add(EXPANDED_CLASS);
  }

  // focusout 時に「次のフォーカス先」がトップバー外なら閉じる
  handleFocusOut(event) {
    const nextTarget = event.relatedTarget;
    if (nextTarget && this.wrap.contains(nextTarget)) {
      return; // まだトップバー内で操作中なので閉じない
    }

    const active = document.activeElement;
    if (active && this.wrap.contains(active)) {
      return; // activeElement が内側なら引き続き開いたまま
    }

    this.wrap.classList.remove(EXPANDED_CLASS);
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

  const focusController = new TopbarFocusController(wrap);
  input.addEventListener("focus", () => {
    focusController.open();
  });
  wrap.addEventListener(
    "focusout",
    (event) => {
      focusController.handleFocusOut(event);
    },
    true
  );
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
  includeMatches: true,
  includeScore: true,
  shouldSort: true,
  threshold: 0.3,
  keys: [
    { name: "teacherName", weight: 0.4 },
    { name: "body", weight: 0.4 },
    { name: "attachments.title", weight: 0.2 },
    { name: "postedAt.text", weight: 0.05 },
  ],
  minMatchCharLength: 1,
};

//fuseを作る。
let fuse;
// IndexedDB からの読み込みが終わるまでの間に入力されたキーワードを保持する
let lastQuery = "";
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
  lastQuery = query;
  if (!query || !fuse) {
    renderSuggestions([]);
    return;
  }
  const results = fuse.search(query);
  renderSuggestions(results.map((item) => item.item)); //{item,score,refindex,...}
}
//　ヒットしたfuseのうちitemをliに入れる。fragmentで一括で入れている。。
function renderSuggestions(items) {
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
    li.tabIndex = 0; // 初心者向けメモ: tabIndex を付けるとフォーカス移動できる

    const header = document.createElement("div");
    header.classList.add("suggestion-header");

    const teacher = document.createElement("span");
    teacher.classList.add("suggestion-teacher");
    teacher.textContent = item.teacherName || "(不明)";

    const time = document.createElement("time");
    time.classList.add("suggestion-time");
    time.textContent = item.postedAt?.text || "";
    header.append(teacher, time);

    const body = document.createElement("div");
    body.classList.add("suggestion-body");
    body.textContent = item.body || "";

    li.append(header, body);
    fragment.appendChild(li);
  }

  list.appendChild(fragment);
  container.classList.add("has-results");
}

// IndexedDB からの差分同期後に、最後に入力したクエリで再検索するためのヘルパー
function rerunLastQuery() {
  if (!lastQuery || !fuse) return;
  const results = fuse.search(lastQuery);
  renderSuggestions(results.map((item) => item.item));
}

async function init() {
  // 初期化フロー: スタイル注入 → ライブラリ読み込み → 初期同期 → UI 注入 → DOM 監視
  ensureTopbar();
  await loadLocalLibs();
  try {
    await syncStreamPosts();
  } catch (error) {
    console.warn("[GCX] Initial sync failed", error);
  }
  await initFuse();
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
