# Decisions made without asking

One line per decision made by a Claude Code run that could not stop to ask. This is the batch
Soroush reviews later, and it is the whole substitute for him being asked at the time — so a
decision made and not logged is a decision he never gets to reverse.

Appended to, never edited. `docs/AUTONOMOUS.md`, "`docs/decisions/AUTONOMOUS.md` is the one thing
that must never be skipped", is the rule; this file is the ledger. It is the one file in
`docs/decisions/` that is not an ADR and the one a run may write to.

| date | epic | the question | the choice | the reason |
|---|---|---|---|---|
| 2026-09-15 | process | Where does the browser-drive Definition-of-Done item happen now that nothing is pushed and therefore nothing deploys? | Against the locally **built** app — `pnpm build`, then `next start` — screenshotted, with the report saying what a local drive cannot cover. | Soroush's ruling of 2026-09-15 removed the push, and the deployed drive went with it. Dropping the drive entirely was the alternative and it is the one failure this project has already paid for: twenty epics passed every gate while the deployed `/app` rendered as unstyled text. A built app fails the way a build fails; `pnpm dev` does not. |
| 2026-09-15 | process | What happens to run-state's `push`, `ci`, `deploy` and `drive` steps? | Retired, but still recognised on read: a state file written before today resumes at `merge` or `report` instead of restarting the epic. `set` refuses to write one and names the replacement. | Deleting them outright would make a half-finished epic look like an unstarted one, and a runner that restarts an epic whose code is already on `main` reimplements it into a conflict — the exact failure `run-state.mjs` exists to prevent. |
| 2026-09-15 | process | Should `run-next-epic.sh` still refuse to start an epic when staging is not serving? | No — it reports and continues. | The check existed because the old last step drove the deployed URL. Staging now serves whatever commit Soroush last pushed, so a red check says that commit is unwell, which is news for him and not a reason to refuse to build work that will not reach the box until he pushes it. |
