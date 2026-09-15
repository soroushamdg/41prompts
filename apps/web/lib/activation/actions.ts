"use server";

import { addBlok, addInputSet, declareVariable, newProjectId, projects, prompts } from "@41prompts/db";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify } from "@/lib/canvas/slug";
import {
  EXAMPLE_BLOKS,
  EXAMPLE_COLUMNS,
  EXAMPLE_INPUT_SET_NAME,
  EXAMPLE_PROJECT_NAME,
  EXAMPLE_PROMPT_NAME,
  EXAMPLE_ROWS,
  EXAMPLE_VARIABLE,
} from "./example";

/**
 * Create the example, whole, or not at all.
 *
 * ## One transaction, and why that is not fussiness
 *
 * Five writes make the example: a project, a prompt, its bloks, the variable the rows bind to, and
 * the input set. **A person cannot tell which of them failed.** An example with bloks and no input
 * set offers a Run button that refuses; one with an input set and no variable declaration refuses at
 * a different place with a different message. Both are worse than no example at all, because the
 * person's reasonable conclusion is that the product is broken rather than that a write failed.
 *
 * ## It is only ever offered to somebody who asked for it
 *
 * Decision 1, and Soroush's ruling of 2026-09-14 underneath it: nothing fabricates content into a
 * prompt somebody made. This runs when a button that said what it would do was pressed, and what it
 * creates is named `Example` so it cannot later be mistaken for the person's own writing.
 */
export async function startFromExampleAction(): Promise<{ ok: boolean; promptId?: string; message?: string }> {
  const session = await requireSession("/app/projects");
  const db = getDb();

  const promptId = await db.transaction(async (tx) => {
    const projectId = newProjectId();
    await tx.insert(projects).values({
      id: projectId,
      owner: session.user.id,
      name: EXAMPLE_PROJECT_NAME,
      slug: `${slugify(EXAMPLE_PROJECT_NAME)}-${projectId}`,
    });

    const [prompt] = await tx
      .insert(prompts)
      .values({ project: projectId, name: EXAMPLE_PROMPT_NAME })
      .returning({ id: prompts.id });
    const id = prompt!.id;

    for (const blok of EXAMPLE_BLOKS) {
      await addBlok(tx, id, { kind: blok.kind, text: blok.text });
    }

    await declareVariable(tx, id, { name: EXAMPLE_VARIABLE, defaultValue: null, description: null });

    // **Created directly, not uploaded** (note 1). EPIC-032 decision 1's refusals exist so a file a
    // person chose cannot fail at run time; this data is ours and binds by construction. Making a
    // new user produce a CSV before they can see a single result is the opposite of this epic.
    await addInputSet(tx, id, {
      name: EXAMPLE_INPUT_SET_NAME,
      columns: EXAMPLE_COLUMNS,
      rows: EXAMPLE_ROWS,
    });

    return id;
  });

  revalidatePath("/app/projects");
  return { ok: true, promptId };
}
