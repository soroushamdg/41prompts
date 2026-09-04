# @41prompts/sdk

Runtime `resolve()` for 41Prompts. Never blocks a call on the network, never throws. Resolve order:
memory → disk → bundled → network. Zero dependencies. Apache-2.0.

This package is a stub as of EPIC-000; `resolve()` returns `{ text: "", status: "unavailable" }` and calls
`onWarning` until the real delivery path lands in EPIC-052.
