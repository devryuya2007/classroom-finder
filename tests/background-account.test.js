import nodeTest from "node:test";
import assert from "node:assert/strict";
import { getAuthToken, resolveAccountFromHint } from "../src/modules/background/auth.js";

const test = globalThis.test ?? nodeTest;

function setupChromeAccounts(accounts, profiles = {}) {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      lastError: null,
    },
    identity: {
      getAccounts(callback) {
        callback(accounts);
      },
      getProfileUserInfo(details, callback) {
        callback(profiles[details?.account?.id] || {});
      },
    },
  };
  return () => {
    globalThis.chrome = previousChrome;
  };
}

function setupChromeAuth({ accounts = [], profiles = {}, token = "token" } = {}) {
  const previousChrome = globalThis.chrome;
  const authRequests = [];

  globalThis.chrome = {
    runtime: {
      lastError: null,
    },
    identity: {
      getAccounts(callback) {
        callback(accounts);
      },
      getProfileUserInfo(details, callback) {
        callback(profiles[details?.account?.id] || {});
      },
      getAuthToken(details, callback) {
        authRequests.push(details);
        callback(token);
      },
    },
  };

  return {
    authRequests,
    restore() {
      globalThis.chrome = previousChrome;
    },
  };
}

test("backgroundはGAIAとemailが食い違う場合にemailを優先してアカウント解決する", async () => {
  const restore = setupChromeAccounts([
    { id: "old-gaia", email: "old@example.com" },
    { id: "current-gaia", email: "current@example.com" },
  ]);

  try {
    const result = await resolveAccountFromHint({
      gaiaId: "old-gaia",
      email: "current@example.com",
      index: 0,
    });

    assert.deepEqual(result.account, {
      id: "current-gaia",
      email: "current@example.com",
    });
  } finally {
    restore();
  }
});

test("backgroundはprofile補完したemailでアカウント解決する", async () => {
  const restore = setupChromeAccounts([{ id: "current-gaia" }], {
    "current-gaia": {
      id: "current-gaia",
      email: "current@example.com",
    },
  });

  try {
    const result = await resolveAccountFromHint({
      email: "current@example.com",
      index: 0,
    });

    assert.deepEqual(result.account, {
      id: "current-gaia",
      email: "current@example.com",
    });
  } finally {
    restore();
  }
});

test("backgroundはIdentityで解決不能な場合もhint由来のaccount情報を返す", async () => {
  const chromeStub = setupChromeAuth();
  const tokenCache = new Map();
  const sessionStateStore = new Map();

  try {
    const result = await getAuthToken(
      "https://classroom.googleapis.com/v1",
      new Set(["classroom.googleapis.com"]),
      "scope-hash",
      tokenCache,
      sessionStateStore,
      {
        interactive: true,
        accountHint: {
          gaiaId: "111111111111",
          email: "current@example.com",
          accountKey: "u0-mcurrent",
          fingerprint: "mcurrent",
        },
        sessionKey: "tab1:u0-mcurrent",
      },
    );

    assert.equal(result.token, "token");
    assert.deepEqual(result.account, {
      id: "111111111111",
      email: "current@example.com",
      fingerprint: "mcurrent",
      sessionKey: "tab1:u0-mcurrent",
      scopeKey: "scope-hash",
      accountKey: "u0-mcurrent",
      source: "hint",
    });
    assert.deepEqual(chromeStub.authRequests, [{ interactive: true }]);
  } finally {
    chromeStub.restore();
  }
});
