// Google Classroom のトップバーへ「クイック検索」UIを挿入するスクリプト
// - ネットワーク通信は行わず、DOM 監視で UI を差し込むだけ
// - スタイルは <style> 要素を一度だけ注入して適用する（UI 本体は後段で生成）
// - 検索アイコンは before/after の疑似要素で CSS 描画（画像やアイコンフォント不要）
// ここから定数定義とスタイル注入ヘルパー
const TOPBAR_SELECTOR = 'nav.joJglb[role="navigation"]'; // 検索 UI を置くナビのセレクタ
const STYLE_ID = "gcx-sarch-style"; // 注入する <style> の id（重複防止）
const TOPBAR_WRAP = "gcx-topbar"; // 検索 UI ラッパーのクラス
const TOPBAR_INPUT = "gcx-topbar-input"; // 検索入力のクラス

// 注意: ensureStyles は CSS を注入するだけ。検索 UI 本体は createTopbar()/injectTopbar() で生成・挿入。
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* トップバー用クイック検索の見た目定義 */
    .${TOPBAR_WRAP} {
      position: relative;
      display: inline-flex; /* インラインに並ぶフレックス行（右寄せしやすい） */
      align-items: center;
      gap: 8px;
      max-width: 420px;
      min-width: 220px;
      margin-left: auto; /* ナビが flex の場合は右側に寄せるため */
      padding: 0 6px;
    }
    .${TOPBAR_WRAP} > input.${TOPBAR_INPUT} {
      box-sizing: border-box;
      width: 100%;
      height: 36px;
      padding: 0 12px 0 32px; /* 左側に描く検索アイコン分の余白 */
      border: 1px solid rgba(95,99,104,0.3);
      border-radius: 16px;
      background: rgba(255,255,255,0.8);
      color: inherit;
      outline: none;
      transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
    }
    .${TOPBAR_WRAP} > input.${TOPBAR_INPUT}::placeholder { color: #5f6368; }
    .${TOPBAR_WRAP} > input.${TOPBAR_INPUT}:focus {
      border-color: #1a73e8;
      box-shadow: 0 0 0 3px rgba(26,115,232,0.15);
      background: #fff;
    }
    .${TOPBAR_WRAP}::before {
      /* 検索アイコン（レンズの丸）を CSS のみで描画 */
      content: '';
      position: absolute;
      left: 12px;
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-radius: 50%;
      opacity: 0.55;
      pointer-events: none;
    }
    .${TOPBAR_WRAP}::after {
      /* 検索アイコン（持ち手）を CSS のみで描画 */
      content: '';
      position: absolute;
      left: 24px;
      top: 18px;
      width: 8px;
      height: 2px;
      background: currentColor;
      transform: rotate(45deg);
      opacity: 0.55;
      pointer-events: none;
    }
    .${TOPBAR_WRAP}[data-overlay="1"] {
      /* スペースが足りず他要素と重なる場合は中央オーバーレイに切替 */
      position: absolute !important;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      margin-left: 0 !important;
      max-width: min(560px, 70vw);
      width: clamp(220px, 40vw, 420px);
      z-index: 10;
    }
  `;
  document.head.appendChild(style);
}

// 後方互換用の別名（古いコードが小文字関数名を呼ぶ場合のため）
const ensurestyle = ensureStyles;

// ===== 開発時のみ任意で使える CDN ローダー（デフォルト無効） =====
// 注意: 公開版の拡張ではリモートコードの読み込みは禁止（Chrome Web Store ポリシー）。
// このローダーはローカル/開発用途向け。使用する場合は localStorage.GCX_USE_CDN = '1' を設定。
// スイッチは 2 種類: (1) localStorage.GCX_USE_CDN === '1' (2) <html data-gcx-cdn="1">

const GCX_CDN_FLAG = "GCX_USE_CDN"; // CDN 利用可否フラグ（文字列 "1" を期待）
const GCX_LIBS_FLAG = "GCX_LIBS"; // 例: "fuse,idb,hotkeys" のようにカンマ区切り

// 与えられたオリジン(href)への接続準備を行う（preconnect / dns-prefetch）。同一 href は重複追加しない。
function preconnect(href) {
  if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`))
    return;
  const l1 = document.createElement("link");
  l1.rel = "preconnect";
  l1.href = href;
  l1.crossOrigin = "anonymous";
  document.head.appendChild(l1);
  const l2 = document.createElement("link");
  l2.rel = "dns-prefetch";
  l2.href = href;
  document.head.appendChild(l2);
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

