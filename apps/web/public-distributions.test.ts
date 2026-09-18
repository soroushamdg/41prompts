import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Everything that is true of *every* published distribution, derived from the workspace rather
 * than from a list somebody keeps in step by hand.
 *
 * ## Why it is derived
 *
 * There were four public packages when EPIC-007 wrote the split's machinery. There are six
 * distributions now — `packages/cli-unscoped` (`41p`) arrived in EPIC-053 and `sdks/python-alias`
 * (`41prompts`) in EPIC-054 — and on 2026-09-18 EPIC-056 found three places still working from the
 * old number, none of which had failed anything:
 *
 * 1. **`scripts/mirror-dry-run.sh` did not carry `packages/cli-unscoped`.** `41p` publishes with
 *    `provenance: true` and a `prepublishOnly` that only passes inside `41prompts/41prompts` — so
 *    its source was absent from the one repository it can be published from. The filtered tree
 *    installed and tested perfectly, because a tree missing a package is a smaller working tree.
 * 2. **`scripts/license-gate.mjs` filtered on `@41prompts/sdk-ts`**, which is the directory name
 *    and not the package name. It matched no project, pnpm quietly narrowed the check to the
 *    filters that did match, and the SDK — whose code is inlined into somebody else's
 *    application — had never had its dependency closure licence-checked.
 * 3. **`CONTRIBUTING.md` said "Four packages are public"**, and had done since before two of them
 *    existed.
 *
 * Each of those is the same failure: a list of the public packages, written once, read for ever.
 * This test replaces the list with the question — *what does the workspace actually publish?* — so
 * that adding a seventh distribution fails here until every place that needs to know has been told.
 */

const REPO = join(import.meta.dirname, "..", "..");
const PUBLIC_REPO = "41prompts/41prompts";
const OLD_REPO = "soroushamdg/41prompts";

const read = (rel: string) => readFileSync(join(REPO, rel), "utf-8");
const json = (rel: string) => JSON.parse(read(rel)) as Record<string, unknown>;

/** An npm distribution is one whose own manifest says it publishes publicly. */
function npmDistributions() {
  return readdirSync(join(REPO, "packages"))
    .map((dir) => ({ dir: `packages/${dir}`, manifest: `packages/${dir}/package.json` }))
    .filter((d) => {
      const m = json(d.manifest) as { publishConfig?: { access?: string } };
      return m.publishConfig?.access === "public";
    })
    .map((d) => ({ ...d, name: String((json(d.manifest) as { name: string }).name) }));
}

/** A PyPI distribution is a directory under `sdks/` with a `pyproject.toml`. */
function pypiDistributions() {
  return readdirSync(join(REPO, "sdks"))
    .map((dir) => ({ dir: `sdks/${dir}`, manifest: `sdks/${dir}/pyproject.toml` }))
    .filter((d) => {
      try {
        return read(d.manifest).length > 0;
      } catch {
        return false;
      }
    })
    .map((d) => ({
      ...d,
      name: /^name\s*=\s*"([^"]+)"/m.exec(read(d.manifest))?.[1] ?? "",
    }));
}

const npm = npmDistributions();
const pypi = pypiDistributions();
const all = [...npm, ...pypi];

describe("what the workspace publishes", () => {
  it("is the six distributions this epic knows about — a seventh must be handled, not absorbed", () => {
    expect(npm.map((d) => d.name).sort()).toEqual([
      "41p",
      "@41prompts/cli",
      "@41prompts/core",
      "@41prompts/sdk",
    ]);
    expect(pypi.map((d) => d.name).sort()).toEqual(["41prompts", "fortyone-prompts"]);
  });
});

describe("every distribution's URLs", () => {
  it.each(npm.map((d) => [d.name, d.manifest] as const))("%s points at the public repository", (_n, manifest) => {
    const m = json(manifest) as {
      repository?: { url?: string };
      homepage?: string;
      bugs?: { url?: string };
    };
    const urls = [m.repository?.url, m.homepage, m.bugs?.url];
    expect(urls.every((u) => typeof u === "string" && u.length > 0)).toBe(true);
    for (const url of urls) {
      expect(url, manifest).toContain(PUBLIC_REPO);
      expect(url, manifest).not.toContain(OLD_REPO);
    }
  });

  it.each(pypi.map((d) => [d.name, d.manifest] as const))("%s points at the public repository", (_n, manifest) => {
    const text = read(manifest);
    expect(text, manifest).toContain(`https://github.com/${PUBLIC_REPO}`);
    expect(text, manifest).not.toContain(OLD_REPO);
  });

  it("names the public repository in REUSE.toml's download location", () => {
    expect(read("REUSE.toml")).toContain(`SPDX-PackageDownloadLocation = "https://github.com/${PUBLIC_REPO}"`);
  });

  /**
   * The private repository is not renamed by any of this. `infra/` and the workflows that build
   * and deploy the box keep pointing at `soroushamdg/41prompts`, because the mirror is a second
   * repository. A change that "tidied" those would break every deploy.
   */
  it("leaves the private repository's own name alone in infra", () => {
    expect(read("infra/docker-compose.production.yml")).toContain(OLD_REPO);
  });
});

