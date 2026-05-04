// Channel token management for content script communication

import { gcxConsole, CHANNEL_TOKEN_KEY, CHANNEL_TOKEN_LENGTH } from "../shared/utils.js";

export function generateChannelToken() {
  const array = new Uint8Array(CHANNEL_TOKEN_LENGTH / 2);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function ensureChannelToken() {
  const cached = await readChannelTokenFromStorage();
  if (cached && typeof cached === "string" && cached.length >= CHANNEL_TOKEN_LENGTH) {
    return cached;
  }

  const newToken = generateChannelToken();
  await writeChannelTokenToStorage(newToken);
  return newToken;
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

function writeChannelTokenToStorage(token) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [CHANNEL_TOKEN_KEY]: token }, () => {
        if (chrome.runtime.lastError) {
          gcxConsole.debug("[GCX] writeChannelToken failed", chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (err) {
      gcxConsole.debug("[GCX] writeChannelToken threw", err);
      resolve();
    }
  });
}

export function setupChannelTokenListener(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (Object.prototype.hasOwnProperty.call(changes, CHANNEL_TOKEN_KEY)) {
      const next = changes[CHANNEL_TOKEN_KEY]?.newValue;
      if (typeof next === "string" && next.length >= CHANNEL_TOKEN_LENGTH) {
        callback(next);
      } else {
        callback(null);
      }
    }
  });
}
