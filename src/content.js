// Google Classroom のトップバーへ「クイック検索」UIを挿入するスクリプト
// - Google Classroom API からデータを取得して検索用インデックスを作成
// - スタイルは外部 CSS を <link> で一度だけ注入（UI 本体は後段で生成）
// - 検索アイコンはインライン SVG 要素で描画（CSS 変数で色変更可）
// ここから定数定義とスタイル注入ヘルパー
const STYLE_ID = "gcx-sarch-style"; // 注入する <link> の id（重複防止）
const STYLE_PATH = "src/gcx-topbar.css"; // 読み込むスタイルシートのパス
const TOPBAR_WRAP = "gcx-topbar"; // 検索 UI ラッパーのクラス
const TOPBAR_INPUT = "gcx-topbar-input"; // 検索入力のクラス
const TOPBAR_ID = "gcx-topbar-overlay"; // DOM 上の ID（重複防止）
const EXPANDED_CLASS = "is-expanded";
const REFRESH_BUTTON_SELECTOR = ".gcx-refresh-btn";
const REFRESH_ERROR_CLASS = "is-error";
const REFRESH_ERROR_DURATION_MS = 1500;
const SUGGESTION_LIMIT = 20; // 初心者メモ: Fuse.js の検索結果は 20 件までに抑えておく
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATH_DATA = [
  "M172.625,102.4c-42.674,0-77.392,34.739-77.392,77.438c0,5.932,4.806,10.74,10.733,10.74c5.928,0,10.733-4.808,10.733-10.74c0-30.856,25.088-55.959,55.926-55.959c5.928,0,10.733-4.808,10.733-10.74C183.358,107.208,178.553,102.4,172.625,102.4z",
  "M361.657,301.511c19.402-30.436,30.645-66.546,30.645-105.244C392.302,88.036,304.318,0,196.151,0c-38.676,0-74.765,11.25-105.182,30.663C66.734,46.123,46.11,66.759,30.659,91.008C11.257,121.444,0,157.568,0,196.267c0,108.217,87.998,196.266,196.151,196.266c38.676,0,74.779-11.264,105.197-30.677C325.582,346.396,346.206,325.76,361.657,301.511z M259.758,320.242c-19.075,9.842-40.708,15.403-63.607,15.403c-76.797,0-139.296-62.535-139.296-139.378c0-22.912,5.558-44.558,15.394-63.644c13.318-25.856,34.483-47.019,60.323-60.331c19.075-9.842,40.694-15.403,63.578-15.403c76.812,0,139.296,62.521,139.296,139.378c0,22.898-5.558,44.53-15.394,63.616C306.749,285.739,285.598,306.916,259.758,320.242z",
  "M499.516,439.154L386.275,326.13c-16.119,23.552-36.771,44.202-60.309,60.345l113.241,113.024c8.329,8.334,19.246,12.501,30.148,12.501c10.916,0,21.833-4.167,30.162-12.501C516.161,482.83,516.161,455.822,499.516,439.154z",
];

// リロードアイコンのパスデータ（512x512 ビューボックス）
const RELOAD_ICON_PATH_DATA =
  "M446.025,92.206c-40.762-42.394-97.487-69.642-160.383-72.182c-15.791-0.638-29.114,11.648-29.752,27.433c-0.638,15.791,11.648,29.114,27.426,29.76c47.715,1.943,90.45,22.481,121.479,54.681c30.987,32.235,49.956,75.765,49.971,124.011c-0.015,49.481-19.977,94.011-52.383,126.474c-32.462,32.413-76.999,52.368-126.472,52.382c-49.474-0.015-94.025-19.97-126.474-52.382c-32.405-32.463-52.368-76.992-52.382-126.474c0-3.483,0.106-6.938,0.302-10.364l34.091,16.827c3.702,1.824,8.002,1.852,11.35,0.086c3.362-1.788,5.349-5.137,5.264-8.896l-3.362-149.834c-0.114-4.285-2.88-8.357-7.094-10.464c-4.242-2.071-9.166-1.809-12.613,0.738L4.008,182.45c-3.05,2.221-4.498,5.831-3.86,9.577c0.61,3.759,3.249,7.143,6.966,8.974l35.722,17.629c-1.937,12.166-3.018,24.602-3.018,37.279c-0.014,65.102,26.475,124.31,69.153,166.944C151.607,465.525,210.8,492.013,275.91,492c65.095,0.014,124.302-26.475,166.937-69.146c42.678-42.635,69.167-101.842,69.154-166.944C512.014,192.446,486.844,134.565,446.025,92.206z";
const ERROR_ICON_PATHS = [
  "M2.20164 18.4695L10.1643 4.00506C10.9021 2.66498 13.0979 2.66498 13.8357 4.00506L21.7984 18.4695C22.4443 19.6428 21.4598 21 19.9627 21H4.0373C2.54022 21 1.55571 19.6428 2.20164 18.4695Z",
  "M12 9V13",
  "M12 17.0195V17",
];
const ERROR_ICON_COLOR = "#EA4335";
const PLACEHOLDER_DEFAULT = "クラス全体を検索…";
const PLACEHOLDER_SYNC_ERROR = "同期に失敗しました";
const PLACEHOLDER_LOGIN_REQUIRED = "Googleアカウントにログインしてください。";
const PLACEHOLDER_RELOAD_REQUIRED = "ページをリロードしてください。";

const RELOAD_ERROR_KEYWORDS = ["no response from background"];
const LOGIN_ERROR_KEYWORDS = [
  "getauthtoken",
  "oauth",
  "no token",
  "not authorized",
  "authorization",
  "http 401",
];

const CHANNEL_TOKEN_KEY = "gcxMessageChannelToken";
const CHANNEL_TOKEN_LENGTH = 64;
const AUTH_INIT_STATE_KEY = "gcxAuthInitStateV1";

let identityAccounts = [];
let lastAccountFingerprint = null; // アカウント切り替え検知用
let lastAccountKey = null;

let cachedChannelToken = null;
let channelTokenPromise = null;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.prototype.hasOwnProperty.call(changes, CHANNEL_TOKEN_KEY)) {
    const next = changes[CHANNEL_TOKEN_KEY]?.newValue;
    if (typeof next === "string" && next.length >= CHANNEL_TOKEN_LENGTH) {
      cachedChannelToken = next;
    } else {
      cachedChannelToken = null;
    }
  }
});

function isValidChannelToken(value) {
  return typeof value === "string" && value.length >= CHANNEL_TOKEN_LENGTH;
}

function readChannelTokenFromStorage() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get([CHANNEL_TOKEN_KEY], (items) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(items?.[CHANNEL_TOKEN_KEY] || null);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function requestChannelTokenFromBackground() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: "GCX_GET_CHANNEL_TOKEN" }, (res) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!res?.ok || !isValidChannelToken(res.channelToken)) {
          reject(
            new Error(res?.error || "Failed to obtain channel token from SW")
          );
          return;
        }
        resolve(res.channelToken);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function ensureChannelToken() {
  if (cachedChannelToken) return cachedChannelToken;
  if (channelTokenPromise) return channelTokenPromise;

  channelTokenPromise = (async () => {
    const stored = await readChannelTokenFromStorage().catch(() => null);
    if (isValidChannelToken(stored)) {
      cachedChannelToken = stored;
      return stored;
    }

    const token = await requestChannelTokenFromBackground();
    cachedChannelToken = token;
    return token;
  })();

  try {
    return await channelTokenPromise;
  } finally {
    channelTokenPromise = null;
  }
}

async function readAuthInitState() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([AUTH_INIT_STATE_KEY], (items) => {
        if (chrome.runtime.lastError) {
          console.debug(
            "[GCX] readAuthInitState failed",
            chrome.runtime.lastError.message
          );
          resolve({});
          return;
        }
        const raw = items?.[AUTH_INIT_STATE_KEY];
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          resolve({ ...raw });
        } else {
          resolve({});
        }
      });
    } catch (err) {
      console.debug("[GCX] readAuthInitState threw", err);
      resolve({});
    }
  });
}

async function writeAuthInitState(state) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(
        { [AUTH_INIT_STATE_KEY]: state },
        () => {
          if (chrome.runtime.lastError) {
            console.debug(
              "[GCX] writeAuthInitState failed",
              chrome.runtime.lastError.message
            );
          }
          resolve();
        }
      );
    } catch (err) {
      console.debug("[GCX] writeAuthInitState threw", err);
      resolve();
    }
  });
}

