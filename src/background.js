// Background service worker for Google OAuth + API fetch
// Uses chrome.identity.getAuthToken (no client_secret) and proxies API calls.

const CLASSROOM_BASE = 'https://classroom.googleapis.com/v1';
// Restrict proxy fetches to Classroom API only (must match manifest host_permissions)
const ALLOWED_API_HOSTS = new Set(['classroom.googleapis.com']);

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

async function getAuthToken({ interactive = false } = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!token) return reject(new Error('No token'));
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

async function googleFetch({
  url,
  path,
  params,
  method = 'GET',
  headers = {},
  body,
  base = CLASSROOM_BASE,
  interactiveOnRetry = true,
} = {}) {
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
    const token = await getAuthToken({ interactive: false });
    const res = await fetch(target, {
      method: 'GET',
      headers: { ...(headers || {}), Authorization: `Bearer ${token}` },
      // GET: no request body
      body: undefined,
    });
    if (res.status === 401 || res.status === 403) {
      await removeCachedToken(token);
      if (interactiveOnRetry) {
        const token2 = await getAuthToken({ interactive: true });
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
    const token = await getAuthToken({ interactive: true });
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
        const token = await getAuthToken({ interactive: !!msg.interactive });
        sendResponse({ ok: true, token });
        return;
      }

      if (msg.type === 'GCX_GOOGLE_FETCH') {
        const res = await googleFetch(msg.request || msg);
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
