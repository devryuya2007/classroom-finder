// Utility functions for content script

import { gcxConsole } from "../shared/utils.js";
import {
  JAPAN_TIME_FORMATTER,
  IMAGE_EXT_PATTERN,
  DOC_EXT_PATTERN,
  GOOGLE_DOC_MIME,
  GOOGLE_DOC_URL_PATTERN,
} from "./constants.js";

export function normalizeAttachments(materials) {
  if (!Array.isArray(materials)) return [];
  return materials
    .map((material) => {
      if (!material || typeof material !== "object") return null;

      if (material.driveFile && material.driveFile.driveFile) {
        const file = material.driveFile.driveFile;
        return {
          type: "driveFile",
          driveId: file.id || "",
          href: file.alternateLink || "",
          title: normalizeWhitespace(file.title || ""),
          mimeType: normalizeWhitespace(file.mimeType || ""),
          iconUrl: normalizeWhitespace(file.iconUrl || ""),
        };
      }

      if (material.link) {
        const link = material.link;
        return {
          type: "link",
          driveId: "",
          href: link.url || "",
          title: normalizeWhitespace(link.title || link.url || ""),
        };
      }

      if (material.form) {
        const form = material.form;
        return {
          type: "form",
          driveId: form.formId || "",
          href: form.formUrl || "",
          title: normalizeWhitespace(form.title || ""),
        };
      }

      if (material.youtubeVideo) {
        const video = material.youtubeVideo;
        return {
          type: "youtube",
          driveId: video.id || "",
          href: video.alternateLink || video.url || "",
          title: normalizeWhitespace(video.title || ""),
        };
      }

      return null;
    })
    .filter(Boolean);
}

