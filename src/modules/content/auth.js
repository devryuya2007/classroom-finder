// OAuth authentication for content script

import { gcxConsole, CHANNEL_TOKEN_KEY, CHANNEL_TOKEN_LENGTH } from "../shared/utils.js";

export let cachedChannelToken = null;
let channelTokenPromise = null;

export async function ensureChannelToken() {
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

function isValidChannelToken(value) {
  return typeof value === "string" && value.length >= CHANNEL_TOKEN_LENGTH;
}

function readChannelTokenFromStorage() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([CHANNEL_TOKEN_KEY], (items) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(items?.[CHANNEL_TOKEN_KEY] || null);
      });
    } catch (err) {
      resolve(null);
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

export async function ensureServiceWorkerReady() {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (i === 0) gcxConsole.log("[GCX] 🏓 Checking Service Worker...");

      let channelToken;
      try {
        channelToken = await ensureChannelToken();
      } catch (error) {
        gcxConsole.error("[GCX] ⚠️ Failed to obtain channel token", error);
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

              if (
                errorMsg.includes("Extension context invalidated") ||
                errorMsg.includes("Receiving end does not exist")
              ) {
                gcxConsole.error(
                  "[GCX] ❌ Extension was reloaded. Please reload this page!"
                );
              }
              resolve(false);
            } else if (
              response?.pong &&
              response?.extensionName === "Classroom-Finder" &&
              response?.extensionId === chrome.runtime.id
            ) {
              if (i === 0) {
                gcxConsole.log("[GCX] ✓ Service Worker ready");
              }
              resolve(true);
            } else if (response?.pong) {
              if (i === 0) {
                gcxConsole.warn(
                  "[GCX] ⚠️ Response from different extension, retrying..."
                );
              }
              resolve(false);
            } else {
              gcxConsole.log("[GCX] ⚠️ Unexpected response:", response);
              resolve(false);
            }
          }
        );
      });

      if (ready) return true;

      const delay = 500 * Math.pow(2, i);
      gcxConsole.log(`[GCX]    Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      gcxConsole.log("[GCX] ⚠️ Service Worker ping error:", err);
    }
  }

  gcxConsole.error(
    "[GCX] ❌ Service Worker did not respond after",
    maxRetries,
    "retries"
  );
  return false;
}

export async function clearAllAuthTokens() {
  await ensureServiceWorkerReady();

  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    gcxConsole.warn("[GCX] Failed to obtain channel token for clear tokens", err);
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
            gcxConsole.warn("[GCX] Failed to clear tokens:", runtimeError.message);
            resolve();
            return;
          }
          gcxConsole.log("[GCX] ✓ All cached tokens cleared");
          resolve();
        }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      gcxConsole.warn("[GCX] Clear tokens error:", err);
      resolve();
    }
  });
}

export async function forceOAuthAuthentication(accountHint, identityAccounts) {
  await ensureServiceWorkerReady();

  gcxConsole.log("[GCX] Forcing OAuth authentication for account:", accountHint);

  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    throw new Error(
      `Failed to obtain channel token for OAuth authentication: ${err?.message || err}`
    );
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("OAuth authentication timeout (30s)"));
    }, 30000);

    try {
      chrome.runtime.sendMessage(
        {
          type: "GCX_GOOGLE_GET_TOKEN",
          interactive: true,
          accountHint,
          channelToken,
        },
        (res) => {
          clearTimeout(timeoutId);

          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            gcxConsole.error(
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
          gcxConsole.log("[GCX] ✓ OAuth authentication successful");
          resolve(res.token);
        }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}
