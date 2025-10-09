// Background service worker for Google OAuth + API fetch
// Uses chrome.identity.getAuthToken (no client_secret) and proxies API calls.

const CLASSROOM_BASE = "https://classroom.googleapis.com/v1";
// Restrict proxy fetches to Classroom API only (must match manifest host_permissions)
const ALLOWED_API_HOSTS = new Set(["classroom.googleapis.com"]);
// OAuth 設定は manifest.json とリンクしているので、ここで読み込んでおく。
// 初心者ポイント: manifest を変更したら、ここも自動で反映される仕組みだよ。
const manifest = chrome.runtime.getManifest();
const OAUTH2_CLIENT_ID = manifest?.oauth2?.client_id || null;
const OAUTH2_SCOPES = Array.isArray(manifest?.oauth2?.scopes)
  ? [...manifest.oauth2.scopes]
  : [];
const OAUTH_REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`;
const OAUTH_SCOPE_HASH = (() => {
  const sorted = [...OAUTH2_SCOPES].sort();
  return createSimpleHash(sorted.join(" ") || "default-scope");
})();
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i;
const CHANNEL_TOKEN_KEY = "gcxMessageChannelToken";
const CHANNEL_TOKEN_LENGTH = 64;

let channelTokenCache = null;
let channelTokenLoading = null;
// タブ ID + アカウント ID + スコープごとにトークンを分けて保存する箱。
// 「上書きして別人のデータが見える」事故をここでガードするよ。
const tokenCache = new Map();
// セッション（タブ）ごとの状態管理。どの指紋/アカウントを握っているかを記録する。
const sessionStateStore = new Map();

// 超シンプルなハッシュ関数（djb2 風）。scope の組み合わせを短いキーにする用途だよ。
function createSimpleHash(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function ensureSessionKey(sessionKey) {
  return sessionKey || "sw::global";
}

function ensureSessionState(sessionKey) {
  const key = ensureSessionKey(sessionKey);
  if (!sessionStateStore.has(key)) {
    sessionStateStore.set(key, {
      lastAccountId: null,
      lastFingerprint: null,
      hasActiveToken: false,
    });
  }
  return sessionStateStore.get(key);
}

function resetSessionState(sessionKey) {
  const state = ensureSessionState(sessionKey);
  state.lastAccountId = null;
  state.hasActiveToken = false;
}

function buildTokenStoreKey(sessionKey, accountId) {
  const normalizedSession = ensureSessionKey(sessionKey);
  const normalizedAccount = accountId || "default";
  return `${normalizedSession}:${normalizedAccount}:${OAUTH_SCOPE_HASH}`;
}

function rememberToken(sessionKey, accountId, token) {
  const key = buildTokenStoreKey(sessionKey, accountId);
  tokenCache.set(key, {
    token,
    accountId: accountId || null,
    sessionKey: ensureSessionKey(sessionKey),
  });
}

function deleteTokenByValue(tokenValue) {
  if (!tokenValue) return [];
  const affectedSessions = new Set();
  for (const [key, record] of tokenCache.entries()) {
    if (record.token === tokenValue) {
      tokenCache.delete(key);
      affectedSessions.add(record.sessionKey);
    }
  }
  return [...affectedSessions];
}

async function revokeAuthToken(token) {
  if (!token) return;
  const revokeUrl = `https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(
    token
  )}`;
  try {
    await fetch(revokeUrl, { method: "GET", mode: "cors" });
  } catch (err) {
    console.debug("[GCX] Token revoke request failed", err);
  }
}

async function removeCachedToken(token, { revoke = false } = {}) {
  if (!token) return;
  const sessions = deleteTokenByValue(token);
  sessions.forEach((sessionKey) => {
    resetSessionState(sessionKey);
  });
  await new Promise((resolve) => {
    try {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        resolve();
      });
    } catch (_err) {
      resolve();
    }
  });
  if (revoke) {
    await revokeAuthToken(token);
  }
}

async function invalidateTokensForAccountId(accountId, { revoke = false } = {}) {
  if (!accountId) return;
  const tokensToDelete = [];
  for (const record of tokenCache.values()) {
    if (record.accountId === accountId) {
      tokensToDelete.push(record.token);
    }
  }
  for (const token of tokensToDelete) {
    await removeCachedToken(token, { revoke });
  }
}

async function forgetTokensForSession(sessionKey, { revoke = false } = {}) {
  const normalizedKey = ensureSessionKey(sessionKey);
  const tokensToDelete = [];
  for (const record of tokenCache.values()) {
    if (record.sessionKey === normalizedKey) {
      tokensToDelete.push(record.token);
    }
  }
  for (const token of tokensToDelete) {
    await removeCachedToken(token, { revoke });
  }
}

function generateChannelToken() {
  const array = new Uint8Array(CHANNEL_TOKEN_LENGTH / 2);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

async function ensureChannelToken() {
  if (channelTokenCache) return channelTokenCache;
  if (channelTokenLoading) return channelTokenLoading;

  channelTokenLoading = (async () => {
    const token = await new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get([CHANNEL_TOKEN_KEY], (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          let existing = items?.[CHANNEL_TOKEN_KEY];
          if (
            typeof existing === "string" &&
            existing.length >= CHANNEL_TOKEN_LENGTH
          ) {
            resolve(existing);
            return;
          }

          const nextToken = generateChannelToken();
          chrome.storage.local.set({ [CHANNEL_TOKEN_KEY]: nextToken }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(nextToken);
          });
        });
      } catch (err) {
        reject(err);
      }
    });

    channelTokenCache = token;
    return token;
  })();

  try {
    return await channelTokenLoading;
  } finally {
    channelTokenLoading = null;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.prototype.hasOwnProperty.call(changes, CHANNEL_TOKEN_KEY)) {
    const next = changes[CHANNEL_TOKEN_KEY]?.newValue;
    if (typeof next === "string" && next.length >= CHANNEL_TOKEN_LENGTH) {
      channelTokenCache = next;
    } else {
      channelTokenCache = null;
    }
  }
});

async function listIdentityAccounts() {
  if (!chrome.identity?.getAccounts) return [];
  return new Promise((resolve) => {
    try {
      chrome.identity.getAccounts((accounts) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[GCX] getAccounts failed",
            chrome.runtime.lastError.message
          );
          resolve([]);
          return;
        }
        if (Array.isArray(accounts)) {
          resolve(accounts);
        } else {
          resolve([]);
        }
      });
    } catch (err) {
      console.warn("[GCX] getAccounts threw", err);
      resolve([]);
    }
  });
}

async function getProfileInfoForAccount(account) {
  if (!account?.id)
    return { id: account?.id || null, email: account?.email || null };
  return new Promise((resolve) => {
    try {
      const details = { account: { id: account.id } };
      chrome.identity.getProfileUserInfo(details, (info) => {
        if (chrome.runtime.lastError) {
          resolve({ id: account.id, email: account.email || null });
          return;
        }
        resolve({
          id: info?.id || account.id,
          email: info?.email || account.email || null,
        });
      });
    } catch (err) {
      console.debug("[GCX] getProfileUserInfo failed", err);
      resolve({ id: account.id, email: account.email || null });
    }
  });
}

async function listIdentityAccountsWithProfiles() {
  const accounts = await listIdentityAccounts();
  const enriched = [];
  for (const account of accounts) {
    const profile = await getProfileInfoForAccount(account);
    enriched.push({
      id: profile.id || account.id || null,
      email: profile.email || account.email || null,
    });
  }
  return enriched;
}

function assertAllowedTarget(target) {
  let url;
  try {
    url = new URL(target);
  } catch (err) {
    throw new Error(`Invalid URL: ${String(target)}`);
  }
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS is allowed");
  }
  if (!ALLOWED_API_HOSTS.has(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`);
  }
  return url.toString();
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : null;
}

