<!--
  このファイルは「AI コーディングエージェント」向けの運用・実装方針です。
  人間ユーザー向けの説明は README.md を参照してください。
  変更時は本ファイルの数値目標・ポリシーを必ず更新し、逸脱しないこと。
-->

# AGENTS.md — Google Classroom Search Extension

<!-- エージェントは本ガイドラインに厳密に従うこと。曖昧な点は作業を止め、人間に確認を依頼すること。 -->
<!-- 人間向けドキュメントは `README.md` を参照。 -->

## 0. Goal (non-negotiable)

- Add **fast, accurate cross-class search** to Google Classroom Web.
- **Privacy-first**: no network transmissions; store data **locally in IndexedDB** only.
- UX budget: show suggestions **≤ 150 ms** (after indexing), scale to **~10k docs**.
<!-- 目的（変更不可）: 速く正確な横断検索を提供。通信は行わずデータは IndexedDB にのみ保持。インデックス済み状態で 150ms 以内に候補表示、約 1 万件までスケール。 -->

## 1. Do / Don't

**Do**

- Use existing permissions only: `https://classroom.google.com/*`, `storage`, `scripting`.
- Keep all data **local** in IndexedDB store: `gcsearch.documents`.
- Implement selector **tiering**: `primary → fallback1 → fallback2`.
- Apply **AND** filters for `teacher` / `due` / `attachment type`.
- Use idle-time chunking for initial indexing (`requestIdleCallback`, ~50 ms slices).
- Use MutationObserver for **incremental** reindex.
<!-- やること: 既存権限のみ使用。データは IndexedDB にのみ保存。セレクタはプライマリ→フォールバックの段階的適用。教師/期限/添付タイプは AND 絞り込み。初回はアイドル時間で分割処理。差分は MutationObserver で再インデックス。 -->

**Don't**

- **No new network calls** (CDN/analytics/telemetry included).
- Don’t widen permissions or add host domains.
- Don’t scrape private fields beyond **visible DOM**.
- Don’t modify search weights/threshold without editing this file.
- Don’t block the main thread > 50 ms per task.
<!-- やらないこと: 新たな通信禁止、権限拡張禁止、可視 DOM 以外のスクレイプ禁止、本ファイルに記載なく重み/閾値変更禁止、タスク毎 50ms 超のブロッキング禁止。 -->

## 2. Runtime & Commands

- Node: **v20 LTS** / Package Manager: **npm**
- Install: `npm i`
- Dev (watch): `npm run dev` (optional)
- Build (MV3): `npm run build` → outputs `dist/` (optional; unpacked load also可)
- Tests: unit `npm test`（任意）
- Lint: `npm run lint`
<!-- 実行環境/コマンド: Node v20、npm を使用。開発は任意、ビルドは MV3。テスト/リントの規律を守る。 -->

## 3. Data Contract (IndexedDB)

Store name: `gcsearch.documents`  
Types (conceptual):
type Kind = 'assignment'|'material'|'post'|'comment';
type Att = 'docs'|'sheets'|'slides'|'pdf'|'link'|'other';

    interface Attachment { kind: Att; title: string; url: string; }
    interface Document {
      id: string; url: string; type: Kind;
      className: string; teachers: string[]; topic?: string;
      title: string; text: string; due?: number;
      attachments: Attachment[]; updatedAt: number;
    }

- **GC policy**: keep latest **N = 120 days**; roll off older unless pinned.
- **No PII uplift** beyond what is already visible in Classroom UI.
<!-- データ契約: 保存名は gcsearch.documents。120 日ローリング保持（ピン留め除く）。UI で可視な情報のみ保持し、PII を拡張しない。 -->

## 4. Search Spec (Fuse.js)

- Keys & weights: `title^3`, `topic^2`, `text`, `className`, `teachers`, `attachments.title`
- Config: `threshold: 0.30`, `ignoreLocation: true`, `minMatchCharLength: 2`
- JP handling: prefix-first **suggest dictionary** + **bi/tri-gram** tokenization
- Results: top **20** items, with **highlight** spans for matched tokens
<!-- 検索仕様: キーと重みは上記。閾値 0.30、位置無視、最小 2 文字。日本語は接頭辞優先のサジェスト辞書 + 2/3-gram。上位 20 件をハイライト付きで返す。 -->

## 5. DOM Extraction Notes

