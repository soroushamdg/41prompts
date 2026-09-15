"use client";

import { Button } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startFromExampleAction } from "@/lib/activation/actions";

/**
 * The example offer, which sits **beside** the empty state and never inside it.
 *
 * Soroush's ruling of 2026-09-14: seeded starter bloks are not owed, because an empty state does the
 * job without fabricating someone's content — on a product whose claim is that a blok holds your
 * verbatim text. That stands. What this is, and what makes it a different act, is that a person
 * reads what it will create and presses a button: nobody's words are put in their mouth.
 *
 * So the copy says what it makes **before** it makes it, the same discipline as EPIC-032's
 * constraint preview, and everything it creates is named `Example`.
 */
export function StartFromExample() {
  const [message, setMessage] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <section className="app-example" aria-label="Start from an example">
      <h2>Not sure where to start?</h2>
      <p>
        We can make you an example: a support-reply prompt with one rule about what it must never
        say, and two inputs to run it against. One of them breaks the rule, so you will see what a
        failing check looks like on something small.
      </p>
      {message !== undefined && (
        <p className="app-form-message" role="alert">
          {message}
        </p>
      )}
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await startFromExampleAction();
            if (!result.ok || result.promptId === undefined) {
              setMessage(result.message ?? "That did not work.");
              return;
            }
            // Straight to the page where the next thing to do is press Run.
            router.push(`/app/pr/${result.promptId}/runs`);
          })
        }
      >
        {pending ? "Making it…" : "Start from an example"}
      </Button>
    </section>
  );
}
