import nodeTest from "node:test";
import assert from "node:assert/strict";
import { syncStreamPosts } from "../src/modules/content/sync.js";
import { PLACEHOLDER_DEFAULT } from "../src/modules/content/constants.js";

const test = globalThis.test ?? nodeTest;

function createDeps(overrides = {}) {
  return {
    ensureIdentityAccounts: async () => [],
    getAccountHint: () => ({
      fingerprint: "fp-current",
      accountKey: "u0-gabc",
    }),
    fetchAllAnnouncementsPosts: async () => [],
    loadStreamPostsFromDb: async () => [],
    persistStreamData: async () => ({ stored: 0, posts: [] }),
    findNewPosts: () => [],
    findRemovedPostIds: () => [],
    removeStreamPostsByIds: async () => 0,
    clearAllAuthTokens: async () => {},
    forceOAuthAuthentication: async () => "token",
    AccountIdentityHelper: {
      getFingerprint: () => "fp-current",
      getCompositeKey: () => "u0-gabc",
    },
    setTopbarPlaceholder: () => {},
    renderSuggestions: () => {},
    isAccountMismatchError: () => false,
    rerunLastQuery: () => {},
    ...overrides,
  };
}

test("同期終了時はデフォルトのプレーステキストに戻る", async () => {
  const calls = [];
  const deps = createDeps({
    setTopbarPlaceholder: (value) => calls.push(value),
  });

  await syncStreamPosts({}, deps);
  assert.equal(calls.at(-1), PLACEHOLDER_DEFAULT);
});

test("keepPlaceholder指定時はプレーステキストを上書きしない", async () => {
  const calls = [];
  const deps = createDeps({
    setTopbarPlaceholder: (value) => calls.push(value),
  });

  await syncStreamPosts({ keepPlaceholder: true }, deps);
  assert.equal(calls.length, 0);
});
