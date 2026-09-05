import { createDb } from "./client";
import { newProjectId } from "./ids";
import { projects, users } from "./schema";

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

  await db
    .insert(projects)
    .values({
      id: newProjectId(),
      owner: ownerId,
      name: "Seed Project",
      slug: "seed-project",
    })
    .onConflictDoNothing({ target: projects.slug });

  console.log("seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
