// Content script entry point for Google Classroom quick search

import { gcxConsole } from "./modules/shared/utils.js";

// UI modules
import { ensureTopbar, setTopbarPlaceholder } from "./modules/content/ui/topbar.js";
import { createSuggestionItem, renderSuggestions, handleSuggestionActivation, rerunLastQuery } from "./modules/content/ui/suggestions.js";

// Data modules
import { collectTopMatches, loadLocalLibs, fuseInstance } from "./modules/content/search.js";
import { loadStreamPostsFromDb, persistStreamData, findNewPosts, findRemovedPostIds, removeStreamPostsByIds, getStreamDbName } from "./modules/content/database.js";

// Auth modules
import { ensureServiceWorkerReady, clearAllAuthTokens, forceOAuthAuthentication, cachedChannelToken, ensureChannelToken } from "./modules/content/auth.js";

// Account modules
import { AccountIdentityHelper, getAccountHint, getClassroomGaiaId, getClassroomAccountEmail, isPostForCurrentAccount, normalizeEmail } from "./modules/content/account.js";

// API modules
import { bgFetch, fetchAllAnnouncementsPosts } from "./modules/content/api.js";

// Data sync
import {
  syncStreamPosts,
  resetSearchResults,
  reloadSearchIndexForCurrentAccount,
  waitForSyncIdle,
} from "./modules/content/sync.js";

// Constants & utils
import { API_MODE, POLL_INTERVAL_MS, PLACEHOLDER_DEFAULT, PLACEHOLDER_ACCOUNT_MISMATCH, PLACEHOLDER_ACCOUNT_SWITCH_SUCCESS, PLACEHOLDER_RELOAD_REQUIRED, PLACEHOLDER_LOGIN_REQUIRED, AUTH_INIT_STATE_KEY, ACCOUNT_SWITCH_STATE_KEY, STREAM_SELECTOR_PRIMARY, STREAM_SELECTOR_FALLBACK, STREAM_ID_SELECTOR } from "./modules/content/constants.js";
import { normalizeWhitespace, formatPostedAtForJapan, normalizeAttachments, toArray } from "./modules/content/utils.js";

// Global state
let identityAccounts = [];
let lastAccountFingerprint = null;
let lastAccountKey = null;
let lastQuery = "";
let topbarObserver = null;
let topbarCheckInterval = null;
let accountSwitchCheckInterval = null;
const accountSwitchReloadedKeys = new Set();
let accountSwitchSuccessMessageActive = false;
let accountInitialized = false;

// Setup storage listener for channel token
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.prototype.hasOwnProperty.call(changes, "gcxMessageChannelToken")) {
    // Channel token updated
  }
});

function isAccountMismatchError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("account mismatch") ||
    message.includes("account key mismatch") ||
    message.includes("fingerprint mismatch")
  );
}

function resolveRefreshErrorPlaceholder(error) {
  if (!error) {
    return "同期に失敗しました";
  }
  const message = String(error?.message || error || "").toLowerCase();
  if (isAccountMismatchError(error)) {
    return PLACEHOLDER_ACCOUNT_MISMATCH;
  }
  if (/(quota|ratelimit|too many|429)/.test(message)) {
    return "アクセスが多すぎます。しばらく待ってから再試行してください";
  }
  if (["no response from background"].some((keyword) => message.includes(keyword))) {
    return PLACEHOLDER_RELOAD_REQUIRED;
  }
  if (
    [
      "getauthtoken",
      "oauth",
      "no token",
      "not authorized",
      "authorization",
      "http 401",
    ].some((keyword) => message.includes(keyword))
  ) {
    return PLACEHOLDER_LOGIN_REQUIRED;
  }
  return "同期に失敗しました";
}

function checkTopbarPresence() {
  const existing = document.getElementById("gcx-topbar-overlay");
  if (!existing || !document.body.contains(existing)) {
    gcxConsole.debug("[GCX] Topbar missing, re-injecting");
    ensureTopbar(uiHandlers);
  }
}

function setupTopbarObserver() {
  if (topbarObserver) return;

  topbarObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (
          node.id === "gcx-topbar-overlay" ||
          (node.contains && node.contains(document.getElementById("gcx-topbar-overlay")))
        ) {
          gcxConsole.debug("[GCX] Topbar removed by DOM mutation, re-injecting");
          ensureTopbar(uiHandlers);
          return;
        }
      }
    }
  });

  topbarObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function setupTopbarCheckInterval() {
  if (topbarCheckInterval) return;
  topbarCheckInterval = setInterval(checkTopbarPresence, 30000);
}

