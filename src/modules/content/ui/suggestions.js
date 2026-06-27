// Search suggestions rendering component

import { gcxConsole } from "../../shared/utils.js";
import {
  toArray,
  deriveDriveFileLabel,
  deriveAttachmentLabels,
  cssEscapeSafe,
} from "../utils.js";
import { getCurrentSearchDocs, renderHighlightedText } from "../search.js";
import { AccountIdentityHelper, isPostForCurrentAccount } from "../account.js";
import { ALLOWED_NAV_HOSTS } from "../constants.js";
import { normalizeWhitespace } from "../utils.js";

export function createSuggestionItem(entry, handlers) {
  const item = entry?.item || {};
  const matches = entry?.matches || [];
  const attachmentLabels = deriveAttachmentLabels(item.attachments);
  const li = document.createElement("li");
  li.classList.add("suggestion-item");
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.dataset.streamId = item.streamId || "";
  li.dataset.courseId = item.courseId || "";
  li.dataset.alternateLink = item.alternateLink || "";

  const ariaLabelParts = [
    item.teacherName || "",
    item.courseName && item.courseName !== item.teacherName
      ? item.courseName
      : "",
    item.postedAt?.text || "",
  ].filter(Boolean);
  if (attachmentLabels.length) {
    ariaLabelParts.push(attachmentLabels.join("/"));
  }
  if (ariaLabelParts.length) {
    li.setAttribute("aria-label", ariaLabelParts.join(" "));
  }

  const header = document.createElement("div");
  header.classList.add("suggestion-header");

  const headerMain = document.createElement("div");
  headerMain.classList.add("suggestion-header-main");

  const teacher = document.createElement("span");
  teacher.classList.add("suggestion-teacher");
  renderHighlightedText(
    teacher,
    item.teacherName || "(不明)",
    matches,
    "teacherName"
  );
  headerMain.appendChild(teacher);

  if (attachmentLabels.length) {
    const badgeGroup = document.createElement("span");
    badgeGroup.classList.add("suggestion-attachments");
    attachmentLabels.forEach((label) => {
      const badge = document.createElement("span");
      badge.classList.add("attachment-badge");
      badge.textContent = label;
      badgeGroup.appendChild(badge);
    });
    headerMain.appendChild(badgeGroup);
  }

  const time = document.createElement("time");
  time.classList.add("suggestion-time");
  time.dateTime = item.postedAt?.datetime || "";
  renderHighlightedText(
    time,
    item.postedAt?.text || "",
    matches,
    "postedAt.text"
  );

  header.append(headerMain, time);

  const body = document.createElement("div");
  body.classList.add("suggestion-body");
  renderHighlightedText(body, item.body || "", matches, "body");

  li.append(header, body);

  const activate = async () => {
    if (handlers.handleSuggestionActivation) {
      await handlers.handleSuggestionActivation(item);
    }
  };

  li.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    activate();
  });
  li.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Spacebar"
    ) {
      event.preventDefault();
      activate();
    }
  });

  return li;
}

export function renderSuggestions(results, handlers) {
  const container = document.querySelector(".gcx-suggestions");
  if (!container) return;

  let list = container.querySelector(".suggestions-ul");
  if (!list) {
    const wrap = container.querySelector(".suggestions-wrap");
    if (wrap) {
      list = document.createElement("ul");
      list.classList.add("suggestions-ul");
      wrap.appendChild(list);
    }
  }

  if (!list) return;

  list.replaceChildren();

  const wrap = list.closest(".suggestions-wrap");
  if (wrap) {
    wrap.scrollTop = 0;
  }

  const entries = toArray(results);
  if (!entries.length) {
    container.classList.remove("has-results");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const li = createSuggestionItem(entry, handlers);
    if (li) {
      fragment.appendChild(li);
    }
  }

  list.appendChild(fragment);
  container.classList.add("has-results");
}

export async function handleSuggestionActivation(item, handlers) {
  if (!item) return;
  if (!isPostForCurrentAccount(item)) {
    gcxConsole.warn("[GCX] Blocked navigation for mismatched account item", {
      itemAccountKey: item?.accountKey,
      itemFingerprint: item?.accountFingerprint,
      currentAccountKey: AccountIdentityHelper.getCompositeKey(),
      currentFingerprint: AccountIdentityHelper.getFingerprint(),
    });
    handlers.setTopbarPlaceholder("アカウントを確認してから再試行してください。");
    return;
  }

  const courseId = normalizeWhitespace(item.courseId || "");
  const alternateLink = normalizeWhitespace(item.alternateLink || "");
  const apiId = normalizeWhitespace(item.apiId || item.apiid || "");
  const currentAccountIndex = String(AccountIdentityHelper.getIndexNumber());

  const normalizeNavigationTarget = (url) => {
    url.searchParams.set("authuser", currentAccountIndex);
    url.pathname = url.pathname.replace(/\/u\/\d+(?=\/|$)/, `/u/${currentAccountIndex}`);
    return url;
  };

  const navigateTo = (link) => {
    const href = normalizeWhitespace(link || "");
    if (!href) {
      return false;
    }
    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (err) {
      gcxConsole.warn("[GCX] Invalid navigation target", { href, err });
      return false;
    }
    if (url.protocol !== "https:") {
      gcxConsole.warn("[GCX] Blocked non-https navigation", { href });
      return false;
    }
    if (!ALLOWED_NAV_HOSTS.has(url.hostname)) {
      gcxConsole.warn("[GCX] Blocked navigation host", {
        href,
        host: url.hostname,
      });
      return false;
    }
    window.location.assign(normalizeNavigationTarget(url).toString());
    return true;
  };

  if (navigateTo(alternateLink)) {
    return;
  }

  if (apiId && courseId && handlers.bgFetch) {
    try {
      const data = await handlers.bgFetch({
        path: `/courses/${encodeURIComponent(
          courseId
        )}/announcements/${encodeURIComponent(apiId)}`,
      }, handlers.getAccountHint?.());
      const fetchedLink = normalizeWhitespace(data?.alternateLink || "");
      if (navigateTo(fetchedLink)) {
        return;
      }
    } catch (error) {
      gcxConsole.warn("[GCX] Failed to resolve alternateLink via API", {
        courseId,
        apiId,
        error,
      });
    }
  }

  gcxConsole.error("[GCX] No navigation target resolved via API", {
    courseId,
    apiId,
    alternateLink,
    item,
  });
}

export function rerunLastQuery(lastQuery, collectTopMatches, renderSuggestions, handlers) {
  if (lastQuery) {
    renderSuggestions(collectTopMatches(lastQuery), handlers);
  } else {
    renderSuggestions([], handlers);
  }
}
