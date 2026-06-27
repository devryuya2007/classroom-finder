import nodeTest from "node:test";
import assert from "node:assert/strict";
import {
  syncStreamPosts,
  reloadSearchIndexForCurrentAccount,
} from "../src/modules/content/sync.js";
import {
  collectTopMatches,
  getCurrentSearchDocs,
  initFuse,
} from "../src/modules/content/search.js";
import {
  AccountIdentityHelper,
  getAccountHint,
  getClassroomAccountEmail,
  getClassroomVisibleAccountEmail,
  isPostForCurrentAccount,
} from "../src/modules/content/account.js";
import { PLACEHOLDER_DEFAULT } from "../src/modules/content/constants.js";
import { hashString } from "../src/modules/content/utils.js";
import { rerunLastQuery } from "../src/modules/content/ui/suggestions.js";

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

test("可視DOMのメールは古いGAIAやmetaより優先してアカウント検知に使う", () => {
  const visibleElement = {
    getAttribute: (name) => {
      if (name === "aria-label") {
        return "Google アカウント: Current User current@example.com";
      }
      return null;
    },
    textContent: "",
  };
  globalThis.window = {
    location: { href: "https://classroom.google.com/u/0/c/test" },
    WIZ_global_data: {
      S06Grb: "999999999999",
      staleEmail: "old@example.com",
    },
  };
  globalThis.document = {
    querySelector: (selector) => {
      if (selector === 'meta[name="og-profile-acct"]') {
        return {
          getAttribute: () => "old@example.com",
        };
      }
      return null;
    },
    querySelectorAll: (selector) =>
      selector.includes("aria-label") ? [visibleElement] : [],
  };

  assert.equal(getClassroomVisibleAccountEmail(), "current@example.com");
  assert.equal(getClassroomAccountEmail(), "current@example.com");
  assert.equal(
    AccountIdentityHelper.getFingerprint(),
    `m${hashString("current@example.com")}`
  );
  assert.deepEqual(
    {
      email: getAccountHint([]).email,
      fingerprint: getAccountHint([]).fingerprint,
    },
    {
      email: "current@example.com",
      fingerprint: `m${hashString("current@example.com")}`,
    }
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

test("検索インデックス再読込はAPIを呼ばずDBの現アカウントだけを反映する", async () => {
  setupAccountDom({
    href: "https://classroom.google.com/u/0/c/test",
    gaiaId: "333333333333",
  });

  const currentAccountKey = AccountIdentityHelper.getCompositeKey();
  const currentFingerprint = AccountIdentityHelper.getFingerprint();
  let dbLoads = 0;

  await reloadSearchIndexForCurrentAccount({
    loadStreamPostsFromDb: async () => {
      dbLoads += 1;
      return [
        {
          streamId: "current-only",
          teacherName: "山田 太郎",
          body: "英語の課題です",
          accountKey: currentAccountKey,
          accountFingerprint: currentFingerprint,
        },
        {
          streamId: "other-account",
          teacherName: "別アカウント",
          body: "英語の課題です",
          accountKey: "u0-gother",
          accountFingerprint: "gother",
        },
      ];
    },
    rerunLastQuery: () => {},
  });

  assert.equal(dbLoads, 1);
  assert.deepEqual(
    collectTopMatches("英語").map((result) => result.item.streamId),
    ["current-only"]
  );
});

test("検索インデックス再読込時にlastQueryが空なら候補を表示しない", async () => {
  setupAccountDom({
    href: "https://classroom.google.com/u/0/c/test",
    gaiaId: "555555555555",
  });

  const currentAccountKey = AccountIdentityHelper.getCompositeKey();
  const currentFingerprint = AccountIdentityHelper.getFingerprint();
  const rendered = [];

  await initFuse([
    {
      streamId: "current-account-post",
      teacherName: "山田 太郎",
      body: "数学の課題です",
      accountKey: currentAccountKey,
      accountFingerprint: currentFingerprint,
    },
  ]);

  rerunLastQuery(
    "",
    collectTopMatches,
    (results) => rendered.push(results),
    {}
  );

  assert.deepEqual(rendered, [[]]);
});

test("検索インデックス再読込時にlastQueryがあれば候補を表示する", async () => {
  setupAccountDom({
    href: "https://classroom.google.com/u/0/c/test",
    gaiaId: "666666666666",
  });

  const currentAccountKey = AccountIdentityHelper.getCompositeKey();
  const currentFingerprint = AccountIdentityHelper.getFingerprint();
  const rendered = [];

  await initFuse([
    {
      streamId: "current-account-post",
      teacherName: "山田 太郎",
      body: "数学の課題です",
      accountKey: currentAccountKey,
      accountFingerprint: currentFingerprint,
    },
  ]);

  rerunLastQuery(
    "数学",
    collectTopMatches,
    (results) => rendered.push(results.map((result) => result.item.streamId)),
    {}
  );

  assert.deepEqual(rendered, [["current-account-post"]]);
});

test("アカウント切替同期は再認証後にAPI取得とDB反映を行う", async () => {
  setupAccountDom({
    href: "https://classroom.google.com/u/0/c/test",
    gaiaId: "444444444444",
  });

  const calls = [];
  const fetchedPost = {
    streamId: "new-account-post",
    teacherName: "新アカウント",
    body: "理科の課題です",
    accountKey: AccountIdentityHelper.getCompositeKey(),
    accountFingerprint: AccountIdentityHelper.getFingerprint(),
  };
  let loadCount = 0;

  const deps = createDeps({
    clearAllAuthTokens: async () => calls.push("clear"),
    forceOAuthAuthentication: async () => calls.push("auth"),
    fetchAllAnnouncementsPosts: async () => {
      calls.push("fetch");
      return [fetchedPost];
    },
    loadStreamPostsFromDb: async () => {
      loadCount += 1;
      return loadCount > 1 ? [fetchedPost] : [];
    },
    findNewPosts: () => [fetchedPost],
    persistStreamData: async (posts) => {
      calls.push(`persist:${posts.length}`);
      return { stored: posts.length, posts };
    },
    rerunLastQuery: () => calls.push("rerun"),
  });

  await syncStreamPosts(
    {
      source: "account-switch",
      lastAccountFingerprint: "old-fingerprint",
      lastAccountKey: "u0-gold",
      keepPlaceholder: true,
    },
    deps
  );

  assert.deepEqual(calls, [
    "clear",
    "auth",
    "rerun",
    "fetch",
    "persist:1",
    "rerun",
  ]);
  assert.deepEqual(
    collectTopMatches("理科").map((result) => result.item.streamId),
    ["new-account-post"]
  );
});

test("同期中にアカウントが変わった場合は取得済みデータを保存しない", async () => {
  let fingerprint = "fp-before";
  let accountKey = "u0-gbefore";
  let persisted = false;

  const deps = createDeps({
    AccountIdentityHelper: {
      getFingerprint: () => fingerprint,
      getCompositeKey: () => accountKey,
    },
    fetchAllAnnouncementsPosts: async () => {
      fingerprint = "fp-after";
      accountKey = "u0-gafter";
      return [
        {
          streamId: "stale-post",
          teacherName: "古い同期",
          body: "保存してはいけない投稿です",
        },
      ];
    },
    findNewPosts: () => {
      throw new Error("stale sync should abort before diffing");
    },
    persistStreamData: async () => {
      persisted = true;
      return { stored: 1 };
    },
  });

  const result = await syncStreamPosts({}, deps);

  assert.deepEqual(result, { aborted: true });
  assert.equal(persisted, false);
});