async function isAuthInitializedForKey(accountKey) {
  if (!accountKey) return false;
  const state = await readAuthInitState();
  return Boolean(state?.[accountKey]);
}

async function markAuthInitialized(accountKey) {
  if (!accountKey) return;
  const state = await readAuthInitState();
  if (state[accountKey]) return;
  state[accountKey] = Date.now();
  await writeAuthInitState(state);
  console.log("[GCX] ✓ Recorded OAuth initialization for", accountKey);
}

async function clearAuthInitialized(accountKey) {
  if (!accountKey) return;
  const state = await readAuthInitState();
  if (!state[accountKey]) return;
  delete state[accountKey];
  await writeAuthInitState(state);
  console.log("[GCX] ℹ️ Cleared OAuth initialization flag for", accountKey);
}

// Service Workerが起動していることを確認
async function ensureServiceWorkerReady() {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 初回のみログ表示
      if (i === 0) {
        console.log("[GCX] 🏓 Checking Service Worker...");
      }

      let channelToken;
      try {
        channelToken = await ensureChannelToken();
      } catch (error) {
        console.error("[GCX] ⚠️ Failed to obtain channel token", error);
        const fallbackDelay = 500 * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, fallbackDelay));
        continue;
      }

      const ready = await new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(false), 5000);

        chrome.runtime.sendMessage(
          {
            type: "PING",
            channelToken,
            extensionId: chrome.runtime.id,
          },
          (response) => {
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message;

              // 重大なエラーのみログ表示
              if (
                errorMsg.includes("Extension context invalidated") ||
                errorMsg.includes("Receiving end does not exist")
              ) {
                console.error(
                  "[GCX] ❌ Extension was reloaded. Please reload this page!"
                );
                setTopbarPlaceholder(
                  "⚠️ 拡張機能が更新されました。ページを再読み込みしてください。"
                );
              }
              resolve(false);
            } else if (
              response?.pong &&
              response?.extensionName === "Classroom-Finder" &&
              response?.extensionId === chrome.runtime.id
            ) {
              // 初回のみ成功ログ表示
              if (i === 0) {
                console.log("[GCX] ✓ Service Worker ready");
              }
              resolve(true);
            } else if (response?.pong) {
              // 異なる拡張機能からの応答（初回のみ警告）
              if (i === 0) {
                console.warn(
                  "[GCX] ⚠️ Response from different extension, retrying..."
                );
              }
              resolve(false);
            } else {
              console.log("[GCX] ⚠️ Unexpected response:", response);
              resolve(false);
            }
          }
        );
      });

      if (ready) return true;

      // 待機時間を指数的に増やす (500ms, 1000ms, 2000ms, 4000ms...)
      const delay = 500 * Math.pow(2, i);
      console.log(`[GCX]    Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      console.log("[GCX] ⚠️ Service Worker ping error:", err);
    }
  }

  console.error(
    "[GCX] ❌ Service Worker did not respond after",
    maxRetries,
    "retries"
  );
  setTopbarPlaceholder(
    "⚠️ Service Workerに接続できません。ページを再読み込みしてください。"
  );
  return false;
}

async function ensureIdentityAccounts() {
  if (identityAccounts.length) return identityAccounts;

  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    console.warn("[GCX] Failed to obtain channel token for identity list", err);
    return identityAccounts;
  }

  try {
    const accounts = await new Promise((resolve, reject) => {
      // タイムアウト設定（10秒）
      const timeoutId = setTimeout(() => {
        reject(new Error("Identity accounts fetch timeout (10s)"));
      }, 10000);

      chrome.runtime.sendMessage(
        { type: "GCX_IDENTITY_LIST", channelToken },
        (res) => {
          clearTimeout(timeoutId);

          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          if (!res || !Array.isArray(res.accounts)) {
            resolve([]);
            return;
          }
          resolve(res.accounts);
        }
      );
    });
    if (Array.isArray(accounts)) {
      identityAccounts = accounts;
    }
  } catch (err) {
    console.debug("[GCX] failed to load identity accounts", err);
  }
  return identityAccounts;
}

const JAPAN_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// UI やストレージによる切替は廃止し、
// コード内の定数で API モードを固定します。
const API_MODE = true; // true: API から同期する / false: 同期しない
// 手動更新のみなら 0 にする。自動同期する場合はミリ秒で指定。
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5分（0 で無効）
const ALLOWED_NAV_HOSTS = new Set(["classroom.google.com"]);

// 注意: ensureStyles は CSS を注入するだけ。検索 UI 本体は createTopbar()/injectTopbar() で生成・挿入。
// CSS読み込みが失敗してもUIは動作するため、エラーは無視してログのみ出力
function ensureStyles() {
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
        // CSSの読み込み失敗は致命的ではないため、警告のみ出力
        // UIの基本機能は動作し、スタイルが適用されないだけ
        console.debug(
          "[GCX] Stylesheet load failed (non-critical):",
          error.message || error
        );
        // 失敗したstyleタグは残しておく（空のスタイルでも問題なし）
      });
  } catch (error) {
    // getExtensionURL が失敗した場合も無視（UIは動作する）
    console.debug(
      "[GCX] Cannot load styles (non-critical), UI will still work"
    );
  }
}

// ===== Google Classroom API helper =====
// キャッシュされた全トークンをクリア
async function clearAllAuthTokens() {
  // Service Workerを確実に起動
  await ensureServiceWorkerReady();

  try {
    await clearAuthInitialized(AccountIdentityHelper.getCompositeKey());
  } catch (err) {
    console.debug("[GCX] clearAuthInitialized skipped", err);
  }

  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    console.warn("[GCX] Failed to obtain channel token for clear tokens", err);
    return;
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Clear tokens timeout (10s)"));
    }, 10000);

    try {
      chrome.runtime.sendMessage(
        { type: "GCX_CLEAR_TOKENS", channelToken },
        (res) => {
          clearTimeout(timeoutId);

          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            console.warn("[GCX] Failed to clear tokens:", runtimeError.message);
            resolve(); // エラーでも続行
            return;
          }
          console.log("[GCX] ✓ All cached tokens cleared");
          resolve();
        }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn("[GCX] Clear tokens error:", err);
      resolve(); // エラーでも続行
    }
  });
}

// OAuth 認証を強制的に実行（interactive=true）
async function forceOAuthAuthentication() {
  // Service Workerを確実に起動
  await ensureServiceWorkerReady();

  await ensureIdentityAccounts();
  const accountHint = getAccountHint();

  console.log("[GCX] Forcing OAuth authentication for account:", accountHint);

  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    throw new Error(
      `Failed to obtain channel token for OAuth authentication: ${err?.message || err}`
    );
  }

  return new Promise((resolve, reject) => {
    // タイムアウト設定（30秒）
    const timeoutId = setTimeout(() => {
      reject(new Error("OAuth authentication timeout (30s)"));
    }, 30000);

    try {
      chrome.runtime.sendMessage(
        {
          type: "GCX_GOOGLE_GET_TOKEN",
          interactive: true, // 強制的に認証画面を表示
          accountHint,
          channelToken,
        },
        (res) => {
          clearTimeout(timeoutId);

          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            console.error(
              "[GCX] OAuth authentication failed:",
              runtimeError.message
            );
            reject(new Error(runtimeError.message));
            return;
          }
          if (!res || !res.ok) {
            reject(new Error(res?.error || "OAuth authentication failed"));
            return;
          }
          const expectedFingerprint = AccountIdentityHelper.getFingerprint();
          const expectedAccountKey = AccountIdentityHelper.getCompositeKey();
          // OAuth の結果が別アカウントだったら即エラー。ここで止めると切り替えバグを封じ込められる。
          const responseFingerprint = res.account?.fingerprint || null;
          const responseAccountKey = res.account?.accountKey || null;
          if (
            responseFingerprint &&
            responseFingerprint !== expectedFingerprint
          ) {
            reject(new Error("Account mismatch detected after OAuth"));
            return;
          }
          if (
            responseAccountKey &&
            responseAccountKey !== expectedAccountKey
          ) {
            reject(new Error("Account key mismatch after OAuth"));
            return;
          }
          console.log("[GCX] ✓ OAuth authentication successful");
          markAuthInitialized(AccountIdentityHelper.getCompositeKey()).catch(
            (err) => {
              console.debug(
                "[GCX] markAuthInitialized failed (non-critical)",
                err
              );
            }
          );
          resolve(res.token);
        }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}

// バックグラウンドに依頼して Classroom API を叩く
async function bgFetch(request, attempt = 0) {
  // Service Workerを起動させる
  if (attempt === 0) {
    await ensureServiceWorkerReady();
  }

  await ensureIdentityAccounts();
  const accountHint = getAccountHint();
  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    throw new Error(
      `Failed to obtain channel token for fetch: ${err?.message || err}`
    );
  }

  return new Promise((resolve, reject) => {
    // タイムアウト設定（30秒）
    const timeoutId = setTimeout(() => {
      reject(new Error("Background fetch timeout (30s)"));
    }, 30000);

    try {
      chrome.runtime.sendMessage(
        { type: "GCX_GOOGLE_FETCH", request, accountHint, channelToken },
        (res) => {
          clearTimeout(timeoutId);

          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            const message = runtimeError.message || "Extension runtime error";

            // Extension context invalidated は特別扱い
            if (message.includes("Extension context invalidated")) {
              if (attempt < 2) {
                // 3回ではなく2回のリトライに制限
                const backoffMs = 500 * Math.pow(2, attempt);
                console.warn(
                  `[GCX] Extension context invalidated (retry ${
                    attempt + 1
                  }/2 after ${backoffMs}ms)`
                );
                setTimeout(() => {
                  bgFetch(request, attempt + 1)
                    .then(resolve)
                    .catch(reject);
                }, backoffMs);
                return;
              }
              // リトライ失敗: ページリロードを促すエラー
              reject(
                new Error(
                  "Extension context invalidated. Please reload the page."
                )
              );
              return;
            }

            // その他のリトライ可能なエラー: メッセージチャンネルクローズ
            if (
              attempt < 3 &&
              typeof message === "string" &&
              (message.includes("message channel closed") ||
                message.includes("message port closed"))
            ) {
              const backoffMs = 500 * Math.pow(2, attempt); // 指数バックオフ: 500ms, 1s, 2s
              console.warn(
                `[GCX] ${message} (retry ${attempt + 1}/3 after ${backoffMs}ms)`
              );
              setTimeout(() => {
                bgFetch(request, attempt + 1)
                  .then(resolve)
                  .catch(reject);
              }, backoffMs);
              return;
            }
            reject(new Error(message));
            return;
          }

          if (!res) {
            if (attempt < 3) {
              const backoffMs = 500 * Math.pow(2, attempt);
              console.warn(
                `[GCX] No response (retry ${
                  attempt + 1
                }/${3} after ${backoffMs}ms)`
              );
              setTimeout(() => {
                bgFetch(request, attempt + 1)
                  .then(resolve)
                  .catch(reject);
              }, backoffMs);
              return;
            }
            reject(new Error("No response from background"));
            return;
          }

          if (!res.ok) {
            reject(new Error(res.error || `HTTP ${res.status}`));
            return;
          }

          const expectedAccountKey = AccountIdentityHelper.getCompositeKey();
          const expectedFingerprint = AccountIdentityHelper.getFingerprint();
          // 初心者メモ: レスポンスのアカウントと今ひらいているアカウントがズレてないか最終確認する。
          // ここで弾いておけば、別アカウントのデータが UI に紛れ込むことはないよ。
          const responseAccountKey = res.account?.accountKey || null;
          const responseFingerprint = res.account?.fingerprint || null;
          if (
            responseAccountKey &&
            responseAccountKey !== expectedAccountKey
          ) {
            reject(new Error("Account mismatch detected for response"));
            return;
          }
          if (
            responseFingerprint &&
            responseFingerprint !== expectedFingerprint
          ) {
            reject(new Error("Fingerprint mismatch detected for response"));
            return;
          }

          resolve(res.data);
        }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}
//　すべてのコース一覧を取得し、配列を返す
async function listAllCourses() {
  const courses = [];
  let pageToken = undefined;
  do {
    const data = await bgFetch({
      path: "/courses",
      params: { courseStates: "ACTIVE", pageSize: 100, pageToken },
    });
    if (data?.courses?.length) courses.push(...data.courses);
    pageToken = data?.nextPageToken || undefined;
  } while (pageToken);

  return courses;
}
//　すべてのストリーム投稿を取得し返す
async function listAnnouncementsForCourse(courseId) {
  const items = [];
  let pageToken = undefined;
  do {
    const data = await bgFetch({
      path: `/courses/${encodeURIComponent(courseId)}/announcements`,
      params: { pageSize: 100, pageToken, orderBy: "updateTime desc" },
    });
    if (data?.announcements?.length) items.push(...data.announcements);
    pageToken = data?.nextPageToken || undefined;
  } while (pageToken);
  return items;
}
//　取得したものを整形している。返り値はオブジェ
function mapAnnouncementToPost(ann, course, index) {
  const apiId = normalizeWhitespace(ann.id || "");
  const id = normalizeStreamId(ann.id || "");
  const teacherName = normalizeWhitespace(course?.name || "");
  const courseId = normalizeWhitespace(course?.id || "");
  const courseName = teacherName;
  const postedAtRaw = normalizeWhitespace(
    ann.updateTime || ann.creationTime || ""
  );
  const formattedPostedAt = formatPostedAtForJapan(postedAtRaw);
  const bodyText = normalizeWhitespace(ann.text || "");
  const alternateLink = normalizeWhitespace(ann.alternateLink || "");

  return {
    index,
    apiId,
    streamId:
      id ||
      ensureStableStreamId(
        {
          streamId: id,
          teacherName,
          postedAt: {
            text: formattedPostedAt.text || postedAtRaw,
          },
          body: bodyText,
        },
        index
      ),
    courseId,
    courseName,
    teacherName,
    postedAt: {
      text: formattedPostedAt.text || postedAtRaw,
      datetime: formattedPostedAt.datetime || postedAtRaw,
    },
    body: bodyText,
    alternateLink,
    attachments: normalizeAttachments(ann.materials || []),
  };
}

// 全コースを走査してアナウンス投稿を収集
async function fetchAllAnnouncementsPosts() {
  const courses = await listAllCourses();
  const posts = [];
  let counter = 0;
  const concurrency = 2; // Service Worker への負荷をさらに軽減: 3 → 2
  let i = 0;

  // 並列取得用のワーカー（コースを順番に処理）
  async function worker() {
    while (i < courses.length) {
      const idx = i++;
      const course = courses[idx];
      try {
        // 各リクエスト間に100msの遅延を入れてService Workerの負荷を分散
        if (idx > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const anns = await listAnnouncementsForCourse(course.id);
        for (const ann of anns) {
          counter += 1;
          posts.push(mapAnnouncementToPost(ann, course, counter));
        }
      } catch (err) {
        console.warn(
          `[GCX] announcements fetch failed for course ${course?.id} (${
            course?.name || "unknown"
          })`,
          err.message || err
        );
        // エラーが発生してもスキップして次のコースへ続行
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, courses.length) }, worker)
  );
  return posts;
}

// API response の添付情報を共通形式へ変換
function normalizeAttachments(materials) {
  if (!Array.isArray(materials)) return [];
  return materials
    .map((material) => {
      if (!material || typeof material !== "object") return null;

      if (material.driveFile && material.driveFile.driveFile) {
        // Google Drive 添付を共通フォーマットに整理
        const file = material.driveFile.driveFile;
        return {
          type: "driveFile",
          driveId: file.id || "",
          href: file.alternateLink || "",
          title: normalizeWhitespace(file.title || ""),
          mimeType: normalizeWhitespace(file.mimeType || ""),
          iconUrl: normalizeWhitespace(file.iconUrl || ""),
        };
      }

      if (material.link) {
        const link = material.link;
        return {
          type: "link",
          driveId: "",
          href: link.url || "",
          title: normalizeWhitespace(link.title || link.url || ""),
        };
      }

      if (material.form) {
        const form = material.form;
        return {
          type: "form",
          driveId: form.formId || "",
          href: form.formUrl || "",
          title: normalizeWhitespace(form.title || ""),
        };
      }

      if (material.youtubeVideo) {
        const video = material.youtubeVideo;
        return {
          type: "youtube",
          driveId: video.id || "",
          href: video.alternateLink || video.url || "",
          title: normalizeWhitespace(video.title || ""),
        };
      }

      return null;
    })
    .filter(Boolean);
}

//文字列化し、半角スペースに統一して返す
function normalizeWhitespace(value) {
  if (value == null) return "";
  return String(value)
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}

// 配列ならそのまま返し、そうでなければ空配列に変換
function toArray(value) {
  return Array.isArray(value) ? value : [];
}

// 検索入力欄のプレースホルダー文言とエラースタイルを切り替え
function setTopbarPlaceholder(text) {
  if (!topbarInput) {
    topbarInput = document.querySelector(`.${TOPBAR_INPUT}`);
  }
  if (topbarInput) {
    topbarInput.placeholder = text;
    if (text === PLACEHOLDER_SYNC_ERROR) {
      topbarInput.classList.add("is-error");
    } else {
      topbarInput.classList.remove("is-error");
    }
  }
}

// 手動更新ボタンの DOM 要素を取得
function getRefreshButton() {
  return document.querySelector(REFRESH_BUTTON_SELECTOR);
}

// エラー原因に応じて更新ボタン付近のプレースホルダー文言を出し分ける
function resolveRefreshErrorPlaceholder(error) {
  if (!error) {
    return PLACEHOLDER_SYNC_ERROR;
  }
  const message = String(error?.message || error || "").toLowerCase();
  if (/(quota|ratelimit|too many|429)/.test(message)) {
    return "アクセスが多すぎます。しばらく待ってから再試行してください";
  }
  if (RELOAD_ERROR_KEYWORDS.some((keyword) => message.includes(keyword))) {
    return PLACEHOLDER_RELOAD_REQUIRED;
  }
  if (LOGIN_ERROR_KEYWORDS.some((keyword) => message.includes(keyword))) {
    return PLACEHOLDER_LOGIN_REQUIRED;
  }
  return PLACEHOLDER_SYNC_ERROR;
}

// エラー表示用スタイルを一定時間適用し、適切なメッセージを示す
function flashRefreshError(error) {
  const button = getRefreshButton();
  if (!button) return;
  button.classList.add(REFRESH_ERROR_CLASS);
  setTopbarPlaceholder(resolveRefreshErrorPlaceholder(error));
  if (refreshErrorTimerId) {
    clearTimeout(refreshErrorTimerId);
  }
  refreshErrorTimerId = window.setTimeout(() => {
    button.classList.remove(REFRESH_ERROR_CLASS);
    refreshErrorTimerId = null;
    setTopbarPlaceholder(PLACEHOLDER_DEFAULT);
  }, REFRESH_ERROR_DURATION_MS);
}

// 投稿日時を日本語表記に整形し、ISO 文字列も同時に提供
function formatPostedAtForJapan(rawValue) {
  const value = normalizeWhitespace(rawValue || "");
  if (!value) {
    return { text: "", datetime: "" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { text: value, datetime: value };
  }

  const parts = JAPAN_TIME_FORMATTER.formatToParts(date);
  const partValue = (type) => parts.find((p) => p.type === type)?.value || "";
  const yearPart = partValue("year");
  const monthPart = partValue("month");
  const dayPart = partValue("day");
  const baseText =
    monthPart && dayPart ? `${monthPart}/${dayPart}` : monthPart || dayPart;
  const yearNumber = Number.parseInt(yearPart, 10);
  const includeYear = Number.isFinite(yearNumber) && yearNumber < 2024;
  const fallbackText = JAPAN_TIME_FORMATTER.format(date);

  return {
    text:
      includeYear && baseText
        ? `${yearPart}/${baseText}`
        : baseText || fallbackText,
    datetime: date.toISOString(), // machine friendly ISO 8601
  };
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
const STREAM_ID_SELECTOR = "[data-stream-item-id], [data-item-id]";

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
  const descendantCarrier = element?.matches?.(STREAM_ID_SELECTOR)
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

const STREAM_DB_NAME_BASE = "gcx-stream";
const STREAM_DB_VERSION = 1;
const STREAM_STORE_NAME = "posts";

/**
 * アカウント情報から DB 名などをまとめて作るお助けクラス。
 * 「とりあえず関数を並べる」スタイルだと初心者は迷子になるから、
 * オブジェクト指向っぽく１か所に集めておくよ。
 */
class AccountIdentityHelper {
  /**
   * URL から authuser インデックスを読み取って、`u0` みたいな基本キーを作る。
   * 失敗したら `u0` に戻してあげるから安心してね。
   */
  static getIndexKey() {
    try {
      const url = new URL(window.location.href);
      const authuserParam = url.searchParams.get("authuser");
      if (authuserParam && /^\d+$/.test(authuserParam)) {
        return `u${authuserParam}`;
      }
      const pathMatch = url.pathname.match(/\/u\/(\d+)(?:\/|$)/);
      if (pathMatch && pathMatch[1]) {
        return `u${pathMatch[1]}`;
      }
    } catch (err) {
      console.debug("[GCX] account key detection failed", err);
    }
    return "u0";
  }

  /**
   * Classroom が教えてくれる GAIA ID やメールをハッシュ化して指紋を作る。
   * そのままだと個人情報が丸見えだから、hashString でグチャッと混ぜて
   * プライバシーを守る感じだよ。
   */
  static getFingerprint() {
    const gaiaId = getClassroomGaiaId();
    if (gaiaId) {
      return `g${hashString(gaiaId)}`;
    }
    const email = getClassroomAccountEmail();
    if (email) {
      return `m${hashString(email)}`;
    }
    return "anon";
  }

  /**
   * 最終的なキーを `u0-gxxxx` みたいな形で返す。
   * インデックスだけじゃ別アカと判別できなかったから、
   * 指紋をくっつけて別 DB を使わせるのが狙い。
   */
  static getCompositeKey() {
    const indexKey = this.getIndexKey();
    const fingerprint = this.getFingerprint();
    return `${indexKey}-${fingerprint}`;
  }

  /**
   * authuser の数値部分だけを取り出して number にする便利関数。
   * エラーになったら 0 扱いでいいよ、っていう初心者向け安全設計。
   */
  static getIndexNumber() {
    const rawKey = this.getCompositeKey();
    const match = /^u(\d+)/.exec(rawKey);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isInteger(value) && value >= 0) {
        return value;
      }
    }
    return 0;
  }
}

function getClassroomAccountKey() {
  return AccountIdentityHelper.getCompositeKey();
}

function getAccountIndex() {
  return AccountIdentityHelper.getIndexNumber();
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(EMAIL_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

function getWizGlobalData() {
  const data = window.WIZ_global_data;
  if (data && typeof data === "object") {
    return data;
  }
  return null;
}

function getClassroomGaiaId() {
  const data = getWizGlobalData();
  // ログ削除: 繰り返し実行されるため大量のログを防ぐ

  const candidateKeys = ["S06Grb", "W3Yyqf", "WZsZ1e", "Yllh3e"];
  if (data) {
    for (const key of candidateKeys) {
      const value = data[key];
      if (typeof value === "string" && /^\d{5,}$/.test(value)) {
        // 見つかった時のみログ表示
        console.log("[GCX] ✓ Found GAIA ID");
        return value;
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && /^\d{5,}$/.test(value)) {
        console.log("[GCX] ✓ Found GAIA ID");
        return value;
      }
    }
  }
  const metaId = document.querySelector('meta[name="og-profile-id"]');
  const metaValue = metaId?.getAttribute("content");
  if (metaValue && /^\d{5,}$/.test(metaValue.trim())) {
    console.log("[GCX] ✓ Found GAIA ID in meta tag");
    return metaValue.trim();
  }
  // GAIA IDが見つからない場合は通常の動作（学校アカウント等で正常）
  // ログ不要
  return null;
}

function getClassroomAccountEmail() {
  const meta = document.querySelector('meta[name="og-profile-acct"]');
  const metaEmail = normalizeEmail(meta?.getAttribute("content"));
  if (metaEmail) return metaEmail;

  const data = getWizGlobalData();
  if (data) {
    for (const value of Object.values(data)) {
      if (typeof value === "string") {
        const email = normalizeEmail(value);
        if (email) return email;
      }
    }
  }

  const selectors = [
    "[data-email]",
    'a[aria-label*="@"]',
    'a[href*="SignOutOptions"][aria-label]',
    'img[alt*="@"]',
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) continue;
    const attrEmail = normalizeEmail(element.getAttribute("data-email"));
    if (attrEmail) return attrEmail;
    const ariaEmail = normalizeEmail(element.getAttribute("aria-label"));
    if (ariaEmail) return ariaEmail;
    const altEmail = normalizeEmail(element.getAttribute("alt"));
    if (altEmail) return altEmail;
    const textEmail = normalizeEmail(element.textContent || "");
    if (textEmail) return textEmail;
  }

  return null;
}

function getAccountHint() {
  const index = getAccountIndex();
  const account = identityAccounts[index];
  const fallbackEmail = normalizeEmail(account?.email);
  return {
    index: getAccountIndex(),
    authUser: getAccountIndex(),
    gaiaId: getClassroomGaiaId(),
    email: getClassroomAccountEmail() || fallbackEmail,
    accountKey: AccountIdentityHelper.getCompositeKey(),
    fingerprint: AccountIdentityHelper.getFingerprint(),
  };
}

function getStreamDbName() {
  return `${STREAM_DB_NAME_BASE}-${getClassroomAccountKey()}`;
}

// streamIdを主としてopen
function openStreamDB() {
  const dbName = getStreamDbName();
  const request = indexedDB.open(dbName, STREAM_DB_VERSION);
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STREAM_STORE_NAME)) {
      db.createObjectStore(STREAM_STORE_NAME, { keyPath: "streamId" });
    }
  };
  return request;
}
// API から得た配列をそのまま保存
async function persistStreamData(posts = []) {
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
        const record = {
          ...post,
          apiId: normalizeWhitespace(post?.apiId || ""),
          streamId,
          savedAt,
        };
        store.put(record);
        stored.push(record);
      });
      if (!stored.length) {
        console.warn(
          "[GCX] No posts persisted. Check selector / parser logic."
        );
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
        const raw = getAll.result || [];
        const normalized = raw.map((post, index) => {
          const streamId = ensureStableStreamId(post, index + 1);
          const apiId = normalizeWhitespace(post?.apiId || post?.apiid || "");
          const postedAtSource =
            post?.postedAt?.datetime ||
            post?.postedAt?.text ||
            post?.postedAt ||
            "";
          const formattedPostedAt = formatPostedAtForJapan(postedAtSource);
          return {
            ...post,
            streamId,
            apiId,
            postedAt: {
              text:
                formattedPostedAt.text ||
                normalizeWhitespace(post?.postedAt?.text || ""),
              datetime:
                formattedPostedAt.datetime ||
                normalizeWhitespace(post?.postedAt?.datetime || ""),
            },
            alternateLink: normalizeWhitespace(post?.alternateLink || ""),
            courseId: normalizeWhitespace(post?.courseId || ""),
            courseName: normalizeWhitespace(
              post?.courseName || post?.teacherName || ""
            ),
          };
        });
        resolve(normalized);
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

// 既存データと突き合わせて新規投稿のみ抽出
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

function findRemovedPostIds(oldList, newList) {
  const previous = toArray(oldList);
  if (!previous.length) {
    return [];
  }

  const currentIds = new Set();
  toArray(newList).forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    currentIds.add(id);
  });

  const removed = [];
  previous.forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    if (currentIds.has(id)) return;
    removed.push(id);
  });

  return removed;
}

async function removeStreamPostsByIds(ids = []) {
  const normalizedIds = Array.from(
    new Set(
      toArray(ids)
        .map((id) => normalizeStreamId(id))
        .filter(Boolean)
    )
  );
  if (!normalizedIds.length) {
    return 0;
  }

  const request = openStreamDB();
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STREAM_STORE_NAME, "readwrite");
      const store = tx.objectStore(STREAM_STORE_NAME);

      normalizedIds.forEach((id) => {
        try {
          store.delete(id);
        } catch (err) {
          console.warn("[GCX] delete failed", { id, err });
        }
      });

      tx.oncomplete = () => {
        db.close();
        resolve(normalizedIds.length);
      };
      tx.onerror = () => {
        const error =
          tx.error || new Error("IndexedDB delete transaction failed");
        db.close();
        reject(error);
      };
      tx.onabort = () => {
        db.close();
        reject(new Error("IndexedDB delete transaction aborted"));
      };
    };
  });
}

let syncInFlight = false;

function resetSearchResults() {
  if (fuse) {
    fuse.setCollection([]);
  }
  renderSuggestions([]);
}

// API 経由で最新を取り込み、差分だけ追加
async function syncStreamPosts(options = {}) {
  if (!API_MODE) {
    console.info("[GCX] API mode=false (disabled)");
    return;
  }
  if (syncInFlight) return;
  syncInFlight = true;
  let savedPosts = [];
  try {
    // アカウント情報を最新化
    await ensureIdentityAccounts();

    // 現在のアカウント指紋を取得
    const currentFingerprint = AccountIdentityHelper.getFingerprint();
    const currentAccountKey = AccountIdentityHelper.getCompositeKey();
    const isManualRefresh = options.source === "manual";

    // アカウント切り替え検知
    const accountSwitched =
      (lastAccountFingerprint &&
        lastAccountFingerprint !== currentFingerprint) ||
      (lastAccountKey && lastAccountKey !== currentAccountKey);

    if (accountSwitched) {
      console.log("[GCX] 🔄 Account switch detected!");
      console.log("[GCX] Previous fingerprint:", lastAccountFingerprint);
      console.log("[GCX] Current fingerprint:", currentFingerprint);
      console.log("[GCX] Current account:", {
        index: getAccountIndex(),
        gaiaId: getClassroomGaiaId(),
        email: getClassroomAccountEmail(),
      });

      // アカウント切り替え時はトークンをクリアしてからOAuth再認証を実行
      setTopbarPlaceholder("アカウント切り替えを検知しました...");
      try {
        // 1. 古いアカウントのトークンを完全にクリア
        console.log("[GCX] 🗑️ Clearing old account's OAuth tokens...");
        try {
          await clearAuthInitialized(currentAccountKey);
        } catch (err) {
          console.debug(
            "[GCX] clearAuthInitialized during switch failed",
            err
          );
        }
        await clearAllAuthTokens();
        console.log("[GCX] ✓ Old tokens cleared");

        // 2. 少し待機してトークンクリアが確実に反映されるようにする
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 3. 新しいアカウントでOAuth認証
        console.log("[GCX] 🔓 Re-authenticating with new account...");
        await forceOAuthAuthentication();
        console.log(
          "[GCX] ✓ OAuth re-authentication completed after account switch"
        );
      } catch (authErr) {
        console.error("[GCX] OAuth re-authentication failed:", authErr);
        setTopbarPlaceholder("認証に失敗しました");
        throw authErr;
      }

      // 新しいアカウントのDBからデータを読み込み、Fuseを再初期化
      console.log(
        "[GCX] 📂 Switching to new account's IndexedDB:",
        getStreamDbName()
      );
      savedPosts = await loadStreamPostsFromDb();
      if (fuse) {
        fuse.setCollection(savedPosts);
        console.log(
          "[GCX] ✓ Fuse re-initialized with",
          savedPosts.length,
          "posts from new account"
        );
        // アカウント切り替え時は検索結果を即座に更新
        rerunLastQuery();
      }
    }

    lastAccountFingerprint = currentFingerprint;
    lastAccountKey = currentAccountKey;

    // アカウント切り替えがなかった場合は通常の読み込み
    if (!accountSwitched) {
      savedPosts = await loadStreamPostsFromDb();
    }

    const currentPostsRaw = await fetchAllAnnouncementsPosts();

    const existingPosts = toArray(savedPosts);
    const currentPosts = toArray(currentPostsRaw);

    const removedIds = findRemovedPostIds(existingPosts, currentPosts);
    const newPosts = findNewPosts(existingPosts, currentPosts);
    let dataChanged = false;

    if (removedIds.length) {
      try {
        const removedCount = await removeStreamPostsByIds(removedIds);
        if (removedCount > 0) {
          dataChanged = true;
        }
      } catch (err) {
        console.warn("[GCX] remove stream posts failed", err);
      }
    }

    if (newPosts.length) {
      const result = await persistStreamData(newPosts);
      if (result?.stored) {
        dataChanged = true;
      }
    }

    if (dataChanged) {
      const updated = await loadStreamPostsFromDb();
      if (fuse) {
        fuse.setCollection(updated); //最新の配列に差し替える
        rerunLastQuery();
      }
    } else if (!existingPosts.length) {
      resetSearchResults();
    }
    setTopbarPlaceholder(PLACEHOLDER_DEFAULT);
  } catch (error) {
    if (!savedPosts.length) {
      resetSearchResults();
    }
    throw error;
  } finally {
    syncInFlight = false;
  }
}

// ===== ローカル配布ライブラリ ローダー =====
const LIB_SPECS = {
  fuse: {
    marker: "Fuse", // 名札（<script data-gcx-lib="Fuse">）重複注入の識別に使用
    sources: ["src/libs/fuse.esm.js"],
  },
};

// 拡張内リソースの絶対URLを解決

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

// ローカル同梱ライブラリを読み込む
async function loadLocalLibs() {
  try {
    return await injectLib("fuse");
  } catch {
    return false;
  }
}

// フォーカス制御専用のクラス（オブジェクト指向で管理）
class TopbarFocusController {
  // wrapElement: .gcx-topbar の要素 / inputElement: 検索ボックス / suggestionsElement: 候補コンテナ
  constructor(wrapElement, inputElement, suggestionsElement) {
    this.wrap = wrapElement;
    this.input = inputElement;
    this.suggestions = suggestionsElement;
  }

  // 入力欄などがフォーカスを得た瞬間に展開クラスを追加
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

    this.close();
  }
}

// トップバーの虫眼鏡アイコンを生成
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

// リロードアイコン（円矢印）を生成
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
// containerにulがなかったらulをcontainerにappend
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
    if (value) {
      renderSuggestions(collectTopMatches(value));
    }
  });
  wrap.addEventListener(
    "focusout",
    (event) => {
      focusController.handleFocusOut(event);
    },
    true
  );
  input.addEventListener("input", onSearchInput);

  const handleOutsidePointerDown = (event) => {
    if (!wrap.contains(event.target)) {
      focusController.close({ blur: true });
    }
  };
  document.addEventListener("pointerdown", handleOutsidePointerDown, true); // キャプチャリングフェーズ

  field.appendChild(icon);
  field.appendChild(input);
  field.appendChild(suggestions);
  wrap.appendChild(field);

  // 入力行の右端（同一行）に手動更新ボタンを配置
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.classList.add("gcx-refresh-btn");
  refreshBtn.title = "新規投稿を同期";
  refreshBtn.setAttribute("aria-label", "更新");
  // SVG アイコン（リロード）をインライン生成して先頭に挿入
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
    if (!API_MODE) {
      flashRefreshError();
      return;
    }
    try {
      refreshBtn.disabled = true; // 連打防止
      refreshBtn.classList.add("is-spinning");

      // 1. まず OAuth 認証を強制実行
      setTopbarPlaceholder("認証中...");
      try {
        // 古いトークンをクリアしてから再認証
        await clearAllAuthTokens();
        await forceOAuthAuthentication();
        console.log("[GCX] OAuth re-authentication completed");
      } catch (authErr) {
        console.error("[GCX] OAuth re-authentication failed:", authErr);
        setTopbarPlaceholder("認証に失敗しました");
        throw authErr;
      }

      // 2. 認証成功後、データを同期
      setTopbarPlaceholder("データを取得中...");
      await syncStreamPosts({ source: "manual" });
      setTopbarPlaceholder("");
    } catch (err) {
      console.warn("[GCX] manual sync failed", err);
      flashRefreshError(err);
    } finally {
      refreshBtn.classList.remove("is-spinning");
      refreshBtn.disabled = false;
    }
  });

  // grid 1行目の3列目として配置し、suggestions は2行目に展開させる
  if (suggestions.parentNode === field) {
    field.removeChild(suggestions);
  }
  field.appendChild(refreshBtn);
  field.appendChild(suggestions);

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
// UI 永続化のための MutationObserver とタイマー
let topbarObserver = null;
let topbarCheckInterval = null;

// アカウント初期化完了フラグ
let accountInitialized = false;

// トップバーが消えていないかチェックし、消えていたら再注入
function checkTopbarPresence() {
  const existing = document.getElementById(TOPBAR_ID);
  if (!existing || !document.body.contains(existing)) {
    console.debug("[GCX] Topbar missing, re-injecting");
    ensureTopbar();
  }
}

// DOM変更を監視してトップバーの削除を検知
function setupTopbarObserver() {
  if (topbarObserver) return;

  topbarObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // removedNodesにトップバーが含まれていたら即座に再注入
      for (const node of mutation.removedNodes) {
        if (
          node.id === TOPBAR_ID ||
          (node.contains && node.contains(document.getElementById(TOPBAR_ID)))
        ) {
          console.debug("[GCX] Topbar removed by DOM mutation, re-injecting");
          ensureTopbar();
          return;
        }
      }
    }
  });

  // body全体を監視（childList: 子要素の追加/削除, subtree: 子孫要素も含む）
  topbarObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// 定期的なチェックも併用（念のため）
function setupTopbarCheckInterval() {
  if (topbarCheckInterval) return;
  // 30秒ごとにチェック
  topbarCheckInterval = setInterval(checkTopbarPresence, 30000);
}

// URLの変化を監視してアカウント切り替えを検出
let lastPathname = window.location.pathname;
function setupAccountSwitchDetection() {
  // URLの変化を監視（特に /u/X の部分）
  const checkAccountSwitch = () => {
    const currentPathname = window.location.pathname;
    if (currentPathname !== lastPathname) {
      const oldMatch = lastPathname.match(/\/u\/(\d+)/);
      const newMatch = currentPathname.match(/\/u\/(\d+)/);
      const oldIndex = oldMatch ? oldMatch[1] : "0";
      const newIndex = newMatch ? newMatch[1] : "0";

      if (oldIndex !== newIndex) {
        console.log("[GCX] 🔄 URL changed, account switch detected!");
        console.log("[GCX] Old index:", oldIndex, "→ New index:", newIndex);
        lastPathname = currentPathname;

        // アカウント切り替えを検出したら即座に同期
        void syncStreamPosts({ source: "account-switch" }).catch((err) => {
          console.error("[GCX] Account switch sync failed:", err);
        });
      } else {
        lastPathname = currentPathname;
      }
    }
  };

  // 1秒ごとにURLをチェック（軽量な処理）
  setInterval(checkAccountSwitch, 1000);

  // popstateイベントでもチェック（戻る/進むボタン）
  window.addEventListener("popstate", checkAccountSwitch);
}

// トップバーを維持しつつデータ同期を定期実行
async function observe() {
  // 初回注入
  ensureTopbar();

  // UI永続化の仕組みをセットアップ
  setupTopbarObserver();
  setupTopbarCheckInterval();

  // アカウント切り替え検出をセットアップ
  setupAccountSwitchDetection();

  // アカウント情報の初期化
  try {
    await ensureIdentityAccounts();
    const initialFingerprint = AccountIdentityHelper.getFingerprint();
    lastAccountFingerprint = initialFingerprint;
    lastAccountKey = AccountIdentityHelper.getCompositeKey();
    accountInitialized = true;
    console.log("[GCX] Account initialized:", {
      fingerprint: initialFingerprint,
      index: getAccountIndex(),
      gaiaId: getClassroomGaiaId(),
      email: getClassroomAccountEmail(),
      dbName: getStreamDbName(),
    });

    const accountKey = AccountIdentityHelper.getCompositeKey();
    const alreadyInitialized = await isAuthInitializedForKey(accountKey);

    if (!alreadyInitialized) {
      // 🆕 初回起動時にOAuth認証を実行（認証画面を表示）
      console.log("[GCX] 🔓 Requesting initial OAuth authentication...");
      try {
        // 古いトークンをクリアしてから認証
        console.log("[GCX] 📞 Calling clearAllAuthTokens()...");
        await clearAllAuthTokens();
        console.log("[GCX] ✓ clearAllAuthTokens() completed");

        // トークンクリアが完全に反映されるまで少し待つ（学校アカウント対策）
        console.log("[GCX] ⏳ Waiting for token cache to clear...");
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1秒待機
        console.log("[GCX] ✓ Token cache should be cleared now");

        console.log("[GCX] 📞 Calling forceOAuthAuthentication()...");
        await forceOAuthAuthentication();
        console.log("[GCX] ✓ Initial OAuth authentication successful");
      } catch (authErr) {
        console.error("[GCX] ❌ Initial OAuth authentication failed:", authErr);
        console.error("[GCX] Error stack:", authErr.stack);
        setTopbarPlaceholder(
          "認証に失敗しました。更新ボタンをクリックしてください。"
        );
      }
    } else {
      console.log(
        "[GCX] OAuth already initialized for account key:",
        accountKey
      );
    }
  } catch (err) {
    console.warn("[GCX] Failed to initialize account info", err);
  }

  // 初回同期
  void syncStreamPosts().catch((err) => {
    // Extension context invalidated の場合は、ページリロードを促す
    if (
      err &&
      err.message &&
      err.message.includes("Extension context invalidated")
    ) {
      console.warn(
        "[GCX] Extension context invalidated. Please reload the page."
      );
      setTopbarPlaceholder(
        "拡張機能が更新されました。ページをリロードしてください。"
      );
      return;
    }

    console.warn(
      "[GCX] Periodic fetch failed. API mode=false とみなします",
      err
    );
    flashRefreshError(err);
  });

  // 定期的にデータを同期（5 分ごと）
  if (POLL_INTERVAL_MS > 0) {
    setInterval(() => {
      // 同期前にUIの存在を確認
      checkTopbarPresence();

      void syncStreamPosts().catch((err) => {
        // Extension context invalidated の場合は、ページリロードを促す
        if (
          err &&
          err.message &&
          err.message.includes("Extension context invalidated")
        ) {
          console.warn(
            "[GCX] Extension context invalidated. Please reload the page."
          );
          setTopbarPlaceholder(
            "拡張機能が更新されました。ページをリロードしてください。"
          );
          return;
        }

        console.warn(
          "[GCX] Periodic fetch failed. API mode=false とみなします",
          err
        );
        flashRefreshError(err);
      });
    }, POLL_INTERVAL_MS);
  }
}

const options = {
  includeMatches: true,
  includeScore: true,
  shouldSort: true,
  threshold: 0.3,
  keys: [
    { name: "teacherName", weight: 0.4 },
    { name: "courseName", weight: 0.2 },
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
let refreshErrorTimerId = null;
let topbarInput;
// API モードのトグル UI / 切替ハンドラは削除
// IndexedDB の投稿コレクションで Fuse を初期化
async function initFuse() {
  try {
    const posts = await loadStreamPostsFromDb();
    fuse = new window.Fuse(posts, options);
  } catch (error) {
    console.error("[GCX] Failed to init fuse", error);
    fuse = null;
  }
}

// Fuse.js の検索結果から本文マッチの開始位置を取得（なければ Infinity）
function getBodyMatchStart(result) {
  const matches = toArray(result?.matches);
  for (const match of matches) {
    if (match?.key !== "body") continue;
    const firstRange = toArray(match.indices)[0];
    if (Array.isArray(firstRange) && firstRange.length > 0) {
      return Number(firstRange[0]);
    }
  }
  return Number.POSITIVE_INFINITY;
}

// Fuse.js で検索し、本文ヒットが早い順に並べ替えた候補を返す
function collectTopMatches(query) {
  // 入力が空文字だったり、まだ Fuse の準備が出来ていない場合は即終了
  if (!query || !fuse) {
    return [];
  }

  const safeQuery = query.trim();
  if (!safeQuery) {
    return [];
  }

  const results = fuse.search(safeQuery);
  const sorted = results.slice().sort((a, b) => {
    const aBodyIndex = getBodyMatchStart(a);
    const bBodyIndex = getBodyMatchStart(b);
    if (aBodyIndex !== bBodyIndex) {
      return aBodyIndex - bBodyIndex;
    }
    return (a?.score ?? 1) - (b?.score ?? 1);
  });

  return sorted.slice(0, SUGGESTION_LIMIT);
}

//ユーザーからの入力をfuseのsearchにかけている。返り値は{item,score,refindex,...}
function onSearchInput(event) {
  const query = event.target.value.trim();
  lastQuery = query;
  renderSuggestions(collectTopMatches(query));
}
// Fuse の matches から指定キーのハイライト範囲を抽出
function extractMatchRanges(matches, key, textLength) {
  if (!Array.isArray(matches) || !key || !textLength) {
    return [];
  }

  // startとendが逆転しないように
  const ranges = [];
  matches.forEach((match) => {
    if (!match || match.key !== key) return;
    if (!Array.isArray(match.indices)) return;
    match.indices.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return;
      const start = Math.max(0, Math.min(textLength - 1, pair[0]));
      const end = Math.max(start, Math.min(textLength - 1, pair[1]));
      ranges.push([start, end]);
    });
  });

  if (!ranges.length) return [];

  ranges.sort((a, b) => a[0] - b[0]); //startの値を比べて早い順
  const merged = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) {
      if (end > last[1]) {
        last[1] = end;
      }
      continue;
    }
    merged.push([start, end]);
  }

  return merged;
}

// 抽出した範囲に <span> を差し込んでハイライト
function renderHighlightedText(element, value, matches, key) {
  const text = value == null ? "" : String(value);
  element.textContent = "";
  if (!text) {
    return;
  }

  const ranges = extractMatchRanges(matches, key, text.length);
  if (!ranges.length) {
    element.textContent = text;
    return;
  }

  let cursor = 0;
  const fragment = document.createDocumentFragment();
  for (const [start, end] of ranges) {
    if (cursor < start) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
    }
    const span = document.createElement("span");
    span.classList.add("match-highlight");
    span.textContent = text.slice(start, end + 1);
    fragment.appendChild(span);
    cursor = end + 1;
  }

  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }

  element.appendChild(fragment);
}

const IMAGE_EXT_PATTERN = /\.(?:png|jpe?g|gif|bmp|webp|svg|heic|heif|tiff?)$/i;
const DOC_EXT_PATTERN = /\.(?:docx?|gdoc)$/i;
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_DOC_URL_PATTERN = /docs\.google\.com\/document/i;

function deriveDriveFileLabel(attachment) {
  const mime = normalizeWhitespace(attachment?.mimeType || "").toLowerCase();
  if (mime === GOOGLE_DOC_MIME) {
    return "Document";
  }
  if (mime.startsWith("image/")) {
    return "Image";
  }

  const title = normalizeWhitespace(attachment?.title || "");
  const href = normalizeWhitespace(attachment?.href || "");
  const icon = normalizeWhitespace(attachment?.iconUrl || "");
  const lowerTitle = title.toLowerCase();
  const lowerHref = href.toLowerCase();
  const lowerIcon = icon.toLowerCase();

  if (
    GOOGLE_DOC_URL_PATTERN.test(href) ||
    GOOGLE_DOC_URL_PATTERN.test(title) ||
    lowerIcon.includes("document") ||
    DOC_EXT_PATTERN.test(title) ||
    DOC_EXT_PATTERN.test(href)
  ) {
    return "Document";
  }

  if (IMAGE_EXT_PATTERN.test(title) || IMAGE_EXT_PATTERN.test(href)) {
    return "Image";
  }

  if (
    lowerTitle.endsWith(".pdf") ||
    lowerHref.endsWith(".pdf") ||
    lowerHref.includes(".pdf")
  ) {
    return "PDF";
  }

  return "File";
}

function deriveSingleAttachmentLabel(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return "";
  }

  switch (attachment.type) {
    case "driveFile":
      return deriveDriveFileLabel(attachment);
    case "form":
      return "Form";
    case "youtube":
      return "YouTube";
    case "link": {
      const href = normalizeWhitespace(attachment.href || "");
      const title = normalizeWhitespace(attachment.title || "");
      const lowerHref = href.toLowerCase();
      const lowerTitle = title.toLowerCase();

      if (
        GOOGLE_DOC_URL_PATTERN.test(href) ||
        GOOGLE_DOC_URL_PATTERN.test(title) ||
        DOC_EXT_PATTERN.test(title) ||
        DOC_EXT_PATTERN.test(href)
      ) {
        return "Document";
      }

      if (IMAGE_EXT_PATTERN.test(title) || IMAGE_EXT_PATTERN.test(href)) {
        return "Image";
      }

      if (
        lowerHref.endsWith(".pdf") ||
        lowerHref.includes(".pdf") ||
        lowerTitle.endsWith(".pdf")
      ) {
        return "PDF";
      }

      return "Link";
    }
    default:
      return "File";
  }
}

function deriveAttachmentLabels(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) {
    return [];
  }

  return attachments
    .map((attachment) => deriveSingleAttachmentLabel(attachment))
    .filter((label) => Boolean(label));
}

function getCurrentCourseId() {
  const pathname = window.location?.pathname || "";
  const hash = window.location?.hash || "";
  const match =
    /\/c\/([a-zA-Z0-9_-]+)/.exec(pathname) ||
    /\/c\/([a-zA-Z0-9_-]+)/.exec(hash);
  return match?.[1] || "";
}

function cssEscapeSafe(value) {
  if (value == null) return "";
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  const string = String(value);
  const length = string.length;
  let result = "";
  for (let index = 0; index < length; index += 1) {
    const code = string.charCodeAt(index);
    const char = string.charAt(index);
    if (code === 0) {
      result += "\uFFFD";
      continue;
    }
    if (
      (code >= 0x0001 && code <= 0x001f) ||
      code === 0x007f ||
      (index === 0 && code >= 0x0030 && code <= 0x0039) ||
      (index === 1 &&
        string.charCodeAt(0) === 0x002d &&
        code >= 0x0030 &&
        code <= 0x0039) ||
      (index === 0 && code === 0x002d && length === 1)
    ) {
      result += "\\" + code.toString(16) + " ";
      continue;
    }
    if (
      code >= 0x0080 ||
      code === 0x002d ||
      code === 0x005f ||
      (code >= 0x0030 && code <= 0x0039) ||
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    ) {
      result += char;
      continue;
    }
    result += "\\" + char;
  }
  return result;
}

function findStreamElementByStreamId(streamId) {
  const safeId = cssEscapeSafe(streamId);
  if (!safeId) return null;
  const selectors = [
    `[data-stream-item-id="${safeId}"]`,
    `[data-item-id="${safeId}"]`,
    `#${safeId}`,
  ];
  for (const selector of selectors) {
    try {
      const node = document.querySelector(selector);
      if (!node) continue;
      const container = node.closest(
        'c-wiz[jsmodel*="N2jS6b"], article[jsmodel*="N2jS6b"], li[jsmodel*="N2jS6b"], c-wiz[role="listitem"], article[role="listitem"], li[role="listitem"]'
      );
      return container || node;
    } catch (error) {
      // CSS セレクタが不正の場合は次へ
    }
  }
  return null;
}

