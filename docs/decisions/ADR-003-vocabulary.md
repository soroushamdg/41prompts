# ADR-003: Vocabulary

Status: accepted · 2026-09-04 · from the UX research review

## Decision

- A prompt is made of **bloks**. Each blok owns one or more **spans** of the compiled prompt.
  The word **"block"** is removed from code, schema, UI and documentation. "Blok" and "block", one letter apart and
  used in the same sentence, was a naming defect. Types: `Blok`, `CompiledSpan`, `Range`.
- Expected-behaviour bloks become **checks** in every user-facing string. The internal type may be `Check`;
  the word "assertion" does not appear in the UI.
- Version state has one vocabulary across the editor, Versions and Deploy: **Draft vN** (unpublished) and
  **Live vN** (published). Never "current", "unsaved", "latest" as state names.
- Actions: **Publish**, **Publish anyway** (requires a reason), **Undo**.
- Manual edits: badge **"edited by hand"**; banner action **"Update from blok"**. Not "drifted", not "reconcile", not "override".
- Check kinds display as plain phrases: "valid JSON shape", "one of the allowed values", "word limit", "character limit",
  "must contain", "must not contain", "matches a pattern", "refuses to answer". Internal identifiers never render.
- Never in UI strings: label, pointer, artifact, promote, enum, sha, hash, schema (say "shape"), regex (say "pattern").
- "Named bloks", not "labelled bloks".

## Why

The stated audience includes junior engineers on the ICP's team. Every term above was either jargon from another
field (finance, git, ML ops) or an internal identifier leaking through, and each one is a small tax on the first
five minutes, which is where activation is won or lost.

## Consequences

- CLAUDE.md carries the allowed and forbidden lists; the Definition of Done includes a forbidden-word grep over UI strings.
- The prototypes in `docs/design/` still contain the old words; `docs/design/README.md` lists the replacements. When a prototype and this ADR disagree, this ADR wins.
- EPIC-080 tests whether "blok" itself is learnable; if it fails, the replacement term is decided before EPIC-011a.
