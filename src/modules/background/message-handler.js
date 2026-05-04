// Message handler for background service worker

import { gcxConsole, CHANNEL_TOKEN_LENGTH } from "../shared/utils.js";
import { ensureChannelToken } from "./channel.js";

export async function handleMessage(msg, sender, sendResponse, handlers) {
  gcxConsole.log("═══════════════════════════════════════");
  gcxConsole.log("[GCX] 🔔 MESSAGE LISTENER TRIGGERED!");
  gcxConsole.log("═══════════════════════════════════════");
  gcxConsole.log("[GCX] 📦 Message object:", msg);
  gcxConsole.log("[GCX] 👤 Sender:", sender);
  gcxConsole.log("═══════════════════════════════════════");

  try {
    gcxConsole.log("[GCX] 📨 Message received:", msg?.type);

    if (!msg || typeof msg !== "object") {
      sendResponse({ ok: false, error: "Invalid message format" });
      return;
    }

    // Only accept messages from own extension
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
        gcxConsole.error("[GCX] GET_CHANNEL_TOKEN error:", error);
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
      gcxConsole.error("[GCX] Channel token unavailable", error);
      sendResponse({
        ok: false,
        error: "Channel token unavailable",
      });
      return;
    }

    if (msg.channelToken !== channelToken) {
      gcxConsole.warn("[GCX] Rejected message with invalid channel token");
      sendResponse({ ok: false, error: "Invalid channel token" });
      return;
    }

    // Ping handler to wake up Service Worker
    if (msg.type === "PING") {
      gcxConsole.log("🏓🏓🏓 PING RECEIVED! 🏓🏓🏓");
      gcxConsole.log("[GCX] Responding with pong...");
      sendResponse({
        ok: true,
        pong: true,
        extensionName: "Classroom-Finder",
        extensionId: chrome.runtime.id,
        timestamp: Date.now(),
      });
      gcxConsole.log("✅ PING response sent!");
      return;
    }

    // Route to handler
    if (handlers[msg.type]) {
      await handlers[msg.type](msg, sender, sendResponse);
    } else {
      sendResponse({ ok: false, error: "Unknown message type" });
    }
  } catch (error) {
    gcxConsole.error("[GCX] background message handler error", error);
    sendResponse({
      ok: false,
      error: String((error && error.message) || error),
    });
  }
}

export function setupMessageListener(handlers) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      await handleMessage(msg, sender, sendResponse, handlers);
    })();
    return true; // keep the message channel open for async response
  });
}
