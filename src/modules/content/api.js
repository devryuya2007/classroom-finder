// API communication layer for content script

import { gcxConsole } from "../shared/utils.js";
import { normalizeWhitespace } from "./utils.js";
import { ensureChannelToken, ensureServiceWorkerReady } from "./auth.js";
import { normalizeEmail } from "./account.js";

function assertResponseAccountMatchesHint(accountHint, responseAccount) {
  if (!accountHint || typeof accountHint !== "object") {
    return;
  }

  const expectedGaiaId = normalizeWhitespace(accountHint.gaiaId || "");
  const actualGaiaId = normalizeWhitespace(responseAccount?.id || "");
  const expectedEmail = normalizeEmail(accountHint.email);
  const actualEmail = normalizeEmail(responseAccount?.email);
  if (expectedEmail && actualEmail && expectedEmail !== actualEmail) {
    throw new Error("account mismatch: response account email differs from page account");
  }
  if (expectedEmail && actualEmail && expectedEmail === actualEmail) {
    return;
  }

  if (expectedGaiaId && actualGaiaId && expectedGaiaId !== actualGaiaId) {
    throw new Error("account mismatch: response account id differs from page account");
  }

  if ((expectedGaiaId || expectedEmail) && !responseAccount?.id && !responseAccount?.email) {
    throw new Error("account mismatch: background could not resolve requested account");
  }
}

export async function bgFetch(request, accountHint, { sessionKey } = {}, attempt = 0) {
  if (attempt === 0) {
    await ensureServiceWorkerReady();
  }

  let channelToken;
  try {
    channelToken = await ensureChannelToken();
  } catch (err) {
    throw new Error(
      `Failed to obtain channel token for fetch: ${err?.message || err}`
    );
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Background fetch timeout (30s)"));
    }, 30000);

    try {
      chrome.runtime.sendMessage(
        { type: "GCX_GOOGLE_FETCH", request, accountHint, channelToken },
        (res) => {
          clearTimeout(timeoutId);

          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            const message = runtimeError.message || "Extension runtime error";

            if (message.includes("Extension context invalidated")) {
              if (attempt < 2) {
                const backoffMs = 500 * Math.pow(2, attempt);
                gcxConsole.warn(
                  `[GCX] Extension context invalidated (retry ${attempt + 1}/2 after ${backoffMs}ms)`
                );
                setTimeout(() => {
                  bgFetch(request, accountHint, { sessionKey }, attempt + 1)
                    .then(resolve)
                    .catch(reject);
                }, backoffMs);
                return;
              }
              reject(
                new Error(
                  "Extension context invalidated. Please reload the page."
                )
              );
              return;
            }

            if (
              attempt < 3 &&
              typeof message === "string" &&
              (message.includes("message channel closed") ||
                message.includes("message port closed"))
            ) {
              const backoffMs = 500 * Math.pow(2, attempt);
              gcxConsole.warn(
                `[GCX] ${message} (retry ${attempt + 1}/3 after ${backoffMs}ms)`
              );
              setTimeout(() => {
                bgFetch(request, accountHint, { sessionKey }, attempt + 1)
                  .then(resolve)
                  .catch(reject);
              }, backoffMs);
              return;
            }
            reject(new Error(message));
            return;
          }

          if (!res) {
            if (attempt < 3) {
              const backoffMs = 500 * Math.pow(2, attempt);
              gcxConsole.warn(
                `[GCX] No response (retry ${attempt + 1}/3 after ${backoffMs}ms)`
              );
              setTimeout(() => {
                bgFetch(request, accountHint, { sessionKey }, attempt + 1)
                  .then(resolve)
                  .catch(reject);
              }, backoffMs);
              return;
            }
            reject(new Error("No response from background"));
            return;
          }

          if (!res.ok) {
            reject(new Error(res.error || `HTTP ${res.status}`));
            return;
          }

          try {
            assertResponseAccountMatchesHint(accountHint, res.account);
          } catch (error) {
            reject(error);
            return;
          }

          resolve(res.data);
        }
      );
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}

export async function listAllCourses(accountHint) {
  const courses = [];
  let pageToken = undefined;
  do {
    const data = await bgFetch(
      {
        path: "/courses",
        params: { courseStates: "ACTIVE", pageSize: 100, pageToken },
      },
      accountHint
    );
    if (data?.courses?.length) courses.push(...data.courses);
    pageToken = data?.nextPageToken || undefined;
  } while (pageToken);

  return courses;
}

export async function listAnnouncementsForCourse(courseId, accountHint) {
  const items = [];
  let pageToken = undefined;
  do {
    const data = await bgFetch(
      {
        path: `/courses/${encodeURIComponent(courseId)}/announcements`,
        params: { pageSize: 100, pageToken, orderBy: "updateTime desc" },
      },
      accountHint
    );
    if (data?.announcements?.length) items.push(...data.announcements);
    pageToken = data?.nextPageToken || undefined;
  } while (pageToken);
  return items;
}

export function mapAnnouncementToPost(ann, course, index, formatPostedAtForJapan, normalizeAttachments) {
  const apiId = normalizeWhitespace(ann.id || "");
  const id = normalizeWhitespace(ann.id || "");
  const teacherName = normalizeWhitespace(course?.name || "");
  const courseId = normalizeWhitespace(course?.id || "");
  const courseName = teacherName;
  const postedAtRaw = normalizeWhitespace(
    ann.updateTime || ann.creationTime || ""
  );
  const formattedPostedAt = formatPostedAtForJapan(postedAtRaw);
  const bodyText = normalizeWhitespace(ann.text || "");
  const alternateLink = normalizeWhitespace(ann.alternateLink || "");

  return {
    index,
    apiId,
    streamId: id || null,
    courseId,
    courseName,
    teacherName,
    postedAt: {
      text: formattedPostedAt.text || postedAtRaw,
      datetime: formattedPostedAt.datetime || postedAtRaw,
    },
    body: bodyText,
    alternateLink,
    attachments: normalizeAttachments(ann.materials || []),
  };
}

export async function fetchAllAnnouncementsPosts(normalizeAttachments, formatPostedAtForJapan, accountHint) {
  const courses = await listAllCourses(accountHint);
  const posts = [];
  let counter = 0;
  const concurrency = 2;
  let i = 0;

  async function worker() {
    while (i < courses.length) {
      const idx = i++;
      const course = courses[idx];
      try {
        if (idx > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const anns = await listAnnouncementsForCourse(course.id, accountHint);
        for (const ann of anns) {
          counter += 1;
          posts.push(mapAnnouncementToPost(ann, course, counter, formatPostedAtForJapan, normalizeAttachments));
        }
      } catch (err) {
        gcxConsole.warn(
          `[GCX] announcements fetch failed for course ${course?.id} (${course?.name || "unknown"
          })`,
          err.message || err
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, courses.length) }, worker)
  );
  return posts;
}