function highlightStreamElement(element) {
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("gcx-stream-highlight");
  // focus を与えてアクセシビリティも確保（失敗しても問題なし）
  try {
    if (typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }
  } catch (_err) {
    // no-op
  }
  setTimeout(() => {
    element.classList.remove("gcx-stream-highlight");
  }, 2000);
}
//itemという投稿要素からidやリンクを得て遷移する関数に渡している
async function handleSuggestionActivation(item) {
  if (!item) return;
  const courseId = normalizeWhitespace(item.courseId || "");
  const alternateLink = normalizeWhitespace(item.alternateLink || "");
  const apiId = normalizeWhitespace(item.apiId || item.apiid || "");

  const navigateTo = (link) => {
    const href = normalizeWhitespace(link || "");
    if (!href) {
      return false;
    }
    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (err) {
      console.warn("[GCX] Invalid navigation target", { href, err });
      return false;
    }
    if (url.protocol !== "https:") {
      console.warn("[GCX] Blocked non-https navigation", { href });
      return false;
    }
    if (!ALLOWED_NAV_HOSTS.has(url.hostname)) {
      console.warn("[GCX] Blocked navigation host", {
        href,
        host: url.hostname,
      });
      return false;
    }
    window.location.assign(url.toString());
    return true;
  };

  if (navigateTo(alternateLink)) {
    return;
  }

  if (apiId && courseId) {
    try {
      const data = await bgFetch({
        path: `/courses/${encodeURIComponent(
          courseId
        )}/announcements/${encodeURIComponent(apiId)}`,
      });
      const fetchedLink = normalizeWhitespace(data?.alternateLink || "");
      if (navigateTo(fetchedLink)) {
        return;
      }
    } catch (error) {
      console.warn("[GCX] Failed to resolve alternateLink via API", {
        courseId,
        apiId,
        error,
      });
    }
  }

  console.error("[GCX] No navigation target resolved via API", {
    courseId,
    apiId,
    alternateLink,
    item,
  });
}

