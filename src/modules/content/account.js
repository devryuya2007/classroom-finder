// Account management for content script

import { gcxConsole, EMAIL_REGEX } from "../shared/utils.js";
import { hashString, normalizeWhitespace } from "./utils.js";

export class AccountIdentityHelper {
  static getIndexKey() {
    try {
      if (typeof window === "undefined" || !window.location?.href) {
        return "u0";
      }
      const url = new URL(window.location.href);
      const authuserParam = url.searchParams.get("authuser");
      if (authuserParam && /^\d+$/.test(authuserParam)) {
        return `u${authuserParam}`;
      }
      const pathMatch = url.pathname.match(/\/u\/(\d+)(?:\/|$)/);
      if (pathMatch && pathMatch[1]) {
        return `u${pathMatch[1]}`;
      }
    } catch (err) {
      gcxConsole.debug("[GCX] account key detection failed", err);
    }
    return "u0";
  }

  static getFingerprint() {
    const email = getClassroomVisibleAccountEmail() || getClassroomAccountEmail();
    if (email) {
      return `m${hashString(email)}`;
    }
    const gaiaId = getClassroomGaiaId();
    if (gaiaId) {
      return `g${hashString(gaiaId)}`;
    }
    return "anon";
  }

  static getCompositeKey() {
    const indexKey = this.getIndexKey();
    const fingerprint = this.getFingerprint();
    return `${indexKey}-${fingerprint}`;
  }

  static getIndexNumber() {
    const rawKey = this.getCompositeKey();
    const match = /^u(\d+)/.exec(rawKey);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isInteger(value) && value >= 0) {
        return value;
      }
    }
    return 0;
  }
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : null;
}

function getWizGlobalData() {
  if (typeof window === "undefined") {
    return null;
  }
  const data = window.WIZ_global_data;
  if (data && typeof data === "object") {
    return data;
  }
  return null;
}

const VISIBLE_ACCOUNT_EMAIL_SELECTORS = [
  "[data-email]",
  "[data-hovercard-id]",
  "[data-identifier]",
  'a[aria-label*="@"]',
  'button[aria-label*="@"]',
  '[role="button"][aria-label*="@"]',
  'a[href*="SignOutOptions"][aria-label]',
  'a[href*="AccountChooser"][aria-label]',
  'a[href*="ServiceLogin"][aria-label]',
  'img[alt*="@"]',
];

function readEmailFromElement(element) {
  if (!element) return null;
  const attributes = [
    "data-email",
    "data-hovercard-id",
    "data-identifier",
    "aria-label",
    "alt",
    "title",
  ];
  for (const attr of attributes) {
    const email = normalizeEmail(element.getAttribute?.(attr));
    if (email) return email;
  }
  return normalizeEmail(element.textContent || "");
}

export function getClassroomVisibleAccountEmail() {
  if (typeof document === "undefined") {
    return null;
  }

  for (const selector of VISIBLE_ACCOUNT_EMAIL_SELECTORS) {
    let elements = [];
    try {
      if (typeof document.querySelectorAll === "function") {
        elements = Array.from(document.querySelectorAll(selector));
      } else {
        const single = document.querySelector?.(selector);
        elements = single ? [single] : [];
      }
    } catch (err) {
      gcxConsole.debug("[GCX] visible account selector failed", selector, err);
      continue;
    }

    for (const element of elements) {
      const email = readEmailFromElement(element);
      if (email) return email;
    }
  }

  return null;
}

export function getClassroomGaiaId() {
  const data = getWizGlobalData();
  const candidateKeys = ["S06Grb", "W3Yyqf", "WZsZ1e", "Yllh3e"];
  if (data) {
    for (const key of candidateKeys) {
      const value = data[key];
      if (typeof value === "string" && /^\d{5,}$/.test(value)) {
        gcxConsole.log("[GCX] ✓ Found GAIA ID");
        return value;
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && /^\d{5,}$/.test(value)) {
        gcxConsole.log("[GCX] ✓ Found GAIA ID");
        return value;
      }
    }
  }
  if (typeof document === "undefined") {
    return null;
  }
  const metaId = document.querySelector('meta[name="og-profile-id"]');
  const metaValue = metaId?.getAttribute("content");
  if (metaValue && /^\d{5,}$/.test(metaValue.trim())) {
    gcxConsole.log("[GCX] ✓ Found GAIA ID in meta tag");
    return metaValue.trim();
  }
  return null;
}

export function getClassroomAccountEmail() {
  if (typeof document === "undefined") {
    return null;
  }

  const visibleEmail = getClassroomVisibleAccountEmail();
  if (visibleEmail) return visibleEmail;

  const meta = document.querySelector('meta[name="og-profile-acct"]');
  const metaEmail = normalizeEmail(meta?.getAttribute("content"));
  if (metaEmail) return metaEmail;

  const data = getWizGlobalData();
  if (data) {
    for (const value of Object.values(data)) {
      if (typeof value === "string") {
        const email = normalizeEmail(value);
        if (email) return email;
      }
    }
  }
  return null;
}

export function getAccountHint(identityAccounts) {
  const index = AccountIdentityHelper.getIndexNumber();
  const account = identityAccounts[index];
  const fallbackEmail = normalizeEmail(account?.email);
  return {
    index: AccountIdentityHelper.getIndexNumber(),
    authUser: AccountIdentityHelper.getIndexNumber(),
    gaiaId: getClassroomGaiaId(),
    email: getClassroomAccountEmail() || fallbackEmail,
    accountKey: AccountIdentityHelper.getCompositeKey(),
    fingerprint: AccountIdentityHelper.getFingerprint(),
  };
}

export function getClassroomAccountKey() {
  return AccountIdentityHelper.getCompositeKey();
}

export function getAccountIndex() {
  return AccountIdentityHelper.getIndexNumber();
}

export function normalizeAccountIdentifier(value) {
  return normalizeWhitespace(value || "");
}

export function isPostForCurrentAccount(post) {
  const currentAccountKey = AccountIdentityHelper.getCompositeKey();
  const currentFingerprint = AccountIdentityHelper.getFingerprint();
  const postAccountKey = normalizeAccountIdentifier(post?.accountKey);
  const postFingerprint = normalizeAccountIdentifier(post?.accountFingerprint);

  if (postAccountKey && postAccountKey !== currentAccountKey) {
    return false;
  }
  if (postFingerprint && postFingerprint !== currentFingerprint) {
    return false;
  }
  return true;
}
