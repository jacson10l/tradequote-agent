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

No keys, headers, prompts, model responses, buyer text, source contents, database paths or raw errors are included.