//　ヒットしたfuseのうちitemをliに入れる。fragmentで一括で入れている。。
function createSuggestionItem(entry) {
  const item = entry?.item || {};
  const matches = entry?.matches || [];
  const attachmentLabels = deriveAttachmentLabels(item.attachments);
  const li = document.createElement("li");
  li.classList.add("suggestion-item");
  li.tabIndex = 0; // 初心者向けメモ: tabIndex を付けるとフォーカス移動できる
  li.setAttribute("role", "button");
  li.dataset.streamId = item.streamId || "";
  li.dataset.courseId = item.courseId || "";
  li.dataset.alternateLink = item.alternateLink || "";
  const ariaLabelParts = [
    item.teacherName || "",
    item.courseName && item.courseName !== item.teacherName
      ? item.courseName
      : "",
    item.postedAt?.text || "",
  ].filter(Boolean);
  if (attachmentLabels.length) {
    ariaLabelParts.push(attachmentLabels.join("/"));
  }
  if (ariaLabelParts.length) {
    li.setAttribute("aria-label", ariaLabelParts.join(" "));
  }

  const header = document.createElement("div");
  header.classList.add("suggestion-header");

  const headerMain = document.createElement("div");
  headerMain.classList.add("suggestion-header-main");

  const teacher = document.createElement("span");
  teacher.classList.add("suggestion-teacher");
  renderHighlightedText(
    teacher,
    item.teacherName || "(不明)",
    matches,
    "teacherName"
  );
  headerMain.appendChild(teacher);

  if (attachmentLabels.length) {
    const badgeGroup = document.createElement("span");
    badgeGroup.classList.add("suggestion-attachments");
    attachmentLabels.forEach((label) => {
      const badge = document.createElement("span");
      badge.classList.add("attachment-badge");
      badge.textContent = label;
      badgeGroup.appendChild(badge);
    });
    headerMain.appendChild(badgeGroup);
  }

  const time = document.createElement("time");
  time.classList.add("suggestion-time");
  time.dateTime = item.postedAt?.datetime || "";
  renderHighlightedText(
    time,
    item.postedAt?.text || "",
    matches,
    "postedAt.text"
  );

  header.append(headerMain, time);

  const body = document.createElement("div");
  body.classList.add("suggestion-body");
  renderHighlightedText(body, item.body || "", matches, "body");

  li.append(header, body);

  const activate = () => {
    void handleSuggestionActivation(item);
  };

  li.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    activate();
  });
  li.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Spacebar"
    ) {
      event.preventDefault();
      activate();
    }
  });

  return li;
}

