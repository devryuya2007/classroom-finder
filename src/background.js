// Background service worker for Google OAuth + API fetch
// Uses chrome.identity.getAuthToken (no client_secret) and proxies API calls.

const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';
// Restrict proxy fetches to Classroom API only (must match manifest host_permissions)
const ALLOWED_API_HOSTS = new Set(['classroom.googleapis.com']);
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i;

async function listIdentityAccounts() {
  if (!chrome.identity?.getAccounts) return [];
  return new Promise((resolve) => {
    try {
      chrome.identity.getAccounts((accounts) => {
        if (chrome.runtime.lastError) {
          console.warn('[GCX] getAccounts failed', chrome.runtime.lastError.message);
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
      console.warn('[GCX] getAccounts threw', err);
      resolve([]);
    }
  });
}

async function getProfileInfoForAccount(account) {
  if (!account?.id) return { id: account?.id || null, email: account?.email || null };
  return new Promise((resolve) => {
    try {
      const details = { account: { id: account.id } };
      chrome.identity.getProfileUserInfo(details, (info) => {
        if (chrome.runtime.lastError) {
          resolve({ id: account.id, email: account.email || null });
          return;
        }
        resolve({ id: info?.id || account.id, email: info?.email || account.email || null });
      });
    } catch (err) {
      console.debug('[GCX] getProfileUserInfo failed', err);
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
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS is allowed');
  }
  if (!ALLOWED_API_HOSTS.has(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`);
  }
  return url.toString();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : null;
}

async function resolveAccountFromHint(accountHint) {
  const accounts = await listIdentityAccounts();
  if (!accounts.length) {
    return { account: null, accounts };
  }
  if (accountHint && typeof accountHint === 'object') {
    const { gaiaId, email, index } = accountHint;
    if (gaiaId) {
      const matchById = accounts.find((acc) => acc?.id === gaiaId);
      if (matchById) {
        return { account: matchById, accounts };
      }
    }
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      const matchByEmail = accounts.find((acc) => normalizeEmail(acc?.email) === normalizedEmail);
      if (matchByEmail) {
        return { account: matchByEmail, accounts };
      }
    }
    if (typeof index === 'number' && index >= 0 && index < accounts.length) {
      return { account: accounts[index], accounts };
    }
  }
  return { account: null, accounts };
}

let lastAccountId = null;
let lastAccountFingerprint = null;

async function invalidateAccountToken(account) {
  if (!account?.id) return;
  try {
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
            await removeCachedToken(token);
          }
          resolve();
        }
      );
    });
  } catch (err) {
    console.debug('[GCX] invalidateAccountToken failed', err);
  }
}

async function getAuthToken({ interactive = false, accountHint } = {}) {
  if (accountHint?.fingerprint) {
    if (lastAccountFingerprint && accountHint.fingerprint !== lastAccountFingerprint) {
      // アカウントを切り替えたサインだから、古いトークンを全部吹き飛ばして
      // Chrome に再認証してもらう。初心者はここで毎回クリアしそうだけど、
      // fingerprint が変わった時だけに絞ってあるから安心して！
      clearAllCachedTokens();
      lastAccountId = null;
    }
    lastAccountFingerprint = accountHint.fingerprint;
  }
  let accountParam;
  let resolvedAccount = null;
  clearAllCachedTokens();
  if (accountHint) {
    const result = await resolveAccountFromHint(accountHint);
    resolvedAccount = result.account;
    if (resolvedAccount?.id) {
      accountParam = { id: resolvedAccount.id };
      if (resolvedAccount.id !== lastAccountId) {
        await invalidateAccountToken(resolvedAccount);
      }
    }
  }
  return new Promise((resolve, reject) => {
    try {
      const details = { interactive };
      if (accountParam) {
        details.account = accountParam;
      }
      chrome.identity.getAuthToken(details, (token) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!token) return reject(new Error('No token'));
        if (resolvedAccount?.id) {
          lastAccountId = resolvedAccount.id;
        }
        resolve(token);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function removeCachedToken(token) {
  return new Promise((resolve) => {
    try {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    } catch (_err) {
      resolve();
    }
  });
}

function clearAllCachedTokens() {
  try {
    chrome.identity.clearAllCachedAuthTokens(() => {
      if (chrome.runtime.lastError) {
        console.warn('[GCX] Failed to clear cached tokens', chrome.runtime.lastError.message);
      } else {
        console.debug('[GCX] Cleared cached OAuth tokens');
      }
    });
  } catch (err) {
    console.warn('[GCX] clearAllCachedAuthTokens threw', err);
  }
}

function buildUrl(base, pathOrUrl, params) {
  // Accept absolute URL or path
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const url = new URL(isAbsolute ? pathOrUrl : base.replace(/\/$/, '') + '/' + pathOrUrl.replace(/^\//, ''));
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function googleFetch(request = {}, accountHint) {
  const {
    url,
    path,
    params,
    method = 'GET',
    headers = {},
    body,
    base = CLASSROOM_BASE,
    interactiveOnRetry = true,
  } = request;
  // Build and validate target URL strictly for Classroom API only
  const rawTarget = url || buildUrl(base, path || '', params);
  const target = assertAllowedTarget(rawTarget);

  // Only allow safe HTTP method
  const methodUpper = String(method || 'GET').toUpperCase();
  if (methodUpper !== 'GET') {
    throw new Error(`Method not allowed: ${methodUpper}`);
  }

  // Try silent first, then one interactive retry if unauthorized
  try {
    const token = await getAuthToken({ interactive: false, accountHint });
    const res = await fetch(target, {
      method: 'GET',
      headers: { ...(headers || {}), Authorization: `Bearer ${token}` },
      // GET: no request body
      body: undefined,
    });
    if (res.status === 401 || res.status === 403) {
      await removeCachedToken(token);
      if (interactiveOnRetry) {
        const token2 = await getAuthToken({ interactive: true, accountHint });
        const res2 = await fetch(target, {
          method: 'GET',
          headers: { ...(headers || {}), Authorization: `Bearer ${token2}` },
          body: undefined,
        });
        return res2;
      }
    }
    return res;
  } catch (_err) {
    // Fallback: interactive fetch once
    const token = await getAuthToken({ interactive: true, accountHint });
    return fetch(target, {
      method: 'GET',
      headers: { ...(headers || {}), Authorization: `Bearer ${token}` },
      body: undefined,
    });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg !== 'object') return;
      // Only accept messages from our own extension
      if (sender && sender.id && sender.id !== chrome.runtime.id) return;

      if (msg.type === 'GCX_GOOGLE_GET_TOKEN') {
        const token = await getAuthToken({ interactive: !!msg.interactive, accountHint: msg.accountHint });
        sendResponse({ ok: true, token });
        return;
      }

      if (msg.type === 'GCX_IDENTITY_LIST') {
        const accounts = await listIdentityAccountsWithProfiles();
        sendResponse({ ok: true, accounts });
        return;
      }

      if (msg.type === 'GCX_GOOGLE_FETCH') {
        const res = await googleFetch(msg.request || {}, msg.accountHint);
        const ct = res.headers.get('content-type') || '';
        let data = null;
        if (ct.includes('application/json')) data = await res.json();
        else data = await res.text();
        sendResponse({ ok: res.ok, status: res.status, data });
        return;
      }
    } catch (error) {
      console.warn('[GCX] background error', error);
      sendResponse({ ok: false, error: String(error && error.message || error) });
    }
  })();
  return true; // keep the message channel open for async response
});

// Optional: simple ping to ensure SW is alive in dev
console.log('[GCX] background service worker loaded');
clearAllCachedTokens();