function setupAccountSwitchDetection() {
  if (accountSwitchCheckInterval) return;

  const checkAccountSwitch = () => {
    void detectAccountSwitch("interval");
  };

  accountSwitchCheckInterval = setInterval(checkAccountSwitch, 1500);
  window.addEventListener("focus", () => {
    void detectAccountSwitch("focus");
  });
}

async function readAuthInitState() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([AUTH_INIT_STATE_KEY], (items) => {
        if (chrome.runtime.lastError) {
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
      resolve({});
    }
  });
}

async function writeAuthInitState(state) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [AUTH_INIT_STATE_KEY]: state }, () => {
        resolve();
      });
    } catch (err) {
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
}

async function readAccountSwitchState() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([ACCOUNT_SWITCH_STATE_KEY], (items) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        const raw = items?.[ACCOUNT_SWITCH_STATE_KEY];
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          resolve({ ...raw });
        } else {
          resolve({});
        }
      });
    } catch (err) {
      resolve({});
    }
  });
}

async function writeAccountSwitchState(state) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [ACCOUNT_SWITCH_STATE_KEY]: state }, () => {
        resolve();
      });
    } catch (err) {
      resolve();
    }
  });
}

function getAccountSnapshot() {
  const fingerprint = AccountIdentityHelper.getFingerprint();
  const accountKey = AccountIdentityHelper.getCompositeKey();
  const gaiaId = getClassroomGaiaId();
  const email = getClassroomAccountEmail();
  return {
    fingerprint,
    accountKey,
    gaiaId,
    email,
    hasSignal: Boolean(gaiaId || email),
  };
}

function applyAccountSwitchSuccessPlaceholder() {
  if (accountSwitchSuccessMessageActive) {
    setTopbarPlaceholder(PLACEHOLDER_ACCOUNT_SWITCH_SUCCESS);
  }
}

async function handleAccountSwitchReload(previousState, currentSnapshot) {
  if (!currentSnapshot.hasSignal) {
    return false;
  }

  const previousFingerprint = previousState?.fingerprint || null;
  const previousAccountKey = previousState?.accountKey || null;

  if (!previousFingerprint && !previousAccountKey) {
    return false;
  }

  const switched =
    (previousFingerprint && previousFingerprint !== currentSnapshot.fingerprint) ||
    (previousAccountKey && previousAccountKey !== currentSnapshot.accountKey);

  if (!switched) {
    return false;
  }

  const attemptKey = `${previousFingerprint || "none"}->${currentSnapshot.fingerprint || "none"}`;
  if (accountSwitchReloadedKeys.has(attemptKey)) {
    return false;
  }
  accountSwitchReloadedKeys.add(attemptKey);

  accountSwitchSuccessMessageActive = false;
  setTopbarPlaceholder("アカウント切り替えを検知しました...");

  let succeeded = false;
  try {
    await ensureIdentityAccounts({ force: true });
    await reloadSearchIndexForCurrentAccount({
      loadStreamPostsFromDb,
      rerunLastQuery: () =>
        rerunLastQuery(
          lastQuery,
          collectTopMatches,
          (results) => renderSuggestions(results, uiHandlers),
          uiHandlers
        ),
    });
    await waitForSyncIdle();
    await syncStreamPosts(
      {
        source: "account-switch",
        lastAccountFingerprint: previousFingerprint,
        lastAccountKey: previousAccountKey,
        identityAccounts,
        keepPlaceholder: true,
      },
      syncDependencies
    );
    accountSwitchSuccessMessageActive = true;
    succeeded = true;
    setTopbarPlaceholder(PLACEHOLDER_ACCOUNT_SWITCH_SUCCESS);
  } catch (err) {
    accountSwitchSuccessMessageActive = false;
    setTopbarPlaceholder(resolveRefreshErrorPlaceholder(err));
  } finally {
    if (succeeded) {
      lastAccountFingerprint = currentSnapshot.fingerprint;
      lastAccountKey = currentSnapshot.accountKey;
      await writeAccountSwitchState({
        fingerprint: currentSnapshot.fingerprint,
        accountKey: currentSnapshot.accountKey,
        updatedAt: Date.now(),
      });
    }
  }

  return true;
}

async function detectAccountSwitch(reason) {
  const currentSnapshot = getAccountSnapshot();
  const previousState = {
    fingerprint: lastAccountFingerprint,
    accountKey: lastAccountKey,
  };

  const switched = await handleAccountSwitchReload(previousState, currentSnapshot);
  if (!switched && currentSnapshot.hasSignal) {
    if (
      currentSnapshot.fingerprint !== lastAccountFingerprint ||
      currentSnapshot.accountKey !== lastAccountKey
    ) {
      lastAccountFingerprint = currentSnapshot.fingerprint;
      lastAccountKey = currentSnapshot.accountKey;
    }
    await writeAccountSwitchState({
      fingerprint: currentSnapshot.fingerprint,
      accountKey: currentSnapshot.accountKey,
      updatedAt: Date.now(),
    });
  }

  if (reason === "initial") {
    applyAccountSwitchSuccessPlaceholder();
  }
}

