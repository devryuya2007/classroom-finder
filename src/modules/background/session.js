// Session state management for background service worker

export function ensureSessionKey(sessionKey) {
  return sessionKey || "sw::global";
}

export function ensureSessionState(sessionStateStore, sessionKey) {
  const key = ensureSessionKey(sessionKey);
  if (!sessionStateStore.has(key)) {
    sessionStateStore.set(key, {
      lastAccountId: null,
      lastFingerprint: null,
      hasActiveToken: false,
      authBlockReason: null,
    });
  }
  return sessionStateStore.get(key);
}

export function resetSessionState(sessionStateStore, sessionKey) {
  const state = ensureSessionState(sessionStateStore, sessionKey);
  state.lastAccountId = null;
  state.hasActiveToken = false;
  state.authBlockReason = null;
}
