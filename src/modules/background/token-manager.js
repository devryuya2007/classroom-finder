// Token cache management

import { gcxConsole } from "../shared/utils.js";
import { ensureSessionKey, resetSessionState } from "./session.js";

export function buildTokenStoreKey(sessionKey, accountId, oauthScopeHash) {
  const normalizedSession = ensureSessionKey(sessionKey);
  const normalizedAccount = accountId || "default";
  return `${normalizedSession}:${normalizedAccount}:${oauthScopeHash}`;
}

export function rememberToken(tokenCache, sessionKey, accountId, token, oauthScopeHash) {
  const key = buildTokenStoreKey(sessionKey, accountId, oauthScopeHash);
  tokenCache.set(key, {
    token,
    accountId: accountId || null,
    sessionKey: ensureSessionKey(sessionKey),
  });
}

export function deleteTokenByValue(tokenCache, tokenValue) {
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

export async function revokeAuthToken(token) {
  if (!token) return;
  const revokeUrl = `https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(
    token
  )}`;
  try {
    await fetch(revokeUrl, { method: "GET", mode: "cors" });
  } catch (err) {
    gcxConsole.debug("[GCX] Token revoke request failed", err);
  }
}

export async function removeCachedToken(tokenCache, sessionStateStore, oauthScopeHash, token, { revoke = false } = {}) {
  if (!token) return;
  const sessions = deleteTokenByValue(tokenCache, token);
  sessions.forEach((sessionKey) => {
    resetSessionState(sessionStateStore, sessionKey);
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

export async function invalidateTokensForAccountId(tokenCache, sessionStateStore, oauthScopeHash, accountId, { revoke = false } = {}) {
  if (!accountId) return;
  const tokensToDelete = [];
  for (const record of tokenCache.values()) {
    if (record.accountId === accountId) {
      tokensToDelete.push(record.token);
    }
  }
  for (const token of tokensToDelete) {
    await removeCachedToken(tokenCache, sessionStateStore, oauthScopeHash, token, { revoke });
  }
}

export async function forgetTokensForSession(tokenCache, sessionStateStore, oauthScopeHash, sessionKey, { revoke = false } = {}) {
  const normalizedKey = ensureSessionKey(sessionKey);
  const tokensToDelete = [];
  for (const record of tokenCache.values()) {
    if (record.sessionKey === normalizedKey) {
      tokensToDelete.push(record.token);
    }
  }
  for (const token of tokensToDelete) {
    await removeCachedToken(tokenCache, sessionStateStore, oauthScopeHash, token, { revoke });
  }
}

export async function clearAllCachedTokens(tokenCache, sessionStateStore) {
  gcxConsole.log("[GCX] 🧹 Starting to clear all cached tokens...");
  tokenCache.clear();
  for (const key of sessionStateStore.keys()) {
    resetSessionState(sessionStateStore, key);
  }
  return new Promise((resolve) => {
    try {
      chrome.identity.clearAllCachedAuthTokens(() => {
        if (chrome.runtime.lastError) {
          gcxConsole.warn(
            "[GCX] Failed to clear cached tokens",
            chrome.runtime.lastError.message
          );
        } else {
          gcxConsole.log("[GCX] ✓ Cleared all cached OAuth tokens");
        }
        // Wait a bit to ensure token clear is reflected
        setTimeout(() => {
          gcxConsole.log("[GCX] ✓ Token cache clear operation completed");
          resolve();
        }, 500);
      });
    } catch (err) {
      gcxConsole.warn("[GCX] clearAllCachedAuthTokens threw", err);
      resolve();
    }
  });
}
