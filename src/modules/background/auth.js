// OAuth authentication management

import { gcxConsole, createSimpleHash, normalizeEmail } from "../shared/utils.js";
import { ensureSessionState, resetSessionState } from "./session.js";
import { rememberToken, removeCachedToken } from "./token-manager.js";
import { listIdentityAccounts } from "./account.js";
import { isPermanentOAuthConfigError } from "./utils.js";

export async function resolveAccountFromHint(accountHint) {
  const accounts = await listIdentityAccounts();
  if (!accounts.length) {
    gcxConsole.warn("[GCX] ⚠️ No accounts available in Identity API");
    return { account: null, accounts };
  }

  gcxConsole.log("[GCX] 🔍 Resolving account from hint:", accountHint);
  gcxConsole.log(
    "[GCX] 📋 Available accounts:",
    accounts.map((a) => ({ id: a.id, email: a.email }))
  );

  if (accountHint && typeof accountHint === "object") {
    const { gaiaId, email, index } = accountHint;

    // Search by GAIA ID
    if (gaiaId) {
      gcxConsole.log("[GCX] 🔎 Searching by gaiaId:", gaiaId);
      const matchById = accounts.find((acc) => acc?.id === gaiaId);
      if (matchById) {
        gcxConsole.log("[GCX] ✓ Found account by gaiaId:", matchById.email);
        return { account: matchById, accounts };
      } else {
        gcxConsole.warn("[GCX] ⚠️ No match found for gaiaId:", gaiaId);
      }
    } else {
      gcxConsole.log("[GCX] ℹ️ No gaiaId provided in hint");
    }

    // Search by email
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      gcxConsole.log("[GCX] 🔎 Searching by email:", normalizedEmail);
      const matchByEmail = accounts.find(
        (acc) => normalizeEmail(acc?.email) === normalizedEmail
      );
      if (matchByEmail) {
        gcxConsole.log("[GCX] ✓ Found account by email:", matchByEmail.email);
        return { account: matchByEmail, accounts };
      } else {
        gcxConsole.warn("[GCX] ⚠️ No match found for email:", normalizedEmail);
      }
    } else {
      gcxConsole.log("[GCX] ℹ️ No email provided in hint");
    }

    // Search by index
    if (typeof index === "number" && index >= 0 && index < accounts.length) {
      gcxConsole.log(
        "[GCX] 🔎 Using account by index:",
        index,
        "->",
        accounts[index]?.email || accounts[index]?.id
      );
      return { account: accounts[index], accounts };
    } else {
      gcxConsole.warn(
        "[GCX] ⚠️ Invalid index:",
        index,
        "accounts length:",
        accounts.length
      );
    }
  } else {
    gcxConsole.warn("[GCX] ⚠️ accountHint is invalid:", typeof accountHint);
  }

  gcxConsole.warn("[GCX] ❌ Could not resolve account from hint, using default");
  return { account: null, accounts };
}