async function resolveAccountFromHint(accountHint) {
  const accounts = await listIdentityAccounts();
  if (!accounts.length) {
    console.warn("[GCX] ⚠️ No accounts available in Identity API");
    return { account: null, accounts };
  }

  console.log("[GCX] 🔍 Resolving account from hint:", accountHint);
  console.log(
    "[GCX] 📋 Available accounts:",
    accounts.map((a) => ({ id: a.id, email: a.email }))
  );

  if (accountHint && typeof accountHint === "object") {
    const { gaiaId, email, index } = accountHint;

    // GAIA IDで検索
    if (gaiaId) {
      console.log("[GCX] 🔎 Searching by gaiaId:", gaiaId);
      const matchById = accounts.find((acc) => acc?.id === gaiaId);
      if (matchById) {
        console.log("[GCX] ✓ Found account by gaiaId:", matchById.email);
        return { account: matchById, accounts };
      } else {
        console.warn("[GCX] ⚠️ No match found for gaiaId:", gaiaId);
      }
    } else {
      console.log("[GCX] ℹ️ No gaiaId provided in hint");
    }

    // メールアドレスで検索
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      console.log("[GCX] 🔎 Searching by email:", normalizedEmail);
      const matchByEmail = accounts.find(
        (acc) => normalizeEmail(acc?.email) === normalizedEmail
      );
      if (matchByEmail) {
        console.log("[GCX] ✓ Found account by email:", matchByEmail.email);
        return { account: matchByEmail, accounts };
      } else {
        console.warn("[GCX] ⚠️ No match found for email:", normalizedEmail);
      }
    } else {
      console.log("[GCX] ℹ️ No email provided in hint");
    }

    // インデックスで検索
    if (typeof index === "number" && index >= 0 && index < accounts.length) {
      console.log(
        "[GCX] 🔎 Using account by index:",
        index,
        "->",
        accounts[index]?.email || accounts[index]?.id
      );
      return { account: accounts[index], accounts };
    } else {
      console.warn(
        "[GCX] ⚠️ Invalid index:",
        index,
        "accounts length:",
        accounts.length
      );
    }
  } else {
    console.warn("[GCX] ⚠️ accountHint is invalid:", typeof accountHint);
  }

  console.warn("[GCX] ❌ Could not resolve account from hint, using default");
  return { account: null, accounts };
}

