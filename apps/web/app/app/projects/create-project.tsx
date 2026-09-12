"use client";

import { Button, Input } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProjectAction } from "@/lib/canvas/actions";

export function CreateProject() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      className="app-create"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await createProjectAction(name);
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          setName("");
          setMessage(undefined);
          // Straight to the thing that was just made. Also removes a race the e2e found: a
          // `router.refresh()` can render the list before the insert is visible to the next read.
          router.push(`/app/p/${result.id}`);
        });
      }}
    >
      <label htmlFor="project-name">New project</label>
      <Input
        id="project-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Support email router"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create project"}
      </Button>
      {/* The failure is spoken, not coloured: rule 10, and green is spoken for regardless. */}
      {message !== undefined && (
        <p role="status" className="app-form-message">
          {message}
        </p>
      )}
    </form>
  );
}
