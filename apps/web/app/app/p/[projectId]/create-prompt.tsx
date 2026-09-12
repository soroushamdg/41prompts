"use client";

import { Button, Input } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPromptAction } from "@/lib/canvas/actions";

export function CreatePrompt({ projectId }: { projectId: string }) {
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
          const result = await createPromptAction(projectId, name);
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          setName("");
          setMessage(undefined);
          // Straight to the thing that was just made. Also removes a race the e2e found: a
          // `router.refresh()` can render the list before the insert is visible to the next read.
          router.push(`/app/pr/${result.id}`);
        });
      }}
    >
      <label htmlFor="prompt-name">New prompt</label>
      <Input
        id="prompt-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Refund classifier"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create prompt"}
      </Button>
      {message !== undefined && (
        <p role="status" className="app-form-message">
          {message}
        </p>
      )}
    </form>
  );
}