export async function getAuthToken(
  classroomBase,
  allowedHosts,
  oauthScopeHash,
  tokenCache,
  sessionStateStore,
  {
    interactive = false,
    accountHint,
    sessionKey,
  } = {}
) {
  const normalizedSessionKey = sessionKey || "sw::global";
  const sessionState = ensureSessionState(sessionStateStore, normalizedSessionKey);

  const incomingFingerprint = accountHint?.fingerprint || null;
  if (
    incomingFingerprint &&
    sessionState.lastFingerprint &&
    incomingFingerprint !== sessionState.lastFingerprint
  ) {
    gcxConsole.log("[GCX] 🔄 Account switch detected in background!");
    gcxConsole.log("[GCX] Previous fingerprint:", sessionState.lastFingerprint);
    gcxConsole.log("[GCX] New fingerprint:", incomingFingerprint);
    // Account switch detected - tokens will be cleared by content script
    resetSessionState(sessionStateStore, normalizedSessionKey);
    sessionState.lastFingerprint = incomingFingerprint;
    gcxConsole.log("[GCX] ✓ Session reset for account switch");
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
      gcxConsole.log(
        "[GCX] 🎯 Using account for token:",
        resolvedAccount.email || resolvedAccount.id
      );
      if (
        sessionState.lastAccountId &&
        sessionState.lastAccountId !== resolvedAccount.id
      ) {
        gcxConsole.log("[GCX] 🔄 Account ID changed, clearing old session tokens");
        resetSessionState(sessionStateStore, normalizedSessionKey);
        if (incomingFingerprint) {
          sessionState.lastFingerprint = incomingFingerprint;
        }
      }
    } else {
      gcxConsole.warn("[GCX] ⚠️ Could not resolve account, using default");
      gcxConsole.warn("[GCX] 📋 Hint was:", JSON.stringify(accountHint, null, 2));
    }
  }

  if (!interactive && !sessionState.hasActiveToken) {
    gcxConsole.log(
      "[GCX] No cached token for session. Switching to interactive flow."
    );
    interactive = true;
  }

  if (interactive && sessionState.authBlockReason) {
    throw new Error(sessionState.authBlockReason);
  }

  const token = await new Promise((resolve, reject) => {
    try {
      const details = { interactive };
      if (accountParam) {
        details.account = accountParam;
      }

      chrome.identity.getAuthToken(details, (value) => {
        if (chrome.runtime.lastError) {
          const runtimeMessage = chrome.runtime.lastError.message || "";
          if (isPermanentOAuthConfigError(runtimeMessage)) {
            sessionState.authBlockReason = `OAuth configuration error: ${runtimeMessage}`;
          }
          gcxConsole.error(
            "[GCX] getAuthToken error:",
            runtimeMessage
          );
          reject(new Error(runtimeMessage));
          return;
        }
        if (!value) {
          gcxConsole.error("[GCX] No token returned");
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
    scopeKey: oauthScopeHash,
    accountKey: accountHint?.accountKey || null,
  };

  if (accountInfo.id) {
    sessionState.lastAccountId = accountInfo.id;
  }
  sessionState.hasActiveToken = true;
  rememberToken(tokenCache, normalizedSessionKey, accountInfo.id, token, oauthScopeHash);

  if (interactive) {
    gcxConsole.log("[GCX] ✓ Successfully obtained token via interactive auth");
  } else {
    gcxConsole.log(
      "[GCX] Successfully obtained token for account:",
      accountInfo.id || "default"
    );
  }

  return { token, account: accountInfo };
}

export function getAuthTokenSingleFlight(
  authInFlightStore,
  tokenCache,
  sessionStateStore,
  classroomBase,
  allowedHosts,
  oauthScopeHash,
  options = {}
) {
  const key = options.sessionKey || "sw::global";
  const existing = authInFlightStore.get(key);
  if (existing) return existing;

  const task = getAuthToken(
    classroomBase,
    allowedHosts,
    oauthScopeHash,
    tokenCache,
    sessionStateStore,
    options
  ).finally(() => {
    if (authInFlightStore.get(key) === task) {
      authInFlightStore.delete(key);
    }
  });
  authInFlightStore.set(key, task);
  return task;
}

export async function invalidateAccountToken(tokenCache, sessionStateStore, oauthScopeHash, account, { revoke = false } = {}) {
  if (!account?.id) return;
  try {
    const { invalidateTokensForAccountId } = require("./token-manager.js");
    await invalidateTokensForAccountId(tokenCache, sessionStateStore, oauthScopeHash, account.id, { revoke });
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
            gcxConsole.log(
              "[GCX] 🗑️ Removing cached token for account:",
              account.email || account.id
            );
            await removeCachedToken(tokenCache, sessionStateStore, oauthScopeHash, token, { revoke });
          }
          resolve();
        }
      );
    });
  } catch (err) {
    gcxConsole.debug("[GCX] invalidateAccountToken failed", err);
  }
}

export async function invalidateAllAccountTokens(tokenCache, sessionStateStore, { revoke = false } = {}) {
  gcxConsole.log("[GCX] 🗑️ Invalidating all account tokens...");
  const cachedTokens = [...tokenCache.values()].map((record) => record.token);
  tokenCache.clear();
  for (const key of sessionStateStore.keys()) {
    resetSessionState(sessionStateStore, key);
  }
  const { clearAllCachedTokens } = require("./token-manager.js");
  await clearAllCachedTokens(tokenCache, sessionStateStore);
  const accounts = await listIdentityAccounts();
  for (const account of accounts) {
    await invalidateAccountToken(tokenCache, sessionStateStore, "", account, { revoke });
  }
  gcxConsole.log("[GCX] ✓ All account tokens invalidated");
}