// アカウント別のトークンを無効化
async function invalidateAccountToken(account, { revoke = false } = {}) {
  if (!account?.id) return;
  try {
    await invalidateTokensForAccountId(account.id, { revoke });
    await new Promise((resolve) => {
      chrome.identity.getAuthToken(
        { interactive: false, account: { id: account.id } },
        async (token) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            resolve();
            return;
          }
          if (token) {
            console.log(
              "[GCX] 🗑️ Removing cached token for account:",
              account.email || account.id
            );
            await removeCachedToken(token, { revoke });
          }
          resolve();
        }
      );
    });
  } catch (err) {
    console.debug("[GCX] invalidateAccountToken failed", err);
  }
}

// 全アカウントのトークンを無効化（アカウント切り替え時）
async function invalidateAllAccountTokens({ revoke = false } = {}) {
  console.log("[GCX] 🗑️ Invalidating all account tokens...");
  const cachedTokens = [...tokenCache.values()].map((record) => record.token);
  tokenCache.clear();
  for (const key of sessionStateStore.keys()) {
    resetSessionState(key);
  }
  for (const token of cachedTokens) {
    await removeCachedToken(token, { revoke });
  }
  const accounts = await listIdentityAccounts();
  for (const account of accounts) {
    await invalidateAccountToken(account, { revoke });
  }
  console.log("[GCX] ✓ All account tokens invalidated");
}