async function ensureIdentityAccounts({ force = false } = {}) {
  if (identityAccounts.length && !force) return identityAccounts;

  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    gcxConsole.warn("[GCX] Failed to obtain channel token for identity list", err);
    return identityAccounts;
  }

  try {
    const accounts = await new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve([]);
      }, 10000);

      chrome.runtime.sendMessage(
        { type: "GCX_IDENTITY_LIST", channelToken },
        (res) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            resolve([]);
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
    gcxConsole.debug("[GCX] failed to load identity accounts", err);
  }
  return identityAccounts;
}

// UI handlers object
const uiHandlers = {
  onSearchInput: (event) => {
    const query = event.target.value.trim();
    lastQuery = query;
    renderSuggestions(collectTopMatches(query), uiHandlers);
  },
  onInputFocus: (value) => {
    if (value) {
      renderSuggestions(collectTopMatches(value), uiHandlers);
    }
  },
  onRefreshClick: async () => {
    if (!API_MODE) {
      throw new Error("API mode disabled");
    }
    setTopbarPlaceholder("認証中...");
    try {
      await clearAllAuthTokens();
      await forceOAuthAuthentication(getAccountHint(identityAccounts), identityAccounts);
      gcxConsole.log("[GCX] OAuth re-authentication completed");
    } catch (authErr) {
      gcxConsole.error("[GCX] OAuth re-authentication failed:", authErr);
      setTopbarPlaceholder("認証に失敗しました");
      throw authErr;
    }

    setTopbarPlaceholder("データを取得中...");
    await syncStreamPosts(buildSyncOptions({ source: "manual" }), syncDependencies);
    applyAccountSwitchSuccessPlaceholder();
    setTopbarPlaceholder("");
  },
  flashRefreshError: (err) => {
    const button = document.querySelector(".gcx-refresh-btn");
    if (!button) return;
    button.classList.add("is-error");
    setTopbarPlaceholder(resolveRefreshErrorPlaceholder(err));
    if (window.__refreshErrorTimerId) {
      clearTimeout(window.__refreshErrorTimerId);
    }
    window.__refreshErrorTimerId = window.setTimeout(() => {
      button.classList.remove("is-error");
      window.__refreshErrorTimerId = null;
      setTopbarPlaceholder(PLACEHOLDER_DEFAULT);
    }, 1500);
  },
  setTopbarPlaceholder,
  handleSuggestionActivation: (item) =>
    handleSuggestionActivation(item, uiHandlers),
  bgFetch,
  getAccountHint: () => getAccountHint(identityAccounts),
  renderSuggestions,
  collectTopMatches,
  fuseInstance,
};

// Sync dependencies object
const syncDependencies = {
  ensureIdentityAccounts,
  getAccountHint: () => getAccountHint(identityAccounts),
  fetchAllAnnouncementsPosts: () =>
    fetchAllAnnouncementsPosts(
      normalizeAttachments,
      formatPostedAtForJapan,
      getAccountHint(identityAccounts)
    ),
  loadStreamPostsFromDb,
  persistStreamData,
  findNewPosts,
  findRemovedPostIds,
  removeStreamPostsByIds,
  clearAllAuthTokens,
  forceOAuthAuthentication,
  AccountIdentityHelper,
  setTopbarPlaceholder,
  renderSuggestions: (results) => renderSuggestions(results, uiHandlers),
  isAccountMismatchError,
  rerunLastQuery: () =>
    rerunLastQuery(lastQuery, collectTopMatches, (results) => renderSuggestions(results, uiHandlers), uiHandlers),
};

function buildSyncOptions(extra = {}) {
  return {
    lastAccountFingerprint,
    lastAccountKey,
    identityAccounts,
    ...extra,
  };
}

