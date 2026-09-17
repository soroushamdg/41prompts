import { DEFAULT_RUN_MODEL, type Db } from "@41prompts/db";
import { previewPublish } from "./publish";
import { gatePhrase } from "./words";

/**
 * Why this prompt cannot go Live, or `undefined` when it can (EPIC-055 C15).
 *
 * ## It asks the gate rather than guessing from the run
 *
 * The tempting cheap version is "did the last run have a failure" — one query, no compile. It is
 * wrong in both directions: a run can fail on a version nobody is publishing, and a publish can be
 * blocked by the **contract** row with every check green. Either mistake produces a banner that is
 * confidently about the wrong thing, which is worse than none.
 *
 * So it calls `previewPublish`, which is the same evaluation the endpoint enforces (ruling 5). That
 * is not free — it compiles the version and reads what is Live — and it is what the answer costs.
 *
 * ## A refusal is not a blocked publish
 *
 * `previewPublish` refuses for reasons that are not about the gate at all: no version yet, not
 * permitted, an unreadable snapshot. None of those is "your checks are failing", and none of them
 * should raise this banner — the Deploy page says those in its own words. Only `report.blocked`
 * does.
 */
export async function blockedWords(input: {
  db: Db;
  promptId: string;
  owner: string;
}): Promise<string | undefined> {
  const preview = await previewPublish({
    db: input.db,
    promptId: input.promptId,
    owner: input.owner,
    targetModel: DEFAULT_RUN_MODEL,
  });
  if (!preview.ok) return undefined;
  if (!preview.value.report.blocked) return undefined;

  // The rows that are actually stopping it, in the gate's own order and its own sentences.
  const stopping = preview.value.report.rows.filter((row) => row.blocking && row.verdict === "fail");
  if (stopping.length === 0) return undefined;
  return stopping.map((row) => gatePhrase(row.reason)).join(" ");
}
