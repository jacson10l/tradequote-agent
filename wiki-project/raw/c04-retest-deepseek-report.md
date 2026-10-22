# C04 deepseek evaluation

Status: failed. Provider validation: observed. Synthetic data only.
Model: deepseek-flash. Model calls: 82. Real request attempts: 82.
Token counts and costs: unknown (not exposed by adapter). Fixture success does not validate DeepSeek semantics.

| Case | Status | Code | Failed checks |
|---|---|---|---|
| apparel-zh-v1 | passed | observed | — |
| apparel-zh-v2 | passed | observed | — |
| apparel-zh-v3 | failed | ACTION_NOT_ALLOWED | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| apparel-en-v1 | passed | observed | — |
| apparel-en-v2 | passed | observed | — |
| apparel-en-v3 | passed | observed | — |
| apparel-de-v1 | passed | observed | — |
| apparel-de-v2 | failed | MODEL_INVALID_OUTPUT | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| apparel-de-v3 | not_run | prior_step_failed | — |
| panel-zh-v1 | failed | ACTION_NOT_ALLOWED | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| panel-zh-v2 | not_run | prior_step_failed | — |
| panel-zh-v3 | not_run | prior_step_failed | — |
| panel-en-v1 | failed | ACTION_NOT_ALLOWED | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| panel-en-v2 | not_run | prior_step_failed | — |
| panel-en-v3 | not_run | prior_step_failed | — |
| panel-de-v1 | passed | observed | — |
| panel-de-v2 | passed | observed | — |
| panel-de-v3 | failed | ACTION_NOT_ALLOWED | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| fastener-zh-v1 | failed | ACTION_NOT_ALLOWED | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| fastener-zh-v2 | not_run | prior_step_failed | — |
| fastener-zh-v3 | not_run | prior_step_failed | — |
| fastener-en-v1 | failed | ACTION_NOT_ALLOWED | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| fastener-en-v2 | not_run | prior_step_failed | — |
| fastener-en-v3 | not_run | prior_step_failed | — |
| fastener-de-v1 | failed | ACTION_NOT_ALLOWED | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| fastener-de-v2 | not_run | prior_step_failed | — |
| fastener-de-v3 | not_run | prior_step_failed | — |
| clarification-zh | passed | MISSING_FACTS | — |
| clarification-en | passed | MISSING_FACTS | — |
| clarification-de | passed | MISSING_FACTS | — |
| rule-block | passed | RULE_BLOCKED | — |
| failure-auth | not_run | fixture_only | — |
| failure-rate_limit | not_run | fixture_only | — |
| failure-server | not_run | fixture_only | — |
| failure-network | not_run | fixture_only | — |
| failure-invalid_json | not_run | fixture_only | — |
| failure-truncated | not_run | fixture_only | — |
| failure-oversized | not_run | fixture_only | — |
| failure-empty | not_run | fixture_only | — |
| failure-extra_field | not_run | fixture_only | — |
| failure-amount_injection | not_run | fixture_only | — |
| failure-unknown_tool | not_run | fixture_only | — |
| failure-false_complete | not_run | fixture_only | — |
| failure-tool_budget | not_run | fixture_only | — |
| failure-timeout | not_run | fixture_only | — |
| failure-cancel_late | not_run | fixture_only | — |
| failure-pre_cancel | not_run | fixture_only | — |
| failure-explicit_retry | not_run | fixture_only | — |

No keys, headers, prompts, model responses, buyer text, source contents, database paths or raw errors are included.
