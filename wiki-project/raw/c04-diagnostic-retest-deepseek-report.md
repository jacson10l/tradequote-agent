# C04 deepseek evaluation

Status: failed. Provider validation: observed. Synthetic data only.
Model: deepseek-flash. Model calls: 145. Real request attempts: 145.
Token counts and costs: unknown (not exposed by adapter). Fixture success does not validate DeepSeek semantics.

| Case | Status | Code | Failed checks |
|---|---|---|---|
| apparel-zh-v1 | failed | observed | terms |
| apparel-zh-v2 | not_run | prior_step_failed | — |
| apparel-zh-v3 | not_run | prior_step_failed | — |
| apparel-en-v1 | passed | observed | — |
| apparel-en-v2 | passed | observed | — |
| apparel-en-v3 | passed | observed | — |
| apparel-de-v1 | passed | observed | — |
| apparel-de-v2 | passed | observed | — |
| apparel-de-v3 | passed | observed | — |
| panel-zh-v1 | passed | observed | — |
| panel-zh-v2 | passed | observed | — |
| panel-zh-v3 | passed | observed | — |
| panel-en-v1 | passed | observed | — |
| panel-en-v2 | passed | observed | — |
| panel-en-v3 | passed | observed | — |
| panel-de-v1 | passed | observed | — |
| panel-de-v2 | failed | MODEL_INVALID_OUTPUT | outcome, revision_count, draft_only, product, quantity, unit, terms, amount, sources, validation |
| panel-de-v3 | not_run | prior_step_failed | — |
| fastener-zh-v1 | passed | observed | — |
| fastener-zh-v2 | passed | observed | — |
| fastener-zh-v3 | passed | observed | — |
| fastener-en-v1 | passed | observed | — |
| fastener-en-v2 | passed | observed | — |
| fastener-en-v3 | passed | observed | — |
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

| Case | Failure stage | Tool | Validation category | Disposition | Model call | Code |
|---|---|---|---|---|---:|---|
| apparel-en-v1 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| apparel-en-v2 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| apparel-en-v3 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| apparel-de-v1 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| panel-en-v2 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| panel-de-v2 | provider | — | provider_failure | stopped | 2 | MODEL_INVALID_OUTPUT |
| fastener-zh-v1 | completion | — | premature_complete | feedback | 3 | ACTION_NOT_ALLOWED |
| fastener-zh-v2 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| fastener-zh-v3 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| fastener-en-v1 | completion | — | premature_complete | feedback | 3 | ACTION_NOT_ALLOWED |
| fastener-en-v3 | tool_execution | search_knowledge | calculate_first | feedback | 3 | ACTION_NOT_ALLOWED |
| fastener-de-v1 | clarification | — | missing_facts | feedback | 3 | MISSING_FACTS |
| fastener-de-v1 | tool_execution | search_knowledge | calculate_first | stopped | 4 | ACTION_NOT_ALLOWED |
| clarification-zh | clarification | — | missing_facts | stopped | 1 | MISSING_FACTS |
| clarification-en | clarification | — | missing_facts | stopped | 1 | MISSING_FACTS |
| clarification-de | clarification | — | missing_facts | stopped | 1 | MISSING_FACTS |
| rule-block | completion | — | rule_block | stopped | 6 | RULE_BLOCKED |

No keys, headers, prompts, model responses, buyer text, source contents, database paths or raw errors are included.