// launchWebAuthFlow で「アカウント選択 + consent」を必ず踏ませる補助関数。
// 初心者メモ: ここで prompt=select_account consent を付けておかないと、
// Chrome が前回のアカウントを勝手に再利用してしまうよ。
async function runInteractiveConsentFlow({
  accountHint,
  resolvedAccount,
  sessionKey,
}) {
  if (!OAUTH2_CLIENT_ID || !OAUTH2_SCOPES.length) return;
  const params = new URLSearchParams({
    client_id: OAUTH2_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account consent",
    scope: OAUTH2_SCOPES.join(" "),
    state: `${ensureSessionKey(sessionKey)}:${Date.now()}`,
  });
  if (typeof accountHint?.index === "number") {
    params.set("authuser", String(accountHint.index));
  }
  const emailHint = normalizeEmail(
    accountHint?.email || resolvedAccount?.email || ""
  );
  if (emailHint) {
    params.set("login_hint", emailHint);
  }

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  await new Promise((resolve, reject) => {
    try {
      chrome.identity.launchWebAuthFlow(
        { url, interactive: true },
        (redirectUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!redirectUrl) {
            reject(new Error("Consent flow aborted"));
            return;
          }
          resolve(redirectUrl);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

async function getAuthToken({
  interactive = false,
  accountHint,
  sessionKey,
} = {}) {
  const normalizedSessionKey = ensureSessionKey(sessionKey);
  const sessionState = ensureSessionState(normalizedSessionKey);

  const incomingFingerprint = accountHint?.fingerprint || null;
  if (
    incomingFingerprint &&
    sessionState.lastFingerprint &&
    incomingFingerprint !== sessionState.lastFingerprint
  ) {
    console.log("[GCX] 🔄 Account switch detected in background!");
    console.log("[GCX] Previous fingerprint:", sessionState.lastFingerprint);
    console.log("[GCX] New fingerprint:", incomingFingerprint);
    await invalidateAllAccountTokens({ revoke: true });
    await clearAllCachedTokens();
    resetSessionState(normalizedSessionKey);
    sessionState.lastFingerprint = incomingFingerprint;
    console.log("[GCX] ✓ Token invalidation completed");
  }
  if (incomingFingerprint) {
    sessionState.lastFingerprint = incomingFingerprint;
  }

  let accountParam;
  let resolvedAccount = null;

  if (accountHint) {
    const result = await resolveAccountFromHint(accountHint);
    resolvedAccount = result.account;
    if (resolvedAccount?.id) {
      accountParam = { id: resolvedAccount.id };
      console.log(
        "[GCX] 🎯 Using account for token:",
        resolvedAccount.email || resolvedAccount.id
      );
      if (
        sessionState.lastAccountId &&
        sessionState.lastAccountId !== resolvedAccount.id
      ) {
        console.log("[GCX] 🔄 Account ID changed, clearing old session tokens");
        await forgetTokensForSession(normalizedSessionKey, { revoke: true });
        resetSessionState(normalizedSessionKey);
        if (incomingFingerprint) {
          sessionState.lastFingerprint = incomingFingerprint;
        }
      }
    } else {
      console.warn("[GCX] ⚠️ Could not resolve account, using default");
      console.warn("[GCX] 📋 Hint was:", JSON.stringify(accountHint, null, 2));
    }
  }

  if (!interactive && !sessionState.hasActiveToken) {
    console.log(
      "[GCX] No cached token for session. Switching to interactive flow."
    );
    interactive = true;
  }

  if (interactive) {
    await runInteractiveConsentFlow({
      accountHint,
      resolvedAccount,
      sessionKey: normalizedSessionKey,
    });
  }

  const token = await new Promise((resolve, reject) => {
    try {
      const details = { interactive };
      if (accountParam) {
        details.account = accountParam;
      }

      chrome.identity.getAuthToken(details, (value) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[GCX] getAuthToken error:",
            chrome.runtime.lastError.message
          );
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!value) {
          console.error("[GCX] No token returned");
          reject(new Error("No token"));
          return;
        }
        resolve(value);
      });
    } catch (err) {
      reject(err);
    }
  });

  const accountInfo = {
    id: resolvedAccount?.id || null,
    email: resolvedAccount?.email || null,
    fingerprint: incomingFingerprint || null,
    sessionKey: normalizedSessionKey,
    scopeKey: OAUTH_SCOPE_HASH,
    accountKey: accountHint?.accountKey || null,
  };

  if (accountInfo.id) {
    sessionState.lastAccountId = accountInfo.id;
  }
  sessionState.hasActiveToken = true;
  rememberToken(normalizedSessionKey, accountInfo.id, token);

  if (interactive) {
    console.log("[GCX] ✓ Successfully obtained token via interactive auth");
  } else {
    console.log(
      "[GCX] Successfully obtained token for account:",
      accountInfo.id || "default"
    );
  }

  return { token, account: accountInfo };
}

async function clearAllCachedTokens() {
  console.log("[GCX] 🧹 Starting to clear all cached tokens...");
  tokenCache.clear();
  for (const key of sessionStateStore.keys()) {
    resetSessionState(key);
  }
  return new Promise((resolve) => {
    try {
      chrome.identity.clearAllCachedAuthTokens(() => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[GCX] Failed to clear cached tokens",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("[GCX] ✓ Cleared all cached OAuth tokens");
        }
        // トークンクリア後、確実に反映されるまで少し待つ
        setTimeout(() => {
          console.log("[GCX] ✓ Token cache clear operation completed");
          resolve();
        }, 500); // 0.5秒待機
      });
    } catch (err) {
      console.warn("[GCX] clearAllCachedAuthTokens threw", err);
      resolve();
    }
  });
}