describe("the mirror carries every distribution", () => {
  const script = read("scripts/mirror-dry-run.sh");

  it.each(all.map((d) => [d.dir] as const))("%s is in the filter's --path list", (dir) => {
    expect(script).toContain(`--path ${dir} `);
  });

  it.each(all.map((d) => [d.dir] as const))("%s is asserted present in the filtered tree", (dir) => {
    // The other half. A filter that silently drops a package yields a smaller tree that installs
    // and tests perfectly, so "absent paths" checks alone cannot see it.
    //
    // Sliced to the `for required in ...; do` header exactly, not to the rest of the file. The
    // first version of this took everything from "for required in" to the end, and passed for a
    // package that had been removed from the list — because a later `echo` line happens to name
    // the same directory. Found by running the control (removing `--path packages/cli-unscoped`)
    // and getting one failure where two were owed.
    const from = script.indexOf("for required in");
    const to = script.indexOf("; do", from);
    expect(from, "the required-paths check is gone entirely").toBeGreaterThan(-1);
    const required = script.slice(from, to);
    expect(required, `${dir} missing from the required-paths check`).toContain(dir);
  });
});

describe("the licence gate is pointed at what is published", () => {
  it("checks exactly the npm distributions, by package name and not by directory", () => {
    const gate = read("scripts/license-gate.mjs");
    const declared = /const PUBLIC_PACKAGES = \[([^\]]*)\]/.exec(gate)?.[1] ?? "";
    const names = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    expect(names).toEqual(npm.map((d) => d.name).sort());
  });
});

describe("CONTRIBUTING.md", () => {
  it.each(all.map((d) => [d.name] as const))("names %s", (name) => {
    expect(read("CONTRIBUTING.md")).toContain(name);
  });

  it("no longer claims there are four", () => {
    expect(read("CONTRIBUTING.md")).not.toContain("Four packages are public");
  });
});

describe("every distribution's README", () => {
  it.each(all.map((d) => [d.name, `${d.dir}/README.md`] as const))("%s has a three-step quickstart", (_n, rel) => {
    expect(read(rel)).toContain("## Three steps");
  });
});

describe("the publish workflows cannot run in the private repository", () => {
  const dir = "mirror/.github/workflows";
  const workflows = readdirSync(join(REPO, dir)).filter((f) => f.endsWith(".yml"));

  it("has the three the public repository needs", () => {
    expect(workflows.sort()).toEqual([
      "dependency-review.yml",
      "publish-npm.yml",
      "publish-pypi.yml",
    ]);
  });

  /**
   * These files are authored in the private monorepo and copied into the public mirror by the
   * filter, so they exist in both. A workflow that fires here spends Actions minutes on a publish
   * `prepublishOnly` is going to refuse — and `docs/backlog.md`'s EPIC-009 section records 2,175
   * billed minutes in this repository's first 8.4 days against a 2,000-minute month, which stopped
   * every deploy mid-epic. Failing cheaply is not the same as not running.
   *
   * Asserted per job rather than per file: a second job added without the guard is the way this
   * comes undone.
   */
  it.each(workflows.map((f) => [f] as const))("%s guards every job on the repository", (file) => {
    const text = read(`${dir}/${file}`);
    const jobsAt = text.indexOf("\njobs:");
    expect(jobsAt, `${file}: no jobs: key`).toBeGreaterThan(-1);

    const body = text.slice(jobsAt + 1).split("\n");
    const jobStarts: number[] = [];
    body.forEach((line, i) => {
      if (/^ {2}[A-Za-z_][\w-]*:\s*$/.test(line)) jobStarts.push(i);
    });
    expect(jobStarts.length, `${file}: no jobs found`).toBeGreaterThan(0);

    jobStarts.forEach((start, i) => {
      const end = jobStarts[i + 1] ?? body.length;
      const block = body.slice(start, end).join("\n");
      expect(block, `${file}: ${body[start].trim()} has no repository guard`).toContain(
        `if: github.repository == '${PUBLIC_REPO}'`
      );
    });
  });

  it("uses trusted publishing, and consumes no secret at all", () => {
    // The property is that nothing here READS a secret, not that the files never name one — the
    // first version of this assertion matched the literal string and failed on publish-npm.yml's
    // own comment explaining why there is no token. A comment saying "there must be no NPM_TOKEN"
    // is the opposite of the defect.
    for (const file of workflows) {
      const text = read(`${dir}/${file}`);
      expect(text, file).not.toMatch(/\$\{\{\s*secrets\./);
    }
    expect(read(`${dir}/publish-npm.yml`)).toContain("id-token: write");
    expect(read(`${dir}/publish-pypi.yml`)).toContain("id-token: write");
  });

  /**
   * npm has `prepublishOnly`; Python has no equivalent lifecycle hook, which EPIC-057 recorded as
   * an open gap. The explicit step in `publish-pypi.yml` is the whole of the mechanical guard on
   * that side, so it is asserted separately from the job-level `if:` — a skipped job is silent and
   * a failed step is not.
   */
  it("gives the Python publish a guard of its own, since prepublishOnly is an npm-only hook", () => {
    expect(read(`${dir}/publish-pypi.yml`)).toContain('test "$GITHUB_REPOSITORY" = 41prompts/41prompts');
  });
});