const CDN = {
  // ライブラリ名 => { marker, scripts }（開発用）※ライセンスはいずれも MIT（執筆時点）
  fuse: {
    marker: "Fuse", // 名札（<script data-gcx-lib="Fuse">）重複注入の識別に使用
    scripts: [ // フォールバック候補の CDN URL 群（順に試す）
      "https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/fuse.js/6.6.2/fuse.min.js",
      "https://unpkg.com/fuse.js@6.6.2/dist/fuse.min.js",
    ],
  },
  idb: {
    marker: "idb",
    scripts: [
      "https://cdn.jsdelivr.net/npm/idb@7.1.1/build/iife/index-min.js",
      "https://unpkg.com/idb@7.1.1/build/iife/index-min.js",
    ],
  },
  hotkeys: {
    marker: "hotkeys",
    scripts: [
      "https://cdn.jsdelivr.net/npm/hotkeys-js@3.13.8/dist/hotkeys.min.js",
      "https://unpkg.com/hotkeys-js@3.13.8/dist/hotkeys.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/hotkeys-js/3.13.8/hotkeys.min.js",
    ],
  },
};

function bestOrigins(urls) {
  // 主要 CDN ドメインに対して接続準備のみ行い、配列はそのまま返す（選別や並べ替えはしない）
  [
    "https://cdn.jsdelivr.net",
    "https://unpkg.com",
    "https://cdnjs.cloudflare.com",
  ].forEach(preconnect); //urls.forEach((u) => preconnect(u) と同じ;
  return urls; //forEach(preconnect());ではその場で実行し結果を返してしまう
}

function alreadyInjected(marker) {
  // 既に同じ名札(data-gcx-lib)の <script> が head にあるか
  return !!document.head.querySelector(`script[data-gcx-lib="${marker}"]`);
}

// 指定ライブラリを CDN から読み込む（開発用）
// 戻り値: Promise<boolean>（成功 true / 全候補失敗 false）
// 手順:
//  1) 定義がない場合は false
//  2) 既に注入済みなら true
//  3) 候補 URL を順に直列で試す（最初に成功した時点で終了）
//  4) 結果を CustomEvent "gcx:cdn-loaded" で通知（{ lib, ok, error? }）
async function injectLib(name) {
  const spec = CDN[name];
  if (!spec) return false;
  if (alreadyInjected(spec.marker)) return true;
  const urls = bestOrigins(spec.scripts); // フォールバック候補 URL 配列
  let lastErr; // 直近の失敗（全滅時のイベント detail 用）
  for (const u of urls) {
    try {
      await addScript(u, {
        "data-gcx-lib": spec.marker,
        crossorigin: "anonymous",
        referrerpolicy: "no-referrer",
      });
      window.dispatchEvent(
        new CustomEvent("gcx:cdn-loaded", { detail: { lib: name, ok: true } })
      );
      return true;
    } catch (err) {
      lastErr = err;
    }
  }

  window.dispatchEvent(
    new CustomEvent("gcx:cdn-loaded", {
      detail: { lib: name, ok: false, error: String(lastErr) },
    })
  );
  return false;
}

// CDN ロードのトグルと一括実行（開発用）
async function maybeLoadCDNs() {
  try {
    const allow =
      localStorage.getItem(GCX_CDN_FLAG) === "1" ||
      document.documentElement.getAttribute("data-gcx-cdn") === "1"; // <html data-gcx-cdn="1">
    if (!allow) return false;
    // 読み込み対象ライブラリの決定（カンマ区切り、空白トリム）
    const list = (localStorage.getItem(GCX_LIBS_FLAG) || "fuse,idb")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const results = await Promise.all(list.map(injectLib)); // ライブラリ単位では並列
    return results.every(Boolean);
  } catch {
    return false;
  }
}

