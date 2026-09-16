CREATE TABLE "prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"n" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"compiled_text" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"note" text,
	"pinned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suite_runs" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_prompts_id_fk" FOREIGN KEY ("prompt") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_prompt_n_idx" ON "prompt_versions" USING btree ("prompt","n");--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_version_prompt_versions_id_fk" FOREIGN KEY ("version") REFERENCES "public"."prompt_versions"("id") ON DELETE set null ON UPDATE no action;