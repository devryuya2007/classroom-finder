// Background service worker constants

export const CLASSROOM_BASE = "https://classroom.googleapis.com/v1";

// Restrict proxy fetches to Classroom API only (must match manifest host_permissions)
export const ALLOWED_API_HOSTS = new Set(["classroom.googleapis.com"]);

// OAuth configuration is linked to manifest.json, loaded here
// Note: These will be read from manifest at runtime
export const getOAuthConfig = () => {
  const manifest = chrome.runtime.getManifest();
  return {
    clientId: manifest?.oauth2?.client_id || null,
    scopes: Array.isArray(manifest?.oauth2?.scopes)
      ? [...manifest.oauth2.scopes]
      : [],
  };
};

export const OAUTH_SCOPE_HASH_FACTORY = (scopes) => {
  const sorted = [...scopes].sort();
  const { createSimpleHash } = require("../shared/utils.js");
  return createSimpleHash(sorted.join(" ") || "default-scope");
};
