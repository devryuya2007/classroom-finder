// IndexedDB operations for content script

import { gcxConsole } from "../shared/utils.js";
import { normalizeWhitespace, normalizeStreamId, ensureStableStreamId, toArray } from "./utils.js";
import { AccountIdentityHelper, isPostForCurrentAccount } from "./account.js";
import { STREAM_DB_NAME_BASE, STREAM_DB_VERSION, STREAM_STORE_NAME } from "./constants.js";
import { formatPostedAtForJapan } from "./utils.js";

export function getStreamDbName() {
  return `${STREAM_DB_NAME_BASE}-${AccountIdentityHelper.getCompositeKey()}`;
}

function openStreamDB() {
  const dbName = getStreamDbName();
  const request = indexedDB.open(dbName, STREAM_DB_VERSION);
  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains(STREAM_STORE_NAME)) {
      db.createObjectStore(STREAM_STORE_NAME, { keyPath: "streamId" });
    }
  };
  return request;
}

export async function persistStreamData(posts = []) {
  if (!posts.length) return { stored: 0, posts: [] };
  const request = openStreamDB();
  const currentAccountKey = AccountIdentityHelper.getCompositeKey();
  const currentFingerprint = AccountIdentityHelper.getFingerprint();

  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STREAM_STORE_NAME, "readwrite");
      const store = tx.objectStore(STREAM_STORE_NAME);
      const savedAt = Date.now();
      const stored = [];
      posts.forEach((post, index) => {
        const streamId = ensureStableStreamId(post, index + 1);
        if (!streamId) {
          gcxConsole.warn("[GCX] skip store: missing fallback streamId", post);
          return;
        }
        const record = {
          ...post,
          apiId: normalizeWhitespace(post?.apiId || ""),
          accountKey:
            normalizeWhitespace(post?.accountKey || "") || currentAccountKey,
          accountFingerprint:
            normalizeWhitespace(post?.accountFingerprint || "") ||
            currentFingerprint,
          streamId,
          savedAt,
        };
        store.put(record);
        stored.push(record);
      });
      if (!stored.length) {
        gcxConsole.warn(
          "[GCX] No posts persisted. Check selector / parser logic."
        );
      }
      tx.oncomplete = () => {
        db.close();
        resolve({ stored: stored.length, posts: stored });
      };
      tx.onerror = () => {
        reject(tx.error || new Error("IndexedDB transaction failed"));
        db.close();
      };
      tx.onabort = () => {
        reject(new Error("Transaction aborted"));
        db.close();
        gcxConsole.log(
          "A transaction is aborted for reasons other than an error."
        );
      };
    };
  });
}

export async function loadStreamPostsFromDb() {
  return new Promise((resolve, reject) => {
    const request = openStreamDB();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STREAM_STORE_NAME, "readonly");
      const store = tx.objectStore(STREAM_STORE_NAME);
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        const raw = getAll.result || [];
        const normalized = raw
          .filter((post) => isPostForCurrentAccount(post))
          .map((post, index) => {
            const streamId = ensureStableStreamId(post, index + 1);
            const apiId = normalizeWhitespace(post?.apiId || post?.apiid || "");
            const postedAtSource =
              post?.postedAt?.datetime ||
              post?.postedAt?.text ||
              post?.postedAt ||
              "";
            const formattedPostedAt = formatPostedAtForJapan(postedAtSource);
            return {
              ...post,
              streamId,
              apiId,
              postedAt: {
                text:
                  formattedPostedAt.text ||
                  normalizeWhitespace(post?.postedAt?.text || ""),
                datetime:
                  formattedPostedAt.datetime ||
                  normalizeWhitespace(post?.postedAt?.datetime || ""),
              },
              alternateLink: normalizeWhitespace(post?.alternateLink || ""),
              courseId: normalizeWhitespace(post?.courseId || ""),
              courseName: normalizeWhitespace(
                post?.courseName || post?.teacherName || ""
              ),
            };
          });
        resolve(normalized);
        db.close();
      };
      getAll.onerror = () => {
        reject(getAll.error);
        db.close();
      };
    };
  });
}

export function findNewPosts(oldList, newList) {
  const known = new Set();

  oldList.forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    known.add(id);
  });

  const fresh = [];

  newList.forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    if (known.has(id)) return;
    known.add(id);
    post.streamId = id;
    fresh.push(post);
  });

  return fresh;
}

export function findRemovedPostIds(oldList, newList) {
  const previous = toArray(oldList);
  if (!previous.length) {
    return [];
  }

  const currentIds = new Set();
  toArray(newList).forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    currentIds.add(id);
  });

  const removed = [];
  previous.forEach((post, index) => {
    const id = ensureStableStreamId(post, index + 1);
    if (!id) return;
    if (currentIds.has(id)) return;
    removed.push(id);
  });

  return removed;
}

export async function removeStreamPostsByIds(ids = []) {
  const normalizedIds = Array.from(
    new Set(
      toArray(ids)
        .map((id) => normalizeStreamId(id))
        .filter(Boolean)
    )
  );
  if (!normalizedIds.length) {
    return 0;
  }

  const request = openStreamDB();
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STREAM_STORE_NAME, "readwrite");
      const store = tx.objectStore(STREAM_STORE_NAME);

      normalizedIds.forEach((id) => {
        try {
          store.delete(id);
        } catch (err) {
          gcxConsole.warn("[GCX] delete failed", { id, err });
        }
      });

      tx.oncomplete = () => {
        db.close();
        resolve(normalizedIds.length);
      };
      tx.onerror = () => {
        const error =
          tx.error || new Error("IndexedDB delete transaction failed");
        db.close();
        reject(error);
      };
      tx.onabort = () => {
        db.close();
        reject(new Error("IndexedDB delete transaction aborted"));
      };
    };
  });
}
