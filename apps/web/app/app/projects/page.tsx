import type { Metadata } from "next";
import { listProjects } from "@/lib/canvas/queries";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { CreateProject } from "./create-project";
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
        <ul className="app-list">
          {projects.map((project) => (
            <li key={project.id}>
              <a href={`/app/p/${project.id}`}>{project.name}</a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
