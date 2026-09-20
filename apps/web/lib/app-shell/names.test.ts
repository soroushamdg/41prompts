import type { Db } from "@41prompts/db";
import { describe, expect, it } from "vitest";
import { shellProjectName } from "./names";

/**
 * ## What this file can prove, and what it cannot
 *
 * `layout.tsx` claims the shell's reads are **free wherever the page below reads the same row**,
 * because React's `cache()` memoises on argument identity for one render pass.
 *
 * **A unit test cannot prove that, and the first version of this file wrongly claimed to.** It
 * asserted three identical calls reached the database once, and measured **three**. That is not a
 * defect in `names.ts`: `cache()` is scoped to a Server Component render, and outside one React
 * has no dispatcher to hold the map, so the wrapper is a passthrough. The memo exists only where
 * the layout actually runs.
 *
 * So this file proves the half that is checkable here — **that the key is right** — and the drive
 * measures the half that is not, by counting statements the built app sends to Postgres while
 * rendering one page. `docs/epics/reports/EPIC-023-report.md` carries that number.
 *
 * Keeping the passthrough written down matters for a second reason: it means these functions are
 * safe to call outside a render. They cannot serve a stale row to a script or a job, because
 * outside a render there is no cache at all.
 */

interface Counting {
  readonly db: Db;
  calls(): number;
}

/**
 * The smallest thing `shellProjectName`'s query will run against: `select().from().where().limit()`
 * resolving to no rows, counting how many times the chain is started.
 */
function countingDb(): Counting {
  let calls = 0;
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => []
  };
  const db = {
    select: () => {
      calls += 1;
      return chain;
    }
  } as unknown as Db;
  return { db, calls: () => calls };
}

describe("outside a React render there is no cache, and that is React's contract", () => {
  it("passes every call through", async () => {
    const counting = countingDb();
    await shellProjectName(counting.db, "proj_027b", "user_1");
    await shellProjectName(counting.db, "proj_027b", "user_1");
    await shellProjectName(counting.db, "proj_027b", "user_1");
    // Three, not one. If this ever reads 1, `cache()` has gained a process-wide memo — and a
    // process-wide memo of a row read on behalf of one account is a cross-account leak waiting for
    // its second request. It would need to be found immediately, which is why this asserts the
    // exact number rather than `toBeGreaterThan(0)`.
    expect(counting.calls()).toBe(3);
  });
});

describe("the read is scoped by owner", () => {
  /**
   * The shell renders a record's **name** in a rail heading and a breadcrumb. That is a disclosure,
   * so the query must constrain `projects.owner` and not only the id — the shell must not become
   * the one place in the app that renders a name without asking whose it is.
   *
   * Asserted by walking the condition Drizzle builds, because it is a cyclic object graph
   * (`PgText.table` → `PgTable.id` → back) and `JSON.stringify` throws on it. Depth- and
   * cycle-bounded, so a future Drizzle shape makes this fail rather than hang.
   */
  function namesColumn(value: unknown, column: string): boolean {
    const seen = new WeakSet<object>();
    const walk = (node: unknown, depth: number): boolean => {
      if (depth > 8 || node === null || typeof node !== "object") return false;
      if (seen.has(node)) return false;
      seen.add(node);
      const record = node as Record<string, unknown>;
      if (record.name === column) return true;
      return Object.values(record).some((child) => walk(child, depth + 1));
    };
    return walk(value, 0);
  }

  async function conditionFor(run: (db: Db) => Promise<unknown>): Promise<unknown[]> {
    const seen: unknown[] = [];
    const chain = {
      from: () => chain,
      where: (condition: unknown) => {
        seen.push(condition);
        return chain;
      },
      limit: async () => []
    };
    await run({ select: () => chain } as unknown as Db);
    return seen;
  }

  it("constrains the owner, not only the id", async () => {
    const [condition] = await conditionFor((db) => shellProjectName(db, "proj_027b", "user_1"));
    expect(namesColumn(condition, "owner")).toBe(true);
    expect(namesColumn(condition, "id")).toBe(true);
  });

  /** The control: the walker finds a column that is there and not one that is not. */
  it("would notice a column that is absent", async () => {
    const [condition] = await conditionFor((db) => shellProjectName(db, "proj_027b", "user_1"));
    expect(namesColumn(condition, "no_such_column")).toBe(false);
  });

  /** A soft-deleted project is gone whoever is asking, as everywhere else in this codebase. */
  it("excludes a soft-deleted project", async () => {
    const [condition] = await conditionFor((db) => shellProjectName(db, "proj_027b", "user_1"));
    expect(namesColumn(condition, "deleted_at")).toBe(true);
  });
});
