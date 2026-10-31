# C04 fixture evaluation

Status: passed. Provider validation: fixture_only. Synthetic data only.
Model: synthetic-c04-model. Model calls: 186. Real request attempts: 0.
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
| failure-auth | passed | MODEL_AUTH_FAILED | — |
| failure-rate_limit | passed | MODEL_RATE_LIMITED | — |
| failure-server | passed | CAPABILITY_UNAVAILABLE | — |
| failure-network | passed | CAPABILITY_UNAVAILABLE | — |
| failure-invalid_json | passed | MODEL_INVALID_OUTPUT | — |
| failure-truncated | passed | MODEL_INVALID_OUTPUT | — |
| failure-oversized | passed | MODEL_INVALID_OUTPUT | — |
| failure-empty | passed | MODEL_INVALID_OUTPUT | — |
| failure-extra_field | passed | MODEL_INVALID_OUTPUT | — |
| failure-amount_injection | passed | MODEL_INVALID_OUTPUT | — |
| failure-unknown_tool | passed | ACTION_NOT_ALLOWED | — |
| failure-false_complete | passed | ACTION_NOT_ALLOWED | — |
| failure-tool_budget | passed | ACTION_NOT_ALLOWED | — |
| failure-timeout | passed | MODEL_TIMEOUT | — |
| failure-cancel_late | passed | CANCELLED | — |
| failure-pre_cancel | passed | CANCELLED | — |
| failure-explicit_retry | passed | MODEL_RATE_LIMITED | — |

| Case | Failure stage | Tool | Validation category | Disposition | Model call | Code |
|---|---|---|---|---|---:|---|
| clarification-zh | clarification | — | missing_facts | stopped | 1 | MISSING_FACTS |
| clarification-en | clarification | — | missing_facts | stopped | 1 | MISSING_FACTS |
| clarification-de | clarification | — | missing_facts | stopped | 1 | MISSING_FACTS |
| rule-block | tool_execution | create_draft | rule_block | stopped | 6 | RULE_BLOCKED |
| failure-auth | provider | — | provider_failure | stopped | 1 | MODEL_AUTH_FAILED |
| failure-rate_limit | provider | — | provider_failure | stopped | 1 | MODEL_RATE_LIMITED |
| failure-server | provider | — | provider_failure | stopped | 1 | CAPABILITY_UNAVAILABLE |
| failure-network | provider | — | provider_failure | stopped | 1 | CAPABILITY_UNAVAILABLE |
| failure-invalid_json | provider | — | response_json | stopped | 1 | MODEL_INVALID_OUTPUT |
| failure-truncated | provider | — | response_truncated | stopped | 1 | MODEL_INVALID_OUTPUT |
| failure-oversized | provider | — | response_oversized | stopped | 1 | MODEL_INVALID_OUTPUT |
| failure-empty | provider | — | empty_content | stopped | 1 | MODEL_INVALID_OUTPUT |
| failure-extra_field | action_schema | — | invalid_action | stopped | 1 | MODEL_INVALID_OUTPUT |
| failure-amount_injection | tool_input | calculate_quote | unknown_field | stopped | 1 | MODEL_INVALID_OUTPUT |
| failure-unknown_tool | tool_lookup | — | unknown_tool | stopped | 1 | ACTION_NOT_ALLOWED |
| failure-false_complete | completion | — | premature_complete | stopped | 1 | ACTION_NOT_ALLOWED |
| failure-tool_budget | budget | — | request_limit | stopped | 12 | ACTION_NOT_ALLOWED |
| failure-timeout | provider | — | timeout | stopped | 1 | MODEL_TIMEOUT |
| failure-cancel_late | provider | — | cancelled | stopped | 1 | CANCELLED |
| failure-explicit_retry | provider | — | provider_failure | stopped | 1 | MODEL_RATE_LIMITED |

No keys, headers, prompts, model responses, buyer text, source contents, database paths or raw errors are included.