function buildUrl(base, pathOrUrl, params) {
  // Accept absolute URL or path
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const url = new URL(
    isAbsolute
      ? pathOrUrl
      : base.replace(/\/$/, "") + "/" + pathOrUrl.replace(/^\//, "")
  );
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function googleFetch(request = {}, accountHint, { sessionKey } = {}) {
  const {
    url,
    path,
    params,
    method = "GET",
    headers = {},
    body,
    base = CLASSROOM_BASE,
    interactiveOnRetry = true,
  } = request;

  console.log("[GCX] 📡 API Request:", path || url);

  // Build and validate target URL strictly for Classroom API only
  const rawTarget = url || buildUrl(base, path || "", params);
  const target = assertAllowedTarget(rawTarget);

  // Only allow safe HTTP method
  const methodUpper = String(method || "GET").toUpperCase();
  if (methodUpper !== "GET") {
    throw new Error(`Method not allowed: ${methodUpper}`);
  }

  function buildHeadersWithAccount(tokenValue) {
    const computedHeaders = {
      ...(headers || {}),
      Authorization: `Bearer ${tokenValue}`,
    };
    if (accountHint?.fingerprint) {
      computedHeaders["X-GCX-Account-Fingerprint"] =
        String(accountHint.fingerprint).slice(0, 64);
    }
    if (accountHint?.email) {
      computedHeaders["X-GCX-Account-Email"] = String(
        normalizeEmail(accountHint.email) || accountHint.email
      );
    }
    if (accountHint?.accountKey) {
      computedHeaders["X-GCX-Account-Key"] = String(
        accountHint.accountKey
      ).slice(0, 128);
    }
    return computedHeaders;
  }

  // Try silent first, then one interactive retry if unauthorized
  try {
    let tokenRecord = await getAuthToken({
      interactive: false,
      accountHint,
      sessionKey,
    });
    let res = await fetch(target, {
      method: "GET",
      headers: buildHeadersWithAccount(tokenRecord.token),
      // GET: no request body
      body: undefined,
    });

    if (res.status === 401 || res.status === 403) {
      console.warn("[GCX] Got 401/403, removing token and retrying");
      await removeCachedToken(tokenRecord.token, { revoke: true });
      if (interactiveOnRetry) {
        tokenRecord = await getAuthToken({
          interactive: true,
          accountHint,
          sessionKey,
        });
        res = await fetch(target, {
          method: "GET",
          headers: buildHeadersWithAccount(tokenRecord.token),
          body: undefined,
        });
      }
    }
    return { response: res, tokenInfo: tokenRecord };
  } catch (_err) {
    // Fallback: interactive fetch once
    const tokenRecord = await getAuthToken({
      interactive: true,
      accountHint,
      sessionKey,
    });
    const response = await fetch(target, {
      method: "GET",
      headers: buildHeadersWithAccount(tokenRecord.token),
      body: undefined,
    });
    return { response, tokenInfo: tokenRecord };
  }
}

// タブ ID / frame ID / accountKey を組み合わせて「セッションキー」を作る。
// これで同じ拡張でもタブごとに別セッション扱いになる。
function deriveSessionKey(sender, accountHint) {
  const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
  const frameId = typeof sender?.frameId === "number" ? sender.frameId : null;
  const accountKey =
    accountHint?.accountKey || accountHint?.fingerprint || "anon";
  const tabPart = tabId !== null ? `tab${tabId}` : "bg";
  const framePart = frameId !== null ? `-frame${frameId}` : "";
  return `${tabPart}${framePart}:${accountKey}`;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("═══════════════════════════════════════");
  console.log("[GCX] 🔔 MESSAGE LISTENER TRIGGERED!");
  console.log("═══════════════════════════════════════");
  console.log("[GCX] 📦 Message object:", msg);
  console.log("[GCX] 👤 Sender:", sender);
  console.log("═══════════════════════════════════════");

  // メッセージチャンネルを開いたままにする
  (async () => {
    try {
      console.log("[GCX] 📨 Message received:", msg?.type);

      if (!msg || typeof msg !== "object") {
        sendResponse({ ok: false, error: "Invalid message format" });
        return;
      }

      // Only accept messages from our own extension
      if (sender && sender.id && sender.id !== chrome.runtime.id) {
        sendResponse({ ok: false, error: "Invalid sender" });
        return;
      }

      if (msg.type === "GCX_GET_CHANNEL_TOKEN") {
        try {
          const token = await ensureChannelToken();
          sendResponse({
            ok: true,
            channelToken: token,
            extensionId: chrome.runtime.id,
          });
        } catch (error) {
          console.error("[GCX] GET_CHANNEL_TOKEN error:", error);
          sendResponse({
            ok: false,
            error: String((error && error.message) || error),
          });
        }
        return;
      }

      let channelToken;
      try {
        channelToken = await ensureChannelToken();
      } catch (error) {
        console.error("[GCX] Channel token unavailable", error);
        sendResponse({
          ok: false,
          error: "Channel token unavailable",
        });
        return;
      }

      if (msg.channelToken !== channelToken) {
        console.warn("[GCX] Rejected message with invalid channel token");
        sendResponse({ ok: false, error: "Invalid channel token" });
        return;
      }

      // Ping handler to wake up Service Worker
      if (msg.type === "PING") {
        console.log("🏓🏓🏓 PING RECEIVED! 🏓🏓🏓");
        console.log("[GCX] Responding with pong...");
        sendResponse({
          ok: true,
          pong: true,
          extensionName: "Classroom-Finder",
          extensionId: chrome.runtime.id,
          timestamp: Date.now(),
        });
        console.log("✅ PING response sent!");
        return;
      }

      // Clear all cached tokens handler
      if (msg.type === "GCX_CLEAR_TOKENS") {
        console.log("[GCX] 🧹 Clearing all cached tokens...");
        try {
          await clearAllCachedTokens();
          sendResponse({ ok: true });
        } catch (error) {
          console.error("[GCX] CLEAR_TOKENS error:", error);
          sendResponse({
            ok: false,
            error: String((error && error.message) || error),
          });
        }
        return;
      }

      if (msg.type === "GCX_GOOGLE_GET_TOKEN") {
        console.log(
          "[GCX] 🔐 GET_TOKEN request, interactive:",
          !!msg.interactive
        );
        try {
          const sessionKey = deriveSessionKey(sender, msg.accountHint);
          const tokenRecord = await getAuthToken({
            interactive: !!msg.interactive,
            accountHint: msg.accountHint,
            sessionKey,
          });
          console.log(
            "[GCX] ✓ Token obtained, length:",
            tokenRecord?.token?.length || 0
          );
          sendResponse({
            ok: true,
            token: tokenRecord.token,
            account: tokenRecord.account,
          });
        } catch (error) {
          console.error("[GCX] GET_TOKEN error:", error);
          sendResponse({
            ok: false,
            error: String((error && error.message) || error),
          });
        }
        // return を削除（sendResponse 後に async 関数が終了するのを防ぐ）
      } else if (msg.type === "GCX_IDENTITY_LIST") {
        try {
          const accounts = await listIdentityAccountsWithProfiles();
          sendResponse({ ok: true, accounts });
        } catch (error) {
          console.error("[GCX] IDENTITY_LIST error:", error);
          sendResponse({
            ok: false,
            error: String((error && error.message) || error),
          });
        }
        // return を削除
      } else if (msg.type === "GCX_GOOGLE_FETCH") {
        try {
          console.log("[GCX] 📥 Processing GOOGLE_FETCH request");
          const sessionKey = deriveSessionKey(sender, msg.accountHint);
          const { response, tokenInfo } = await googleFetch(
            msg.request || {},
            msg.accountHint,
            { sessionKey }
          );
          const ct = response.headers.get("content-type") || "";
          let data = null;

          if (ct.includes("application/json")) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          console.log(
            "[GCX] ✓ GOOGLE_FETCH completed, status:",
            response.status
          );
          sendResponse({
            ok: response.ok,
            status: response.status,
            data,
            account: tokenInfo?.account || null,
          });
        } catch (error) {
          console.error("[GCX] GOOGLE_FETCH error:", error);
          sendResponse({
            ok: false,
            error: String((error && error.message) || error),
          });
        }
        // return を削除
      } else {
        // Unknown message type
        sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error("[GCX] background message handler error", error);
      sendResponse({
        ok: false,
        error: String((error && error.message) || error),
      });
    }
  })();

  return true; // keep the message channel open for async response
});

// Optional: simple ping to ensure SW is alive in dev
console.log("═══════════════════════════════════════");
console.log("🚀🚀🚀 SERVICE WORKER STARTED! 🚀🚀🚀");
console.log("═══════════════════════════════════════");
console.log("[GCX] background service worker loaded");
console.log("[GCX] Extension ID:", chrome.runtime.id);
console.log(
  "[GCX] Required OAuth Redirect URI:",
  `https://${chrome.runtime.id}.chromiumapp.org/`
);
console.log("═══════════════════════════════════════");

// 起動時にトークンをクリア（非同期）
(async () => {
  await clearAllCachedTokens();
  console.log("[GCX] Ready for OAuth authentication");
})();