// メニュー側への注入は削除し、トップバー専用に単純化

// ===== トップバー UI (nav.joJglb) =====
function hasTopbar(navEl) {
  // 同じ nav 内に既に UI があれば重複挿入しない
  return !!navEl.querySelector(`:scope > .${TOPBAR_WRAP}`);
}

function createTopbar(navEl) {
  // 検索コンテナを生成（ロールとラベルは ARIA を付与）
  const wrap = document.createElement("div"); // ラッパー
  wrap.className = TOPBAR_WRAP;
  wrap.setAttribute("role", "search");
  wrap.setAttribute("aria-label", "クイック検索");

  const input = document.createElement("input"); // 入力ボックス
  input.type = "search";
  input.className = TOPBAR_INPUT;
  input.placeholder = "クラス全体を検索…";
  input.setAttribute("role", "searchbox");
  input.autocapitalize = "off";
  input.autocomplete = "off";
  input.spellcheck = false;

  // 入力操作が親のナビに伝播してショートカット等を誤発火しないように抑止
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

  wrap.appendChild(input);
  return wrap;
}

// unifyStyleFromMenuItem は不要になったため削除（トップバー専用）

// メニュー側ヘルパー群は削除済み

function placeTopbar(navEl, bar) {
  const cs = getComputedStyle(navEl);
  // 可能ならロゴ/ブランドリンクの直後に挿入。見つからなければ末尾に追加。
  const brand =
    navEl.querySelector("a.onkcGd") || navEl.querySelector("a[aria-label]"); // ブランド/ロゴリンク候補
  if (brand && brand.parentElement === navEl) {
    brand.insertAdjacentElement("afterend", bar);
  } else {
    navEl.appendChild(bar);
  }

  // ナビが flex でない、または他要素と重なる場合はオーバーレイに切替
  const isFlex = cs.display.includes("flex");
  if (cs.position === "static") navEl.style.position = "relative";

  requestAnimationFrame(() => {
    const barRect = bar.getBoundingClientRect();
    let overlapped = false;
    if (!isFlex) {
      overlapped = true;
    } else {
      const others = Array.from(
        navEl.querySelectorAll('a,button,[role="button"],input')
      ).filter((el) => el !== bar && !bar.contains(el));
      for (const el of others) {
        const r = el.getBoundingClientRect();
        // 矩形の交差量で重なりを判定（x/y いずれも交差 > 0）
        const xOverlap = Math.max(
          0,
          Math.min(barRect.right, r.right) - Math.max(barRect.left, r.left)
        );
        const yOverlap = Math.max(
          0,
          Math.min(barRect.bottom, r.bottom) - Math.max(barRect.top, r.top)
        );
        if (xOverlap > 0 && yOverlap > 0) {
          overlapped = true;
          break;
        }
      }
    }
    if (overlapped) {
      bar.setAttribute("data-overlay", "1");
    } else {
      bar.removeAttribute("data-overlay");
    }
  });
}

function injectTopbar(root = document) {
  let added = 0; // 追加件数
  root.querySelectorAll(TOPBAR_SELECTOR).forEach((navEl) => {
    if (hasTopbar(navEl)) return;
    const bar = createTopbar(navEl);
    placeTopbar(navEl, bar);
    added++;
  });
  return added > 0;
}

function scanAndInject(root = document) {
  // 現在の DOM に対してトップバー検索を注入
  injectTopbar(root);
}

function observe() {
  // DOM 変化を監視し、必要に応じて再注入（軽量）
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        injectTopbar();
        break;
      }
    }
  });
  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });
  // 監視で取りこぼした場合のフォールバックとして定期チェック
  setInterval(() => injectTopbar(), 2000);
}

function init() {
  // 初期化フロー: スタイル注入 →（任意）CDN プリロード → UI 注入 → DOM 監視
  ensureStyles();
  // 開発時のみ明示的に有効化された場合はライブラリをプリロード
  maybeLoadCDNs();
  scanAndInject();
  observe();
  console.debug("[GCX] sarch input injection initialized");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
