// Data synchronization engine for content script

import { gcxConsole } from "../shared/utils.js";
import { normalizeWhitespace, toArray } from "./utils.js";
import {
  getAccountHint,
  AccountIdentityHelper,
  getClassroomGaiaId,
  getClassroomAccountEmail
} from "./account.js";
import {
  loadStreamPostsFromDb,
  persistStreamData,
  findNewPosts,
  findRemovedPostIds,
  removeStreamPostsByIds
} from "./database.js";
import {
  fuseInstance,
  collectTopMatches
} from "./search.js";
import {
  clearAllAuthTokens,
  forceOAuthAuthentication,
} from "./auth.js";
import { fetchAllAnnouncementsPosts } from "./api.js";
import { PLACEHOLDER_ACCOUNT_MISMATCH, PLACEHOLDER_DEFAULT } from "./constants.js";

export let syncInFlight = false;

export async function resetSearchResults(renderSuggestions) {
  if (fuseInstance) {
    fuseInstance.setCollection([]);
  }
  renderSuggestions([]);
}

export async function syncStreamPosts(options = {}, dependencies) {
  const {
    ensureIdentityAccounts: ensureIdentityAccountsFn,
    getAccountHint: getAccountHintFn,
    fetchAllAnnouncementsPosts: fetchAllAnnouncementsFn,
    loadStreamPostsFromDb: loadStreamPostsFromDbFn,
    persistStreamData: persistStreamDataFn,
    findNewPosts: findNewPostsFn,
    findRemovedPostIds: findRemovedPostIdsFn,
    removeStreamPostsByIds: removeStreamPostsByIdsFn,
    clearAllAuthTokens: clearAllAuthTokensFn,
    forceOAuthAuthentication: forceOAuthAuthenticationFn,
    AccountIdentityHelper: AccountIdentityHelperClass,
    setTopbarPlaceholder,
    renderSuggestions,
    isAccountMismatchError,
    rerunLastQuery,
  } = dependencies;

  if (syncInFlight) return;
  syncInFlight = true;
  let savedPosts = [];
  try {
    await ensureIdentityAccountsFn();

    const currentFingerprint = AccountIdentityHelperClass.getFingerprint();
    const currentAccountKey = AccountIdentityHelperClass.getCompositeKey();
    const isManualRefresh = options.source === "manual";

    let lastAccountFingerprint = options.lastAccountFingerprint || null;
    let lastAccountKey = options.lastAccountKey || null;

    const accountSwitched =
      (lastAccountFingerprint &&
        lastAccountFingerprint !== currentFingerprint) ||
      (lastAccountKey && lastAccountKey !== currentAccountKey);

    if (accountSwitched) {
      gcxConsole.log("[GCX] 🔄 Account switch detected!");
      gcxConsole.log("[GCX] Previous fingerprint:", lastAccountFingerprint);
      gcxConsole.log("[GCX] Current fingerprint:", currentFingerprint);

      setTopbarPlaceholder("アカウント切り替えを検知しました...");
      try {
        await clearAllAuthTokensFn();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        gcxConsole.log("[GCX] 🔓 Re-authenticating with new account...");
        await forceOAuthAuthenticationFn(getAccountHintFn(), options.identityAccounts || []);
        gcxConsole.log(
          "[GCX] ✓ OAuth re-authentication completed after account switch"
        );
      } catch (authErr) {
        gcxConsole.error("[GCX] OAuth re-authentication failed:", authErr);
        if (isAccountMismatchError(authErr)) {
          setTopbarPlaceholder(PLACEHOLDER_ACCOUNT_MISMATCH);
          return;
        }
        setTopbarPlaceholder("認証に失敗しました");
        throw authErr;
      }

      savedPosts = await loadStreamPostsFromDbFn();
      if (fuseInstance) {
        fuseInstance.setCollection(savedPosts);
        gcxConsole.log(
          "[GCX] ✓ Fuse re-initialized with",
          savedPosts.length,
          "posts from new account"
        );
        rerunLastQuery();
      }
    }

    if (!accountSwitched) {
      savedPosts = await loadStreamPostsFromDbFn();
    }

    const currentPostsRaw = await fetchAllAnnouncementsFn();

    const existingPosts = toArray(savedPosts);
    const currentPosts = toArray(currentPostsRaw);

    const removedIds = findRemovedPostIdsFn(existingPosts, currentPosts);
    const newPosts = findNewPostsFn(existingPosts, currentPosts);
    let dataChanged = false;

    if (removedIds.length) {
      try {
        const removedCount = await removeStreamPostsByIdsFn(removedIds);
        if (removedCount > 0) {
          dataChanged = true;
        }
      } catch (err) {
        gcxConsole.warn("[GCX] remove stream posts failed", err);
      }
    }

    if (newPosts.length) {
      const result = await persistStreamDataFn(newPosts);
      if (result?.stored) {
        dataChanged = true;
      }
    }

    if (dataChanged) {
      const updated = await loadStreamPostsFromDbFn();
      if (fuseInstance) {
        fuseInstance.setCollection(updated);
        rerunLastQuery();
      }
    } else if (!existingPosts.length) {
      await resetSearchResults(renderSuggestions);
    }
    if (!options.keepPlaceholder) {
      setTopbarPlaceholder(PLACEHOLDER_DEFAULT);
    }
  } catch (error) {
    if (!savedPosts.length) {
      await resetSearchResults(renderSuggestions);
    }
    throw error;
  } finally {
    syncInFlight = false;
  }
}
