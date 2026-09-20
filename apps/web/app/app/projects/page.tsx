import type { Metadata } from "next";
import { listProjects } from "@/lib/canvas/queries";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { CreateProject } from "./create-project";
import { ProjectCard } from "./project-card";
import { StartFromExample } from "./start-example";

// Behind auth and on the app host (decision 10). Nothing under /app is indexable; `robots.ts`
// already disallows it and the proxy keeps these paths off the apex.
export const metadata: Metadata = { title: "Projects · 41Prompts", robots: { index: false, follow: false } };

export default async function ProjectsPage() {
  const session = await requireSession("/app/projects");
  const projects = await listProjects(getDb(), session.user.id);

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <h1>Projects</h1>
      </header>

      <CreateProject />

      {projects.length === 0 ? (
        <>
          <p className="app-empty">No projects yet. The first one is where a prompt lives.</p>
          {/* Beside the empty state, never inside it (EPIC-034 decision 1). The empty state keeps
              saying the true, un-fabricated thing; the offer is a separate, opt-in act. */}
          <StartFromExample />
        </>
      ) : (
        /* The mockup's grid (lines 1088–1110): one column, two at 720px, three at 1120px. A list
           of links was what Stage 2 needed; a card carrying Pass, Runs and Cost is what makes the
           list worth scanning. */
        <ul className="projgrid">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ul>
      )}
    </main>
  );
}
