// Utility functions for background service worker

import { gcxConsole } from "../shared/utils.js";

export function assertAllowedTarget(target, allowedHosts) {
  let url;
  try {
    url = new URL(target);
  } catch (err) {
    throw new Error(`Invalid URL: ${String(target)}`);
  }
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS is allowed");
  }
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`);
  }
  return url.toString();
}

export function buildUrl(base, pathOrUrl, params) {
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

export function deriveSessionKey(sender, accountHint) {
  const tabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
  const frameId = typeof sender?.frameId === "number" ? sender.frameId : null;
  const accountKey =
    accountHint?.accountKey || accountHint?.fingerprint || "anon";
  const tabPart = tabId !== null ? `tab${tabId}` : "bg";
  const framePart = frameId !== null ? `-frame${frameId}` : "";
  return `${tabPart}${framePart}:${accountKey}`;
}

export function isPermanentOAuthConfigError(message) {
  if (!message || typeof message !== "string") return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("bad client id") ||
    normalized.includes("redirect_uri_mismatch") ||
    normalized.includes("invalid client") ||
    normalized.includes("oauth2 client id")
  );
}
