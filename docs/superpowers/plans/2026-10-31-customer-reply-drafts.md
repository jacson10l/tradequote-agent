# Customer Reply Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add deterministic English/German customer reply drafts to the saved quote workspace and verify them in the real Electron demo flow.

**Architecture:** A pure presentation formatter consumes immutable quote snapshots and persisted check reports. A focused renderer panel presents the selected version, switches language, and copies read-only text; it never writes business data or sends messages.

**Tech Stack:** TypeScript strict, React, Vitest, Playwright Electron, Zod contracts, pnpm workspace.

---

### Task 1: Add presentation reply formatter

**Files:**
- Create: `apps/desktop/src/renderer/src/features/customer-reply-format.ts`
- Test: `apps/desktop/src/renderer/src/features/customer-reply-format.test.ts`

- [x] Write tests for English and German subjects/bodies, line totals, pending labels, unknown totals, source references, review warnings, and selected quote version.
- [x] Run the focused formatter test and confirm it fails before implementation.
- [x] Implement a pure formatter with localized labels and deterministic decimal strings; preserve unknown values and never infer missing payment/delivery.
- [x] Export the formatter and result type from the presentation file.
- [x] Run the focused test and typecheck.

### Task 2: Add renderer draft panel

**Files:**
- Create: `apps/desktop/src/renderer/src/features/customer-reply.tsx`
- Modify: `apps/desktop/src/renderer/src/features/quotes.tsx`
- Test: `apps/desktop/src/renderer/src/features/customer-reply.test.tsx`

- [x] Write component tests for language switching, unreviewed badge, review warning, and clipboard success/failure.
- [x] Implement the panel using the formatter, selected quote, and check reports loaded by `QuoteChecks`'s public query boundary or a small read-only query in the panel.
- [x] Keep textarea read-only and copy-only; do not add approval/export/send actions.
- [x] Mount the panel beside saved quote details, checks, and differences.
- [x] Run renderer tests and typecheck.

### Task 3: Extend real Electron demo evidence

**Files:**
- Modify: `tests/e2e/quote-agent.spec.ts`
- Create: `wiki-project/raw/c-hackathon-demo-validation.json`

- [x] Extend the existing V1→V2→V3 Electron scenario to assert English and German draft text, version identity, unreviewed status, and absence of approval/send behavior.
- [x] Run `pnpm build` and the focused Electron test with a synthetic model server.
- [x] Capture exact command, environment, exit code, and key output in the raw evidence file.

### Task 4: Synchronize project Wiki and deliver

**Files:**
- Create: `wiki-project/wiki/C客户回复草稿桌面切片.md`
- Create: `wiki-project/wiki/tasks/C黑客松演示闭环实现.md`
- Modify: `wiki-project/wiki/黑客松演示封板目标与ABC分工.md`
- Modify: `wiki-project/CONTEXT.md`, `wiki-project/wiki/项目状态.md`, `wiki-project/index.md`, `wiki-project/log.md`

- [x] Record behavior, boundaries, source paths, and verification evidence.
- [x] Run code index generation and `--check`, Wiki lint, `check-wiki-sync --base <task base>`, typecheck, focused tests, build, and focused Electron E2E.
- [x] Preserve any failed attempts in raw evidence and do not mark the overall hackathon task complete until both flows and the output are verified.
- [x] Commit the implementation and documentation together, then push the C branch and verify the remote SHA.

## Review refinements

Renderer cannot import domain, so formatting lives beside the panel and copies saved values without calculation. Only reports with matching quoteId=(rootId??id), revisionId=id and quoteVersion=version qualify; reject mismatched or duplicate reports, choose checkedAt descending then reportId ascending. All issue severities, coverage, suggestions and frozen evidence references are included. Empty/loading/error states cannot imply checks passed. Keep quote line order and sort report issues by checkId and evidence by stable identity; never locale-format decimal strings. Mapping changes require wiki-tools/wiki-sync regressions. Read DESIGN.md before UI changes (done). Existing session authorizes C push; otherwise delivery is local-only. E2E must persist a real report, switch V1/V3, test risk/no-report, copy and confirm the quote remains draft.

Explicit P0 mapping: register all customer-reply* source/test files and both docs/superpowers Markdown files in wiki-config.json, add the new knowledge page to modified main/quotes/checks/E2E mappings, regenerate, run wiki-tools/wiki-sync regressions and fixed taskBase sync. Clipboard acceptance adds only trusted main-frame clipboard-sanitized-write; all reads and other windows remain denied.

Executed in the current session after explicit user approval. Tests and evidence are recorded in wiki-project/raw/c-hackathon-demo-validation.json. The public domain export was superseded by the renderer presentation-only formatter to respect repository import boundaries. This slice does not close the overall hackathon rehearsal task.
