// API proxy for Google Classroom

import { gcxConsole } from "../shared/utils.js";
import { buildUrl, assertAllowedTarget } from "./utils.js";
import { rememberToken } from "./token-manager.js";

export async function googleFetch(
  classroomBase,
  allowedHosts,
  oauthScopeHash,
  tokenCache,
  getAuthTokenSingleFlightFn,
  request = {},
  accountHint,
  { sessionKey } = {}
) {
  const {
    url,
    path,
    params,
    method = "GET",
    headers = {},
    body,
    base = classroomBase,
    interactiveOnRetry = true,
  } = request;

  gcxConsole.log("[GCX] 📡 API Request:", path || url);

  // Build and validate target URL strictly for Classroom API only
  const rawTarget = url || buildUrl(base, path || "", params);
  const target = assertAllowedTarget(rawTarget, allowedHosts);

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
      const { normalizeEmail } = require("../shared/utils.js");
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
    let tokenRecord = await getAuthTokenSingleFlightFn({
      interactive: false,
      accountHint,
      sessionKey,
    });
    let res = await fetch(target, {
      method: "GET",
      headers: buildHeadersWithAccount(tokenRecord.token),
      body: undefined,
    });

    if (res.status === 401 || res.status === 403) {
      gcxConsole.warn("[GCX] Got 401/403, removing token and retrying");
      const { removeCachedToken } = require("./token-manager.js");
      await removeCachedToken(tokenCache, {}, oauthScopeHash, tokenRecord.token, { revoke: true });
      if (interactiveOnRetry) {
        tokenRecord = await getAuthTokenSingleFlightFn({
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
    const tokenRecord = await getAuthTokenSingleFlightFn({
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