export function normalizeWhitespace(value) {
  if (value == null) return "";
  return String(value)
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function formatPostedAtForJapan(rawValue) {
  const value = normalizeWhitespace(rawValue || "");
  if (!value) {
    return { text: "", datetime: "" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { text: value, datetime: value };
  }

  const parts = JAPAN_TIME_FORMATTER.formatToParts(date);
  const partValue = (type) => parts.find((p) => p.type === type)?.value || "";
  const yearPart = partValue("year");
  const monthPart = partValue("month");
  const dayPart = partValue("day");
  const baseText =
    monthPart && dayPart ? `${monthPart}/${dayPart}` : monthPart || dayPart;
  const yearNumber = Number.parseInt(yearPart, 10);
  const includeYear = Number.isFinite(yearNumber) && yearNumber < 2024;
  const fallbackText = JAPAN_TIME_FORMATTER.format(date);

  return {
    text:
      includeYear && baseText
        ? `${yearPart}/${baseText}`
        : baseText || fallbackText,
    datetime: date.toISOString(),
  };
}

export function hashString(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeStreamId(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function ensureStableStreamId(post, fallbackIndex = 0) {
  const existing = normalizeStreamId(post?.streamId);
  if (existing) return existing;

  const seedParts = [
    normalizeWhitespace(post?.teacherName || ""),
    normalizeWhitespace(post?.postedAt?.datetime || post?.postedAt?.text || ""),
    normalizeWhitespace((post?.body || "").slice(0, 160)),
    String(post?.index || fallbackIndex || 0),
  ];

  const seed = seedParts.join("|");
  if (!seed.trim()) {
    return "";
  }
  return `auto-${hashString(seed)}`;
}

export function collectStreamElements(root = document, streamSelectors) {
  const primary = [...(root?.querySelectorAll(streamSelectors.primary) || [])];
  let elements = primary;

  if (elements.length === 0) {
    const fallback = [
      ...(root?.querySelectorAll(streamSelectors.fallback) || []),
    ];

    if (fallback.length) {
      gcxConsole.warn(
        "[GCX] Fallback selector engaged. Classroom DOM might have changed."
      );
    }

    elements = fallback;
  }

  const seenIds = new Set();
  const results = [];

  for (const element of elements) {
    const idCarrier = element.matches(streamSelectors.idSelector)
      ? element
      : element.querySelector(streamSelectors.idSelector);

    const rawId =
      idCarrier?.dataset?.streamItemId ||
      idCarrier?.getAttribute?.("data-stream-item-id") ||
      idCarrier?.dataset?.itemId ||
      idCarrier?.getAttribute?.("data-item-id") ||
      "";

    if (rawId) {
      if (seenIds.has(rawId)) {
        continue;
      }
      seenIds.add(rawId);
    }

    results.push({
      index: results.length + 1,
      streamId: rawId || null,
      element,
    });
  }

  return results;
}

export function deriveDriveFileLabel(attachment) {
  const mime = normalizeWhitespace(attachment?.mimeType || "").toLowerCase();
  if (mime === GOOGLE_DOC_MIME) {
    return "Document";
  }
  if (mime.startsWith("image/")) {
    return "Image";
  }

  const title = normalizeWhitespace(attachment?.title || "");
  const href = normalizeWhitespace(attachment?.href || "");
  const icon = normalizeWhitespace(attachment?.iconUrl || "");
  const lowerTitle = title.toLowerCase();
  const lowerHref = href.toLowerCase();
  const lowerIcon = icon.toLowerCase();

  if (
    GOOGLE_DOC_URL_PATTERN.test(href) ||
    GOOGLE_DOC_URL_PATTERN.test(title) ||
    lowerIcon.includes("document") ||
    DOC_EXT_PATTERN.test(title) ||
    DOC_EXT_PATTERN.test(href)
  ) {
    return "Document";
  }

  if (IMAGE_EXT_PATTERN.test(title) || IMAGE_EXT_PATTERN.test(href)) {
    return "Image";
  }

  if (
    lowerTitle.endsWith(".pdf") ||
    lowerHref.endsWith(".pdf") ||
    lowerHref.includes(".pdf")
  ) {
    return "PDF";
  }

  return "File";
}

export function deriveSingleAttachmentLabel(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return "";
  }

  switch (attachment.type) {
    case "driveFile":
      return deriveDriveFileLabel(attachment);
    case "form":
      return "Form";
    case "youtube":
      return "YouTube";
    case "link": {
      const href = normalizeWhitespace(attachment.href || "");
      const title = normalizeWhitespace(attachment.title || "");
      const lowerHref = href.toLowerCase();
      const lowerTitle = title.toLowerCase();

      if (
        GOOGLE_DOC_URL_PATTERN.test(href) ||
        GOOGLE_DOC_URL_PATTERN.test(title) ||
        DOC_EXT_PATTERN.test(title) ||
        DOC_EXT_PATTERN.test(href)
      ) {
        return "Document";
      }

      if (IMAGE_EXT_PATTERN.test(title) || IMAGE_EXT_PATTERN.test(href)) {
        return "Image";
      }

      if (
        lowerHref.endsWith(".pdf") ||
        lowerHref.includes(".pdf") ||
        lowerTitle.endsWith(".pdf")
      ) {
        return "PDF";
      }

      return "Link";
    }
    default:
      return "File";
  }
}

export function deriveAttachmentLabels(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) {
    return [];
  }

  return attachments
    .map((attachment) => deriveSingleAttachmentLabel(attachment))
    .filter((label) => Boolean(label));
}

export function getCurrentCourseId() {
  const pathname = window.location?.pathname || "";
  const hash = window.location?.hash || "";
  const match =
    /\/c\/([a-zA-Z0-9_-]+)/.exec(pathname) ||
    /\/c\/([a-zA-Z0-9_-]+)/.exec(hash);
  return match?.[1] || "";
}

export function cssEscapeSafe(value) {
  if (value == null) return "";
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  const string = String(value);
  const length = string.length;
  let result = "";
  for (let index = 0; index < length; index += 1) {
    const code = string.charCodeAt(index);
    const char = string.charAt(index);
    if (code === 0) {
      result += "\uFFFD";
      continue;
    }
    if (
      (code >= 0x0001 && code <= 0x001f) ||
      code === 0x007f ||
      (index === 0 && code >= 0x0030 && code <= 0x0039) ||
      (index === 1 &&
        string.charCodeAt(0) === 0x002d &&
        code >= 0x0030 &&
        code <= 0x0039) ||
      (index === 0 && code === 0x002d && length === 1)
    ) {
      result += "\\" + code.toString(16) + " ";
      continue;
    }
    if (
      code >= 0x0080 ||
      code === 0x002d ||
      code === 0x005f ||
      (code >= 0x0030 && code <= 0x0039) ||
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    ) {
      result += char;
      continue;
    }
    result += "\\" + char;
  }
  return result;
}

export function getExtensionURL(relativePath) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(relativePath);
    }
  } catch {
    // no-op
  }
  if (typeof browser !== "undefined" && browser.runtime?.getURL) {
    return browser.runtime.getURL(relativePath);
  }
  return relativePath;
}
