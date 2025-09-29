import test from 'node:test';
import assert from 'node:assert/strict';
import Fuse from '../src/libs/fuse.esm.js';

// content.js と同じ Fuse 設定をここでも再現
const fuseOptions = {
  includeMatches: true,
  includeScore: true,
  shouldSort: true,
  threshold: 0.3,
  keys: [
    { name: 'teacherName', weight: 0.4 },
    { name: 'body', weight: 0.4 },
    { name: 'attachments.title', weight: 0.2 },
    { name: 'postedAt.text', weight: 0.05 },
  ],
  minMatchCharLength: 1,
};

// テスト用の仮データ（実際の IndexedDB のレコードを真似ている）
const samplePosts = [
  {
    streamId: 'post-1',
    teacherName: '山田 太郎',
    body: '次回の数学テスト範囲は p.30 〜 p.45 です。',
    attachments: [{ title: '数学プリント.pdf' }],
    postedAt: { text: '2024年5月1日' },
  },
  {
    streamId: 'post-2',
    teacherName: '佐藤 花子',
    body: '体育祭のリハーサル時間割を共有します。',
    attachments: [{ title: '体育祭タイムテーブル.xlsx' }],
    postedAt: { text: '2024年5月2日' },
  },
  {
    streamId: 'post-3',
    teacherName: '田中 一郎',
    body: '英語の小テスト答案を返却しました。',
    attachments: [{ title: '英語課題.docx' }],
    postedAt: { text: '2024年5月3日' },
  },
];

test('本文のキーワードでヒットする', () => {
  const fuse = new Fuse(samplePosts, fuseOptions);
  const results = fuse.search('数学', { limit: 20 });
  assert.equal(results[0].item.streamId, 'post-1');
});

test('先生の名前でも検索できる', () => {
  const fuse = new Fuse(samplePosts, fuseOptions);
  const results = fuse.search('佐藤', { limit: 20 });
  assert.equal(results[0].item.streamId, 'post-2');
});

test('添付ファイル名からも引っ張れる', () => {
  const fuse = new Fuse(samplePosts, fuseOptions);
  const results = fuse.search('タイムテーブル', { limit: 20 });
  assert.equal(results[0].item.streamId, 'post-2');
});

test('結果は 20 件までに制限される', () => {
  const manyPosts = Array.from({ length: 35 }, (_, index) => ({
    streamId: `bulk-${index}`,
    teacherName: 'テスト 先生',
    body: 'これは課題のサンプル本文です。',
    attachments: [{ title: '課題資料.pdf' }],
    postedAt: { text: '2024年5月4日' },
  }));
  const fuse = new Fuse(manyPosts, fuseOptions);
  const results = fuse.search('課題', { limit: 20 });
  assert.equal(results.length, 20);
});
