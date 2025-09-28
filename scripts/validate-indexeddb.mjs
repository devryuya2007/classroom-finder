// IndexedDB の中身を Node.js 上で確認するデバッグスクリプト
// 初心者向けポイント: ブラウザの indexedDB を Node で真似るため fake-indexeddb を使う
import 'fake-indexeddb/auto';

// まずは content.js が参照する window / document をダミーで用意
const fakeDocument = {
  readyState: 'loading',
  addEventListener: () => {
    // テスト環境なので何もしない
  },
};

const fakeWindow = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};
fakeWindow.document = fakeDocument;

// グローバルに差し込んでから content.js を読み込む
globalThis.document = fakeDocument;
globalThis.window = fakeWindow;

await import('../src/content.js');

const debug = globalThis.window.__gcxDebug;
if (!debug) {
  throw new Error('デバッグ API の取得に失敗');
}

// 教師投稿のサンプルデータ（本番と同じ構造）
const samplePosts = [
  {
    index: 1,
    streamId: 'stream-001',
    teacherName: '田中先生',
    postedAt: { text: '2024/05/01 09:00', datetime: '2024-05-01T09:00:00Z' },
    body: '1 時限目の体育は集合時間が早まります。',
    attachments: [
      {
        type: 'driveFile',
        driveId: 'drive-doc-001',
        href: 'https://example.com/doc1',
        title: '連絡資料.pdf',
      },
    ],
  },
  {
    index: 2,
    streamId: 'stream-002',
    teacherName: '佐藤先生',
    postedAt: { text: '2024/05/02 10:30', datetime: '2024-05-02T10:30:00Z' },
    body: '国語の課題プリントを提出してください。',
    attachments: [],
  },
];

// getNow を固定すると savedAt の検証がしやすい
const fixedNow = 1_714_540_800_000; // 2024-05-01T00:00:00Z あたり

await debug.persistStreamData(undefined, {
  presetPosts: samplePosts,
  getNow: () => fixedNow,
});

const stored = await debug.loadStreamPostsFromDb();

const requiredKeys = [
  'index',
  'streamId',
  'teacherName',
  'postedAt',
  'body',
  'attachments',
  'savedAt',
];

const report = stored.map((record) => {
  const missing = requiredKeys.filter(
    (key) => !Object.prototype.hasOwnProperty.call(record, key),
  );
  return {
    streamId: record.streamId,
    hasAllKeys: missing.length === 0,
    missingKeys: missing,
  };
});

console.log('▼ IndexedDB から読み出したレコード一覧');
console.table(
  stored.map((record) => ({
    streamId: record.streamId,
    teacherName: record.teacherName,
    savedAt: record.savedAt,
    attachmentCount: record.attachments.length,
  })),
);

console.log('▼ 必須プロパティの検証結果');
console.table(report);

const everyRecordValid = report.every((row) => row.hasAllKeys);

if (!everyRecordValid) {
  console.error('❌ 必須プロパティが欠けているレコードがあります');
  process.exitCode = 1;
} else {
  console.log('✅ すべてのレコードに必要なプロパティがそろっています');
}