async function observe() {
  ensureTopbar(uiHandlers);
  setupTopbarObserver();
  setupTopbarCheckInterval();

  let switchedOnLoad = false;
  try {
    await ensureIdentityAccounts({ force: true });
    const storedSwitchState = await readAccountSwitchState();
    const snapshot = getAccountSnapshot();
    if (storedSwitchState.fingerprint || storedSwitchState.accountKey) {
      lastAccountFingerprint = storedSwitchState.fingerprint || null;
      lastAccountKey = storedSwitchState.accountKey || null;
      switchedOnLoad = await handleAccountSwitchReload(storedSwitchState, snapshot);
    } else {
      lastAccountFingerprint = snapshot.fingerprint;
      lastAccountKey = snapshot.accountKey;
      await writeAccountSwitchState({
        fingerprint: snapshot.fingerprint,
        accountKey: snapshot.accountKey,
        updatedAt: Date.now(),
      });
    }

    const initialFingerprint = snapshot.fingerprint;
    accountInitialized = true;
    gcxConsole.log("[GCX] Account initialized:", {
      fingerprint: initialFingerprint,
      index: AccountIdentityHelper.getIndexNumber(),
      gaiaId: getClassroomGaiaId(),
      email: getClassroomAccountEmail(),
      dbName: getStreamDbName(),
    });

    const accountKey = AccountIdentityHelper.getCompositeKey();
    if (switchedOnLoad && accountSwitchSuccessMessageActive) {
      await markAuthInitialized(accountKey);
    }
    const alreadyInitialized =
      switchedOnLoad && accountSwitchSuccessMessageActive
        ? true
        : await isAuthInitializedForKey(accountKey);

    if (!alreadyInitialized) {
      gcxConsole.log("[GCX] 🔓 Requesting initial OAuth authentication...");
      try {
        await forceOAuthAuthentication(getAccountHint(identityAccounts), identityAccounts);
        gcxConsole.log("[GCX] ✓ Initial OAuth authentication successful");
        await markAuthInitialized(accountKey);
      } catch (authErr) {
        gcxConsole.error("[GCX] ❌ Initial OAuth authentication failed:", authErr);
        if (isAccountMismatchError(authErr)) {
          setTopbarPlaceholder(PLACEHOLDER_ACCOUNT_MISMATCH);
        } else {
          setTopbarPlaceholder(
            "認証に失敗しました。更新ボタンをクリックしてください。"
          );
        }
      }
    } else {
      gcxConsole.log("[GCX] OAuth already initialized for account key:", accountKey);
    }
  } catch (err) {
    gcxConsole.warn("[GCX] Failed to initialize account info", err);
  }

  setupAccountSwitchDetection();

  if (!switchedOnLoad) {
    void syncStreamPosts(buildSyncOptions(), syncDependencies)
      .then(() => {
        applyAccountSwitchSuccessPlaceholder();
      })
      .catch((err) => {
      if (
        err &&
        err.message &&
        err.message.includes("Extension context invalidated")
      ) {
        gcxConsole.warn(
          "[GCX] Extension context invalidated. Please reload the page."
        );
        setTopbarPlaceholder(
          "拡張機能が更新されました。ページをリロードしてください。"
        );
        return;
      }

      gcxConsole.warn("[GCX] Periodic fetch failed", err);
      uiHandlers.flashRefreshError(err);
    });
  }

  if (POLL_INTERVAL_MS > 0) {
    setInterval(() => {
      checkTopbarPresence();

      void syncStreamPosts(buildSyncOptions(), syncDependencies)
        .then(() => {
          applyAccountSwitchSuccessPlaceholder();
        })
        .catch((err) => {
        if (
          err &&
          err.message &&
          err.message.includes("Extension context invalidated")
        ) {
          gcxConsole.warn(
            "[GCX] Extension context invalidated. Please reload the page."
          );
          setTopbarPlaceholder(
            "拡張機能が更新されました。ページをリロードしてください。"
          );
          return;
        }

        gcxConsole.warn("[GCX] Periodic fetch failed", err);
        uiHandlers.flashRefreshError(err);
      });
    }, POLL_INTERVAL_MS);
  }
}

async function init() {
  gcxConsole.log("[GCX] 🚀 Waking up Service Worker...");
  await ensureServiceWorkerReady();
  gcxConsole.log("[GCX] ✓ Service Worker is active");

  ensureTopbar(uiHandlers);
  await loadLocalLibs();
  if (!API_MODE) {
    gcxConsole.info("[GCX] API mode=false (disabled)");
  }
  await reloadSearchIndexForCurrentAccount({
    loadStreamPostsFromDb,
    rerunLastQuery: () =>
      rerunLastQuery(
        lastQuery,
        collectTopMatches,
        (results) => renderSuggestions(results, uiHandlers),
        uiHandlers
      ),
  });
  observe();
  gcxConsole.debug("[GCX] search input injection initialized");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

if (typeof window !== "undefined") {
  window.__gcxDebug = {
    loadStreamPostsFromDb,
    syncStreamPosts: (opts) => syncStreamPosts(opts, syncDependencies),
    getFuse: () => fuseInstance,
    runSearchPreview: (query) => collectTopMatches(query),
    getAccountHint: () => getAccountHint(identityAccounts),
    getClassroomGaiaId,
    getClassroomAccountEmail,
  };
}
