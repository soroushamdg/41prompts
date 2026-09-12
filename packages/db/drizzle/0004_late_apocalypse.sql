CREATE TABLE "bloks" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"rank" text NOT NULL,
	"edited_text" text,
	"edited_from_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"project" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "bloks" ADD CONSTRAINT "bloks_prompt_prompts_id_fk" FOREIGN KEY ("prompt") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_project_projects_id_fk" FOREIGN KEY ("project") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bloks_prompt_rank_idx" ON "bloks" USING btree ("prompt","rank");--> statement-breakpoint
CREATE INDEX "prompts_project_idx" ON "prompts" USING btree ("project");