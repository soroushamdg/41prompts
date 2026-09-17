"use client";

import { Switch } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAdminOnlyPublishAction } from "@/lib/deploy/settings-actions";

/**
 * The publishing switch, per project, and the sentence about rule 9.
 *
 * ## Why the paragraph is here and not only in a comment
 *
 * The mockup has two switches and this has one. Somebody who has seen the mockup — or who simply
 * expects a product to let them turn a gate off — will come to this page looking for the second.
 * An unexplained absence reads as an oversight, and the sentence is worth having on its own terms:
 * "it cannot go live if it breaks your tests" is the product's central claim, and this is where a
 * person would go to make it untrue. EPIC-051 ruling 4 and EPIC-055 ruling 7.
 */
export function PublishingSettings({ projects }: { projects: ProjectSetting[] }) {
  return (
    <>
      <section className="runs-panel" aria-label="Who may move a prompt to Live">
        <h2>Who may move a prompt to Live</h2>
        <p className="runs-note">
          Publishing changes what every application using a prompt receives, within about thirty
          seconds and without a deploy. This is the one setting that decides who can do it.
        </p>
      </section>

      {projects.length === 0 ? (
        <section className="runs-panel" aria-label="No projects">
          <p className="runs-note">
            No projects yet. <a href="/app/projects">Make one</a> and its publishing setting will be
            here.
          </p>
        </section>
      ) : (
        <ul className="settings-rows">
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}

      <section className="runs-panel" aria-label="Failing checks">
        <h2>There is no switch for failing checks</h2>
        <p className="runs-note">
          A prompt whose checks are failing cannot be published, and that is not something this page
          can turn off. The way past it is <b>Publish anyway</b> on the prompt&rsquo;s Deploy page,
          which asks you to say why, records who you are, and keeps both in the history for ever.
        </p>
        <p className="runs-note">
          That is deliberate. A setting here would make it quietly untrue for every prompt in the
          project, for ever, and nobody would be named. One publish at a time, with a reason, is the
          whole of the exception.
        </p>
      </section>
    </>
  );
}

function ProjectRow({ project }: { project: ProjectSetting }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | undefined>();

  return (
    <li className="settings-row">
      <span className="settings-row-what">
        <b>{project.name}</b>
        <span>Only an admin can move a prompt in this project to Live</span>
        {said !== undefined && (
          <span className="settings-row-said" role="status">
            {said}
          </span>
        )}
      </span>
      <Switch
        checked={project.adminOnlyPublish}
        disabled={pending}
        aria-label={`Only an admin can publish in ${project.name}`}
        onCheckedChange={(next) =>
          start(async () => {
            const outcome = await setAdminOnlyPublishAction(project.id, next);
            setSaid(outcome.message);
            router.refresh();
          })
        }
      />
    </li>
  );
}

export interface ProjectSetting {
  id: string;
  name: string;
  adminOnlyPublish: boolean;
}
