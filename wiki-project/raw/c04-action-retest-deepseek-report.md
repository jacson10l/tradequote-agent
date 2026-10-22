# C04 deepseek evaluation

Status: passed. Provider validation: observed. Synthetic data only.
Model: deepseek-flash. Model calls: 168. Real request attempts: 168.
Token counts and costs: unknown (not exposed by adapter). Fixture success does not validate DeepSeek semantics.

| Case | Status | Code | Failed checks |
|---|---|---|---|
| apparel-zh-v1 | passed | observed | — |
| apparel-zh-v2 | passed | observed | — |
| apparel-zh-v3 | passed | observed | — |
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
| panel-de-v2 | passed | observed | — |
| panel-de-v3 | passed | observed | — |
| fastener-zh-v1 | passed | observed | — |
| fastener-zh-v2 | passed | observed | — |
| fastener-zh-v3 | passed | observed | — |
| fastener-en-v1 | passed | observed | — |
| fastener-en-v2 | passed | observed | — |
| fastener-en-v3 | passed | observed | — |
| fastener-de-v1 | passed | observed | — |
| fastener-de-v2 | passed | observed | — |
| fastener-de-v3 | passed | observed | — |
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
| clarification-zh | clarification | — | clarification_before_read | feedback | 1 | MISSING_FACTS |
| clarification-zh | clarification | — | missing_facts | stopped | 3 | MISSING_FACTS |
| clarification-en | clarification | — | clarification_before_read | feedback | 1 | MISSING_FACTS |
| clarification-en | clarification | — | clarification_before_read | stopped | 2 | MISSING_FACTS |
| clarification-de | clarification | — | clarification_before_read | feedback | 1 | MISSING_FACTS |
| clarification-de | clarification | — | clarification_before_read | stopped | 2 | MISSING_FACTS |
| rule-block | provider | — | content_json | stopped | 6 | MODEL_INVALID_OUTPUT |
| rule-block | tool_execution | validate_quote | rule_block | stopped | 6 | RULE_BLOCKED |

No keys, headers, prompts, model responses, buyer text, source contents, database paths or raw errors are included.
