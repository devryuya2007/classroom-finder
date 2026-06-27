// Fuse.js search integration

import { gcxConsole } from "../shared/utils.js";
import Fuse from "../../libs/fuse.esm.js";
import { normalizeWhitespace, toArray } from "./utils.js";
import { SUGGESTION_LIMIT } from "./constants.js";
import { isPostForCurrentAccount } from "./account.js";

export const SEARCH_OPTIONS = {
  includeMatches: true,
  includeScore: true,
  shouldSort: true,
  threshold: 0.3,
  keys: [
    { name: "teacherName", weight: 0.4 },
    { name: "courseName", weight: 0.2 },
    { name: "body", weight: 0.4 },
    { name: "attachments.title", weight: 0.2 },
    { name: "postedAt.text", weight: 0.05 },
  ],
  minMatchCharLength: 1,
};

export let fuseInstance = null;

export async function initFuse(posts) {
  try {
    const FuseConstructor = Fuse || window.Fuse;
    if (typeof FuseConstructor !== "function") {
      throw new Error("Fuse constructor is not available");
    }
    fuseInstance = new FuseConstructor(posts, SEARCH_OPTIONS);
  } catch (error) {
    gcxConsole.error("[GCX] Failed to init fuse", error);
    fuseInstance = null;
  }
}

export function getCurrentSearchDocs() {
  if (!fuseInstance) {
    return [];
  }
  const docs = toArray(fuseInstance.getIndex()?.docs);
  return docs.filter((post) => isPostForCurrentAccount(post));
}

function getBodyMatchStart(result) {
  const matches = toArray(result?.matches);
  for (const match of matches) {
    if (match?.key !== "body") continue;
    const firstRange = toArray(match.indices)[0];
    if (Array.isArray(firstRange) && firstRange.length > 0) {
      return Number(firstRange[0]);
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function collectTopMatches(query) {
  if (!query || !fuseInstance) {
    return [];
  }

  const safeQuery = query.trim();
  if (!safeQuery) {
    return [];
  }

  const results = fuseInstance
    .search(safeQuery)
    .filter((result) => isPostForCurrentAccount(result?.item));
  const sorted = results.slice().sort((a, b) => {
    const aBodyIndex = getBodyMatchStart(a);
    const bBodyIndex = getBodyMatchStart(b);
    if (aBodyIndex !== bBodyIndex) {
      return aBodyIndex - bBodyIndex;
    }
    return (a?.score ?? 1) - (b?.score ?? 1);
  });

  return sorted.slice(0, SUGGESTION_LIMIT);
}

export function extractMatchRanges(matches, key, textLength) {
  if (!Array.isArray(matches) || !key || !textLength) {
    return [];
  }

  const ranges = [];
  matches.forEach((match) => {
    if (!match || match.key !== key) return;
    if (!Array.isArray(match.indices)) return;
    match.indices.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return;
      const start = Math.max(0, Math.min(textLength - 1, pair[0]));
      const end = Math.max(start, Math.min(textLength - 1, pair[1]));
      ranges.push([start, end]);
    });
  });

  if (!ranges.length) return [];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) {
      if (end > last[1]) {
        last[1] = end;
      }
      continue;
    }
    merged.push([start, end]);
  }

  return merged;
}

export function renderHighlightedText(element, value, matches, key) {
  const text = value == null ? "" : String(value);
  element.textContent = "";
  if (!text) {
    return;
  }

  const ranges = extractMatchRanges(matches, key, text.length);
  if (!ranges.length) {
    element.textContent = text;
    return;
  }

  let cursor = 0;
  const fragment = document.createDocumentFragment();
  for (const [start, end] of ranges) {
    if (cursor < start) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
    }
    const span = document.createElement("span");
    span.classList.add("match-highlight");
    span.textContent = text.slice(start, end + 1);
    fragment.appendChild(span);
    cursor = end + 1;
  }

  if (cursor < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
  }

  element.appendChild(fragment);
}

export async function loadLocalLibs() {
  if (window.Fuse) return true;
  if (typeof Fuse !== "function") return false;
  window.Fuse = Fuse;
  return true;
}
