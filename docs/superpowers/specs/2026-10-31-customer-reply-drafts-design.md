# Customer Reply Drafts Design

**Goal:** Add a deterministic English/German customer reply draft panel to the current saved quote so the hackathon flow has a visible customer-facing output while remaining explicitly unreviewed and local-only.

## Scope

The panel is available for the selected saved quote in the desktop quote workspace. It generates English or German text from the immutable `QuoteSnapshot` and the latest persisted quote-check report when one exists. It does not send email, export PDF, approve, publish, call the model, or add a database table.

## Data and behavior

A pure presentation function accepts a `QuoteSnapshot`, optional `CheckReport[]`, and `en`/`de` language. It returns a subject, body, quote id/version, and `unreviewed` status. It renders each quote line, currency, goods total (or `unknown`), payment and delivery (or a localized pending label), frozen source references, pending items, and a clear unreviewed notice. Any blocking or pending check adds a localized manual-review warning; a clean report still remains unreviewed.

The renderer panel is placed with the saved quote details, checks, and differences. Language is selected locally, text is shown in a labelled read-only textarea, and a copy button uses the browser clipboard API with a visible success/failure message. The panel recomputes when the selected quote or check report changes. Clipboard failure does not alter data.

## Boundaries

The presentation function owns wording and deterministic formatting. The renderer owns query/loading and clipboard interaction. Existing quote persistence, check IPC, approval gate, and maintenance services remain unchanged.

## Verification

Unit tests cover both languages, line/total/pending rendering, unknown amount preservation, review warnings, and quote version binding. Renderer tests cover language switching, visible unreviewed state, and copy feedback. A real Electron E2E extends the existing quote-agent flow to verify V3 English/German drafts and the no-approval boundary.

## Review refinements

Renderer cannot import domain, so formatting lives beside the panel and copies saved values without calculation. Only reports with matching quoteId=(rootId??id), revisionId=id and quoteVersion=version qualify; reject mismatched or duplicate reports, choose checkedAt descending then reportId ascending. All issue severities, coverage, suggestions and frozen evidence references are included. Empty/loading/error states cannot imply checks passed. Keep quote line order and sort report issues by checkId and evidence by stable identity; never locale-format decimal strings. Mapping changes require wiki-tools/wiki-sync regressions. Read DESIGN.md before UI changes (done). Existing session authorizes C push; otherwise delivery is local-only. E2E must persist a real report, switch V1/V3, test risk/no-report, copy and confirm the quote remains draft.
