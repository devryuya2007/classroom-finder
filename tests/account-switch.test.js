import nodeTest from "node:test";
import assert from "node:assert/strict";
import { syncStreamPosts } from "../src/modules/content/sync.js";
import {
  collectTopMatches,
  getCurrentSearchDocs,
  initFuse,
} from "../src/modules/content/search.js";
import {
  AccountIdentityHelper,
  isPostForCurrentAccount,
} from "../src/modules/content/account.js";
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

function setupAccountDom({ href, gaiaId }) {
  globalThis.window = {
    location: { href },
    WIZ_global_data: { S06Grb: gaiaId },
  };
  globalThis.document = {
    querySelector: () => null,
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

test("アカウントIDはメール正規化せず現在アカウントと照合する", () => {
  setupAccountDom({
    href: "https://classroom.google.com/u/0/c/test",
    gaiaId: "111111111111",
  });

  const currentAccountKey = AccountIdentityHelper.getCompositeKey();
  const currentFingerprint = AccountIdentityHelper.getFingerprint();

  assert.equal(
    isPostForCurrentAccount({
      accountKey: currentAccountKey,
      accountFingerprint: currentFingerprint,
    }),
    true
  );
  assert.equal(
    isPostForCurrentAccount({
      accountKey: "u0-gdifferent",
      accountFingerprint: currentFingerprint,
    }),
    false
  );
  assert.equal(
    isPostForCurrentAccount({
      accountKey: currentAccountKey,
      accountFingerprint: "gdifferent",
    }),
    false
  );
});

test("検索結果はFuseキャッシュ内の別アカウント投稿を返さない", async () => {
  setupAccountDom({
    href: "https://classroom.google.com/u/0/c/test",
    gaiaId: "222222222222",
  });

  const currentAccountKey = AccountIdentityHelper.getCompositeKey();
  const currentFingerprint = AccountIdentityHelper.getFingerprint();

  await initFuse([
    {
      streamId: "current-account-post",
      teacherName: "山田 太郎",
      body: "数学の課題です",
      accountKey: currentAccountKey,
      accountFingerprint: currentFingerprint,
    },
    {
      streamId: "other-account-post",
      teacherName: "別アカウント",
      body: "数学の課題です",
      accountKey: "u0-gother",
      accountFingerprint: "gother",
    },
  ]);

  assert.deepEqual(
    collectTopMatches("数学").map((result) => result.item.streamId),
    ["current-account-post"]
  );
  assert.deepEqual(
    getCurrentSearchDocs().map((post) => post.streamId),
    ["current-account-post"]
  );
});