function renderSuggestions(results) {
  const container = document.querySelector(".gcx-suggestions");
  if (!container) return;
  const list = ensureSuggestionsStructure(container);
  if (!list) return;

  list.replaceChildren();

  const wrap = list.closest(".suggestions-wrap");
  if (wrap) {
    wrap.scrollTop = 0;
  }

  const entries = toArray(results);
  if (!entries.length) {
    container.classList.remove("has-results"); //非表示や余白調整
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const li = createSuggestionItem(entry);
    if (li) {
      fragment.appendChild(li);
    }
  }

  list.appendChild(fragment);
  container.classList.add("has-results");
}

// IndexedDB からの差分同期後に、最後に入力したクエリで再検索するためのヘルパー
function rerunLastQuery() {
  if (!fuse) {
    return;
  }
  // クエリがある場合は再検索、ない場合はすべて表示
  if (lastQuery) {
    renderSuggestions(collectTopMatches(lastQuery));
  } else {
    // 検索ボックスが空の場合、最新の投稿を表示
    const allPosts = fuse.getIndex().docs || [];
    const limited = allPosts
      .slice(0, SUGGESTION_LIMIT)
      .map((item) => ({ item }));
    renderSuggestions(limited);
  }
}

// コンテンツスクリプト全体の初期化ルーチン
async function init() {
  // ★最初にService Workerを起動★
  console.log("[GCX] 🚀 Waking up Service Worker...");
  await ensureServiceWorkerReady();
  console.log("[GCX] ✓ Service Worker is active");

  ensureTopbar();
  await loadLocalLibs();
  if (API_MODE) {
    try {
      await syncStreamPosts();
    } catch (error) {
      console.warn(
        "[GCX] Initial fetch failed. API mode=false とみなします",
        error
      );
      flashRefreshError(error);
    }
  } else {
    console.info("[GCX] API mode=false (disabled)");
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

if (typeof window !== "undefined") {
  window.__gcxDebug = {
    loadStreamPostsFromDb,
    syncStreamPosts,
    getFuse: () => fuse,
    runSearchPreview: (query) => collectTopMatches(query),
    getAccountHint,
    getAccountIndex,
    getClassroomGaiaId,
    getClassroomAccountEmail,
  };
}
