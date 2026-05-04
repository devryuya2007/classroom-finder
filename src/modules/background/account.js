// Account information retrieval

import { gcxConsole } from "../shared/utils.js";

export async function listIdentityAccounts() {
  if (!chrome.identity?.getAccounts) return [];
  return new Promise((resolve) => {
    try {
      chrome.identity.getAccounts((accounts) => {
        if (chrome.runtime.lastError) {
          gcxConsole.warn(
            "[GCX] getAccounts failed",
            chrome.runtime.lastError.message
          );
          resolve([]);
          return;
        }
        if (Array.isArray(accounts)) {
          resolve(accounts);
        } else {
          resolve([]);
        }
      });
    } catch (err) {
      gcxConsole.warn("[GCX] getAccounts threw", err);
      resolve([]);
    }
  });
}

export async function getProfileInfoForAccount(account) {
  if (!account?.id)
    return { id: account?.id || null, email: account?.email || null };
  return new Promise((resolve) => {
    try {
      const details = { account: { id: account.id } };
      chrome.identity.getProfileUserInfo(details, (info) => {
        if (chrome.runtime.lastError) {
          resolve({ id: account.id, email: account.email || null });
          return;
        }
        resolve({
          id: info?.id || account.id,
          email: info?.email || account.email || null,
        });
      });
    } catch (err) {
      gcxConsole.debug("[GCX] getProfileUserInfo failed", err);
      resolve({ id: account.id, email: account.email || null });
    }
  });
}

export async function listIdentityAccountsWithProfiles() {
  const accounts = await listIdentityAccounts();
  const enriched = [];
  for (const account of accounts) {
    const profile = await getProfileInfoForAccount(account);
    enriched.push({
      id: profile.id || account.id || null,
      email: profile.email || account.email || null,
    });
  }
  return enriched;
}
