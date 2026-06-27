import nodeTest from "node:test";
import assert from "node:assert/strict";
import { bgFetch } from "../src/modules/content/api.js";

const test = globalThis.test ?? nodeTest;

const CHANNEL_TOKEN = "x".repeat(64);

function setupChromeMessages(googleFetchResponse) {
  const messages = [];
  const previousChrome = globalThis.chrome;

  globalThis.chrome = {
    runtime: {
      id: "extension-id",
      lastError: null,
      sendMessage(message, callback) {
        messages.push(message);
        if (message.type === "PING") {
          callback({
            pong: true,
            extensionName: "Classroom-Finder",
            extensionId: "extension-id",
          });
          return;
        }
        if (message.type === "GCX_GOOGLE_FETCH") {
          callback(googleFetchResponse);
          return;
        }
        callback({ ok: false, error: `unexpected message: ${message.type}` });
      },
    },
    storage: {
      local: {
        get(_keys, callback) {
          callback({ gcxMessageChannelToken: CHANNEL_TOKEN });
        },
      },
    },
  };

  return {
    messages,
    restore() {
      globalThis.chrome = previousChrome;
    },
  };
}

test("API fetchはページのアカウントと異なるレスポンスアカウントを拒否する", async () => {
  const chromeStub = setupChromeMessages({
    ok: true,
    data: { courses: [{ id: "old-course" }] },
    account: {
      id: "222222222222",
      email: "old@example.com",
    },
  });

  try {
    await assert.rejects(
      bgFetch(
        { path: "/courses" },
        {
          gaiaId: "111111111111",
          email: "current@example.com",
          accountKey: "u0-gcurrent",
          fingerprint: "gcurrent",
        }
      ),
      /account mismatch/
    );
    assert.equal(
      chromeStub.messages.some((message) => message.type === "GCX_GOOGLE_FETCH"),
      true
    );
  } finally {
    chromeStub.restore();
  }
});

test("API fetchはページのアカウントと一致するレスポンスだけを返す", async () => {
  const chromeStub = setupChromeMessages({
    ok: true,
    data: { courses: [{ id: "current-course" }] },
    account: {
      id: "111111111111",
      email: "current@example.com",
    },
  });

  try {
    const data = await bgFetch(
      { path: "/courses" },
      {
        gaiaId: "111111111111",
        email: "current@example.com",
        accountKey: "u0-gcurrent",
        fingerprint: "gcurrent",
      }
    );
    assert.deepEqual(data, { courses: [{ id: "current-course" }] });
  } finally {
    chromeStub.restore();
  }
});

test("API fetchは可視メールが一致する場合に古いGAIAだけでは拒否しない", async () => {
  const chromeStub = setupChromeMessages({
    ok: true,
    data: { courses: [{ id: "current-course" }] },
    account: {
      id: "222222222222",
      email: "current@example.com",
    },
  });

  try {
    const data = await bgFetch(
      { path: "/courses" },
      {
        gaiaId: "111111111111",
        email: "current@example.com",
        accountKey: "u0-mcurrent",
        fingerprint: "mcurrent",
      }
    );
    assert.deepEqual(data, { courses: [{ id: "current-course" }] });
  } finally {
    chromeStub.restore();
  }
});
