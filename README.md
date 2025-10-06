# Google Classroom Search（API + IndexedDB + Fuse）

Google Classroom（Web）に**高速・高精度の横断検索**を付与する Chrome 拡張機能。Classroom API から安全にデータを取得し、ローカル IndexedDB に保存したコレクションを Fuse.js で検索します。

> 日本語 UI 固定／ダーク/ライト自動追従／外部送信なし（OAuth 時を除く）

---

## 特長

- 🔎 **1 語検索＋予測候補**（日本語・英数、あいまい一致）
- 🧩 **フィルタ**：教師／期日（≦・≧・範囲）／添付タイプ（Docs/Sheets/Slides/PDF/Link）
- 🗂 **対象**：受講中の全クラス横断（ストリーム投稿・課題・資料・コメント・添付タイトル/ファイル名）
- ⚡ **150ms 以内の候補表示**（インデックス済み時、10k 件規模想定）
- 🧠 **Fuse.js ベース**の類似度検索＋日本語 N-gram 補助
- 🕶 **テーマ連動**：Classroom のダーク/ライト自動検知
- 🛡 **プライバシー・バイ・デザイン**：IndexedDB 保存、必要最小限のネット送信（OAuth と Classroom API のみ）

セキュリティ強化（実装済み）
- ナビゲーションは `https:` かつ `classroom.google.com` のみ許可
- BG 経由の API コールは `https://classroom.googleapis.com` の `GET` のみ許可（任意 URL/メソッド禁止）
- DOM 描画は `textContent`/`createTextNode` ベース（`innerHTML` 不使用）

### 設計のポイント

- API 取得 → IndexedDB 保存 → Fuse.js 検索 のシンプル三層
- UI はトップバー常駐・非侵入（既存 UI への干渉を最小化）
- 差分同期（新規追加/削除）で再索引のコストを抑制
- 拡張内リソースのみを読み込み（CSP を尊重、外部 CDN 不使用）

---

## スクリーンショット

検索バー（上部固定）と、検索候補パネルのイメージです。

![クイック検索バー - 上部固定](src/libs/icon.svg/Screenshot%202025-10-06%2010.08.28.png)

![検索候補パネルとハイライト](src/libs/icon.svg/Screenshot%202025-10-06%2010.08.43.png)

---

## インストール（開発者向け）

1. このリポジトリをクローン
2. Chrome → `chrome://extensions/` → 右上「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ 本リポジトリのルート（`manifest.json` がある階層）を選択
4. Classroom（`https://classroom.google.com/`）を開く → 上部バー右側にクイック検索（試作UI）が表示

**必要権限（MV3）**

- `permissions`: `storage`, `scripting`, `identity`
- `host_permissions`: `https://classroom.google.com/*`, `https://classroom.googleapis.com/*`, `https://www.googleapis.com/*`
- `content_scripts`: `run_at: document_idle`

---

## 使い方

- `/`：検索バーへフォーカス
- `Ctrl + K`：コマンド/クエリ開始
- `↑ / ↓`：候補移動、`Enter`：決定、`Esc`：閉じる
- フィルタ：教師・期日・添付タイプをチップ/ドロップダウンで AND 適用

補足：上部バーのクイック検索は独自クラス（`gcx-topbar`, `gcx-topbar-input`）でスタイリングしており、Classroom のメニュー実装と干渉しないように設計しています。

---

## アイコン / ファビコン

- 使用アイコン（PNG マスター）: `src/libs/icon.svg/Classroom-finder-icon.png`（1024×1024）
- manifest.json にアイコンを登録済み（各サイズに同一 PNG を指定）

manifest.json の設定は以下のとおりです（本リポジトリのファイルパスに合わせています）。

```jsonc
{
  "icons": {
    "16": "src/libs/icon.svg/Classroom-finder-icon.png",
    "32": "src/libs/icon.svg/Classroom-finder-icon.png",
    "48": "src/libs/icon.svg/Classroom-finder-icon.png",
    "128": "src/libs/icon.svg/Classroom-finder-icon.png"
  }
}
```

注: 現在は 1 つの高解像度 PNG を各サイズとして登録しています（Chrome が適切に縮小します）。必要に応じて将来、個別サイズの PNG を用意することも可能です。

---

## 検索仕様

- **エンジン**：Fuse.js（`threshold≈0.3`, `ignoreLocation:true`）
- **重み**：`title^3`, `topic^2`, `text`, `className`, `teachers`, `attachments.title`
- **日本語対策**：プレフィックス優先のサジェスト辞書＋簡易 bi/tri-gram
- **クエリ解釈**：空白区切り AND、`"..."`でフレーズ一致  
  ※今後：`class:`, `type:`, `due<=` 等の演算子拡張

---

## データモデル（IndexedDB）

**Document**

- `id: string`（安定 URL/合成キー）、`url: string`
- `type: 'assignment' | 'material' | 'post' | 'comment'`
- `className: string`, `teachers: string[]`, `topic?: string`
- `title: string`, `text: string`（抜粋）、`due?: epoch`
- `attachments: Attachment[]`, `updatedAt: epoch`

**Attachment**

