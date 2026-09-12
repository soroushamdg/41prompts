import { addBlok } from "./canvas";
import { createDb } from "./client";
import { newProjectId } from "./ids";
import { projects, prompts, users } from "./schema";

// Local dev only. Guarded against ever touching staging/production, where DEPLOY_ENV is set
// to "staging"/"production" (see .env.example) and is never left unset or "development".
async function main(): Promise<void> {
  const deployEnv = process.env.DEPLOY_ENV ?? "development";
  if (deployEnv !== "development") {
    throw new Error(`db:seed refused: DEPLOY_ENV is "${deployEnv}", not "development"`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("db:seed requires DATABASE_URL");
  }

  const db = createDb(databaseUrl);

  const [user] = await db
    .insert(users)
    .values({
      id: "seed-user",
      name: "Seed User",
      email: "seed@41prompts.local",
      emailVerified: true,
    })
    .onConflictDoNothing({ target: users.id })
    .returning();

  const ownerId = user?.id ?? "seed-user";

  const projectId = newProjectId();
  const [project] = await db
    .insert(projects)
    .values({
      id: projectId,
      owner: ownerId,
      name: "Seed Project",
      slug: "seed-project",
    })
    .onConflictDoNothing({ target: projects.slug })
    .returning({ id: projects.id });

  // A prompt with starter bloks, so `/app/pr/<id>` has something on it the first time it is opened
  // (EPIC-021a). Only on a fresh seed — re-running must not pile up duplicate prompts.
  if (project !== undefined) {
    const [prompt] = await db
      .insert(prompts)
      .values({ project: project.id, name: "Support email router" })
      .returning({ id: prompts.id });

    // Four kinds, so the canvas shows what the six look like without anybody typing. Text is
    // written verbatim, like every other blok — the seed is not exempt from rule 3.
    const starters: [string, string][] = [
      ["context", "You route inbound support email for a subscription software company."],
      ["constraint", "Reply in at most 80 words."],
      ["example", 'Input: "charged twice for March"\nOutput: {"category":"duplicate"}'],
      ["expected", "Respond with valid JSON containing category and needs_human."],
    ];
    for (const [kind, text] of starters) {
      await addBlok(db, prompt!.id, { kind, text });
    }
    console.log(`seeded prompt ${prompt!.id} with ${starters.length} bloks`);
  }

  console.log("seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
