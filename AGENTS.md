# AGENTS.md — Google Classroom Search Extension

> For **AI coding agents**. Obey strictly. If unsure, **STOP** and request human review.  
> Human-facing docs are in `README.md`.

## 0. Goal (non-negotiable)

- Add **fast, accurate cross-class search** to Google Classroom Web.
- **Privacy-first**: no network transmissions; store data **locally in IndexedDB** only.
- UX budget: show suggestions **≤ 150 ms** (after indexing), scale to **~10k docs**.

## 1. Do / Don't

**Do**

- Use existing permissions only: `https://classroom.google.com/*`, `storage`, `scripting`.
- Keep all data **local** in IndexedDB store: `gcsearch.documents`.
- Implement selector **tiering**: `primary → fallback1 → fallback2`.
- Apply **AND** filters for `teacher` / `due` / `attachment type`.
- Use idle-time chunking for initial indexing (`requestIdleCallback`, ~50 ms slices).
- Use MutationObserver for **incremental** reindex.

**Don't**

- **No new network calls** (CDN/analytics/telemetry included).
- Don’t widen permissions or add host domains.
- Don’t scrape private fields beyond **visible DOM**.
- Don’t modify search weights/threshold without editing this file.
- Don’t block the main thread > 50 ms per task.

## 2. Runtime & Commands

- Node: **v20 LTS** / Package Manager: **pnpm**
- Install: `pnpm i`
- Dev (watch): `pnpm dev`
- Build (MV3): `pnpm build` → outputs `dist/`
- Tests: unit `pnpm test` (Vitest), e2e `pnpm e2e` (Playwright)
- Lint / Typecheck: `pnpm lint` / `pnpm typecheck`

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

## 4. Search Spec (Fuse.js)

- Keys & weights: `title^3`, `topic^2`, `text`, `className`, `teachers`, `attachments.title`
- Config: `threshold: 0.30`, `ignoreLocation: true`, `minMatchCharLength: 2`
- JP handling: prefix-first **suggest dictionary** + **bi/tri-gram** tokenization
- Results: top **20** items, with **highlight** spans for matched tokens

## 5. DOM Extraction Notes

- Source pages: **class list / stream / assignments / materials / comments**
- Example selector tiers:
  - Title: `h1[aria-level="1"]` → `[data-title]` → `.YVj4Ic`
  - Due: `[data-due]` → aria text → plain-text pattern `期限:`
- If **primary selector fail-rate > 30%** in a crawl, mark **DOM degraded**.
- Respect page theme; observe theme toggles to re-render highlights.

## 6. Indexing & Performance

- Initial index: **idle-time chunking** via `requestIdleCallback` (slice ~50 ms).
- Incremental: **MutationObserver** patches (debounced).
- Budget (indexed state): **50–150 ms** to first suggestions for 1-token query.
- Avoid synchronous heavy loops; break work into microtasks.

## 7. Filters

- **AND semantics** across all filters.
- `due` supports `<=`, `>=`, and range; compare as **epoch ms** (inclusive bounds).
- `attachment type` determined by **MIME / URL pattern / extension** in this order.

## 8. API Fallback (OAuth, read-only)

- Trigger when:
  1. Selector hit-rate drops **> 30%**, or
  2. Dataset **> 30k** and latency exceeds budget persistently.
- Flow: consent modal → OAuth (Classroom API, **read-only**) → map to the **same schema**.
- Storage remains **IndexedDB**; **no telemetry** added.

## 9. Acceptance (must pass)

1. 1-token → suggestions **≤ 150 ms**
2. Teacher / Due / Attachment **AND filters** correct
3. Attachment **title/filename** is searchable
4. Dark/Light both readable (contrast/highlight AA)
5. **No network** in DevTools (API mode excluded)
6. DOM break → **API prompt** shows → consent → search works

## 10. Security & Privacy

- Default: **no analytics, no remote**. Options page exposes **Reindex / Purge / Mode switch**.
- Any change to permissions/data retention → update `AGENTS.md` + `docs/security.md` and open PR.

## 11. Conventions

- Commits: **Conventional Commits** (`feat:`, `fix:`, `perf:`, `docs:` …)
- Branches: `feature/<area>-<short>`
- Code style: **ESLint + Prettier (strict)**; no commented-out code in `src/`.

## 12. Risks (watchlist)

- **Classroom DOM churn** → keep selector tier tables up-to-date; add minimal e2e checks.
- **Data bloat** → rolling window + snippet length cap; attachments = **meta only**.
- **Managed devices / school policy** → show **read-only banner** when detected.

## 13. Change Control

- Don’t alter goals/thresholds/permissions without **editing this file**.
- On ambiguity, **STOP** and request human review with a short diff proposal.