- `kind: 'docs' | 'sheets' | 'slides' | 'pdf' | 'link' | 'other'`
- `title: string`, `url: string`

---

## アーキテクチャ（現状構成）

- `manifest.json` # MV3 マニフェスト（ルート）
- `src/content.js` # UI 注入（トップバー・サジェスト） / IndexedDB / Fuse 検索
- `src/background.js` # OAuth トークン取得 + Classroom API 代理フェッチ（許可ホスト/HTTPS/GET 限定）
- `src/gcx-topbar.css` # トップバー UI スタイル
- `src/libs/` # 同梱ライブラリ（`fuse.esm.js` ほか）
- `scripts/` # 補助スクリプト（開発用）
- `docs/` # ドキュメント（要件定義など）

将来追加予定（設計済みだが未実装）
- `src/db.js`（IndexedDB ラッパ）
- `src/search.js`（Fuse 初期化/サジェスト）
- `src/ui/`（サイドバー/結果パネル）
- `options/`（再インデックス/削除/モード切替）

**API モードの方針**

- 既定：API モード（OAuth 同意後、Classroom API から取得）
- 保存：IndexedDB（ローカルのみ）に統一
- ネット送信：OAuth と Classroom API へのアクセスのみ（任意 URL/メソッドは不許可）

---

## 受け入れ基準（MVP）

1. インデックス済みで**1 語 → 候補 150ms 以内**
2. 教師・期日・添付タイプの**AND フィルタ**が正しく適用
3. **添付タイトル/ファイル名**でヒット
4. ダーク/ライト双方で**視認性**（コントラスト/ハイライト）良好
5. **不要な外部送信なし**を DevTools Network で確認（OAuth と Classroom API 以外の通信が無い）
6. DOM 崩壊時、**API 切替提案**→ 同意 → 正常動作

---

## 非スコープ（MVP）

- 課題の提出/採点/通知操作
- モバイルアプリ対応、他ブラウザ完全対応
- 添付の**全文索引**（タイトル/ファイル名のみ）
- 高度なクエリ言語（次版以降）

---

## パフォーマンス

- 初回インデックス：段階的取得とインデックス作成（UI 応答を優先）
- 差分更新：定期同期と差分判定（新規/削除を検出して反映）
- データ増大対策：抜粋長上限、添付はメタのみ

---

## プライバシー / セキュリティ

- ローカル保存（IndexedDB）のみ。保存項目は最小限の方針
- ナビゲーションは `https:` かつ `classroom.google.com` のみ許可
- BG の Classroom API 代理フェッチは `https://classroom.googleapis.com` の `GET` 限定
- DOM は `textContent` で描画（`innerHTML` 不使用）
- 将来の匿名ログは**明示オプトイン**のみ

---

## 互換性・制約

- Chrome 最新版 / Classroom Web（管理端末は対象外）
- 日本語 UI 固定（i18n は文言 JSON 化まで）
- Classroom の API 可用性に依存（トークン/権限/HTTP ステータスに応じて再試行/通知）

---

## 開発の進め方（WBS / MVP 例）

1. 詳細設計/画面モック（2h）
2. MV3 雛形/ビルド環境（2h）
3. DOM 抽出層（課題/資料/添付）（5h）
4. IndexedDB 層（CRUD/GC/移行）（3h）
5. 検索（Fuse ＋サジェスト）（4h）
6. UI（サイドバー/結果/キーバインド/a11y）（5h）
7. 初回クロール/差分/性能調整（3h）
8. QA/計測/微修正（2h）

---

## ロードマップ

- **M1**：DOM 版 MVP（検索・フィルタ・UI・受入 1–5）
- **M2**：耐 DOM 変更性強化（セレクタ冗長化/E2E）
- **M3**：API モード（同意 → 取得 → 索引 → 切替 UI）
- **M4**：クエリ演算子 & ショートカット拡張

---

## トラブルシュート

- 検索バーが出ない：拡張が有効/権限付与を確認、ページ再読込
- 候補が遅い：Options から再インデックス、タブを減らす、古いデータの GC
- 結果が少ない：Options で API 切替を許可（同意後に再索引）


---

## FAQ

**Q. なぜ API ベース？**  
スキーマが安定しており、データ取得が確実。ローカル IndexedDB に保存して Fuse.js で検索するため、以降の検索は高速です。

**Q. どんなネット通信をしますか？**  
OAuth によるトークン取得と、Classroom API（`https://classroom.googleapis.com`）への `GET` のみです。任意ドメイン/メソッドは許可していません。

---

## 貢献

Issue / PR 歓迎。方針：軽量・高速・私的利用の安全性を最優先。  
コード規約/テスト方針は `.github/CONTRIBUTING.md` を参照（追加予定）。

---

## ライセンス

TBD

---

## 同梱ライブラリについて

- 使用中: `src/libs/fuse.esm.js`（曖昧検索/Fuse.js）
- 将来検討・未使用: `src/libs/hotkeys.min.js`（キーボードショートカット）、`src/libs/idb.min.js`（IndexedDB ラッパ）
  - 現状はブラウザ標準 API（IndexedDB）とシンプルなイベントで実装。将来的に保守性を優先する場合に差し替え可。
