# Bundled Libraries

このディレクトリには、拡張機能内で直接読み込むスタンドアロン版ライブラリを格納しています。外部 CDN へ依存しない方針（`README.md`・`docs/AGENTS.md` 参照）に従い、ここに置いたファイルのみを `content.js` からロードします。

## バージョン一覧

| ライブラリ | 同梱ファイル | バージョン | ライセンス | Upstream |
| --- | --- | --- | --- | --- |
| Fuse.js | `fuse.min.js` | 6.6.2 | Apache-2.0 | https://github.com/krisk/Fuse |
| idb | `idb.min.js` | 7.1.1 | MIT | https://github.com/jakearchibald/idb |
| hotkeys-js | `hotkeys.min.js` | 3.13.8 | MIT | https://github.com/jaywcjlove/hotkeys |

## 取得手順と検証ポイント

各ライブラリは npm 公式リリースの IIFE / browser 向けビルドを採用しています。再取得時は以下の手順でファイルを差し替え、ライセンスヘッダを保持してください。

### Fuse.js 6.6.2
- 取得: `npm view fuse.js dist.tarball` でアーカイブ URL を確認し、`npm pack fuse.js@6.6.2` でダウンロード。
- 抽出: アーカイブ内の `dist/fuse.min.js` を `src/libs/fuse.min.js` にコピー。
- 検証: 先頭ヘッダのバージョンとライセンスを確認し、`README.md` に記載された Fuse 設定が動作するかを手動テスト（検索・サジェスト）。

### idb 7.1.1
- 取得: `npm pack idb@7.1.1` を実行し、生成された tarball を展開。
- 抽出: `build/index.min.js` 相当の IIFE 版（`build/index.js` を Terser で minify するか、CDN 版 `build/iife/index-min.js`）を `src/libs/idb.min.js` に保存。
- 検証: 先頭コメントに MIT ライセンス表記を残す。`chrome://extensions` で拡張を再読み込みし、IndexedDB 初期化・検索キャッシュが機能することを DevTools (Application → IndexedDB) で確認。

### hotkeys-js 3.13.8
- 取得: `npm pack hotkeys-js@3.13.8` または公式リポジトリの `dist/hotkeys.min.js` をダウンロード。
- 抽出: `dist/hotkeys.min.js` を `src/libs/hotkeys.min.js` に置き換え。
- 検証: ヘッダコメントに MIT ライセンスが含まれていることを確認し、`README.md` のキーボードショートカットが発火するか手動テスト。

## 更新ポリシー

1. `docs/AGENTS.md` の「No new network calls」ポリシーに従い、アップデート後も外部通信が発生しないことを DevTools Network タブで確認する。
2. バージョンを更新する場合は、本ファイルと `README.md` の該当記述（バージョン・依存方針）を同時に更新し、`CHANGELOG.md` に記録する。
3. 差し替え後は `src/content.js` の `LIB_SPECS` に変更がないか確認し、必要であれば新ファイル名へ更新する。
4. PR では取得元とハッシュ（可能であれば `shasum`）を記載し、手動テストログ（検索・ショートカット・IndexedDB 動作）を添付する。

## トラブルシュート

- フィールドが Global オブジェクトに公開されていない場合は、バンドル形式が IIFE か確認（ESM 版では `Fuse` や `hotkeys` が `window` に載らない）。
- Size が大きく変化した場合は、圧縮設定や不要なソースマップが含まれていないか再チェック。
- CSP によってブロックされる場合は、`manifest.json` の `web_accessible_resources` が最新のファイル名を含むか確認する。