- Source pages: **class list / stream / assignments / materials / comments**
- Example selector tiers:
  - Title: `h1[aria-level="1"]` → `[data-title]` → `.YVj4Ic`
  - Due: `[data-due]` → aria text → plain-text pattern `期限:`
- If **primary selector fail-rate > 30%** in a crawl, mark **DOM degraded**.
- Respect page theme; observe theme toggles to re-render highlights.
<!-- DOM 抽出: 対象ページは一覧/ストリーム/課題/教材/コメント。セレクタは段階適用。一次セレクタの失敗率が 30% 超なら DOM 劣化扱い。テーマ変更に追随してハイライト再描画。 -->

## 6. Indexing & Performance

- Initial index: **idle-time chunking** via `requestIdleCallback` (slice ~50 ms).
- Incremental: **MutationObserver** patches (debounced).
- Budget (indexed state): **50–150 ms** to first suggestions for 1-token query.
- Avoid synchronous heavy loops; break work into microtasks.
<!-- インデクシング/性能: 初回はアイドル時間で分割、差分はデバウンスして反映。1 トークンで 50–150ms 以内に候補。重い同期待ちは避け、マイクロタスクに分割。 -->

## 7. Filters

- **AND semantics** across all filters.
- `due` supports `<=`, `>=`, and range; compare as **epoch ms** (inclusive bounds).
- `attachment type` determined by **MIME / URL pattern / extension** in this order.
<!-- フィルタ: すべて AND で適用。期限は比較/範囲をサポート（エポック ms）。添付タイプは MIME → URL パターン → 拡張子の順に判定。 -->

## 8. API Fallback (OAuth, read-only)

- Trigger when:
  1. Selector hit-rate drops **> 30%**, or
  2. Dataset **> 30k** and latency exceeds budget persistently.
- Flow: consent modal → OAuth (Classroom API, **read-only**) → map to the **same schema**.
- Storage remains **IndexedDB**; **no telemetry** added.
<!-- API フォールバック: セレクタ命中率低下や巨大データで遅延が続く場合に限定。同意→OAuth（読み取り専用）→同一スキーマで保存。ストレージは IndexedDB のまま。計測等は追加しない。 -->

## 9. Acceptance (must pass)

1. 1-token → suggestions **≤ 150 ms**
2. Teacher / Due / Attachment **AND filters** correct
3. Attachment **title/filename** is searchable
4. Dark/Light both readable (contrast/highlight AA)
5. **No network** in DevTools (API mode excluded)
6. DOM break → **API prompt** shows → consent → search works
<!-- 受け入れ基準: 上記 6 点を満たすこと。特にレイテンシとフィルタ正確性、テーマ可読性、通信なし、DOM 破綻時の API モード遷移を確認。 -->

## 10. Security & Privacy

- Default: **no analytics, no remote**. Options page exposes **Reindex / Purge / Mode switch**.
- Any change to permissions/data retention → update `AGENTS.md` + `docs/security.md` and open PR.
<!-- セキュリティ/プライバシー: 解析/リモートなしが既定。オプションは再索引/消去/モード切替のみ。権限や保持方針変更時は本書と security.md を更新し PR を出す。 -->

## 11. Conventions

- Commits: **Conventional Commits** (`feat:`, `fix:`, `perf:`, `docs:` …)
- Branches: `feature/<area>-<short>`
- Code style: **ESLint + Prettier (strict)**; no commented-out code in `src/`.
- Language: **JavaScript (ES Modules)**. 型は **JSDoc typedef** で表現。
<!-- 規約: コミットは Conventional、ブランチ命名を統一。ESLint/Prettier 厳格。src 内にコメントアウトコードを残さない。言語は JS（ESM）、型は JSDoc。 -->

## 12. Risks (watchlist)

- **Classroom DOM churn** → keep selector tier tables up-to-date; add minimal e2e checks.
- **Data bloat** → rolling window + snippet length cap; attachments = **meta only**.
- **Managed devices / school policy** → show **read-only banner** when detected.
<!-- リスク: Classroom の DOM 変化、データ肥大（ローリングとスニペット長制限で抑制）、管理端末検出時のリードオンリーバナー表示。 -->

## 13. Change Control

- Don’t alter goals/thresholds/permissions without **editing this file**.
- On ambiguity, **STOP** and request human review with a short diff proposal.
<!-- 変更管理: 目標/閾値/権限を変えるときは本書を編集。曖昧な場合は作業停止し、短い差分提案を添えて確認を依頼。 -->
