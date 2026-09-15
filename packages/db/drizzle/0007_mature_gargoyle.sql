CREATE TABLE "input_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"name" text NOT NULL,
	"columns" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "suite_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"suite_run" text NOT NULL,
	"check_id" text NOT NULL,
	"blok_id" text NOT NULL,
	"blok_kind" text NOT NULL,
	"blok_text" text NOT NULL,
	"kind" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suite_results" (
	"id" text PRIMARY KEY NOT NULL,
	"suite_run" text NOT NULL,
	"suite_check" text NOT NULL,
	"input_index" integer NOT NULL,
	"run" text,
	"outcome" text NOT NULL,
	"reason" text,
	"evidence" jsonb
);
--> statement-breakpoint
CREATE TABLE "suite_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"prompt" text NOT NULL,
	"input_set" text NOT NULL,
	"model" text NOT NULL,
	"params" jsonb NOT NULL,
	"prompt_hash" text NOT NULL,
	"prompt_text" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"refusal_reason" text,
	"total_inputs" integer NOT NULL,
	"completed_inputs" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"cached_calls" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "input_sets" ADD CONSTRAINT "input_sets_prompt_prompts_id_fk" FOREIGN KEY ("prompt") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_checks" ADD CONSTRAINT "suite_checks_suite_run_suite_runs_id_fk" FOREIGN KEY ("suite_run") REFERENCES "public"."suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_results" ADD CONSTRAINT "suite_results_suite_run_suite_runs_id_fk" FOREIGN KEY ("suite_run") REFERENCES "public"."suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_results" ADD CONSTRAINT "suite_results_suite_check_suite_checks_id_fk" FOREIGN KEY ("suite_check") REFERENCES "public"."suite_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_results" ADD CONSTRAINT "suite_results_run_runs_id_fk" FOREIGN KEY ("run") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_prompt_prompts_id_fk" FOREIGN KEY ("prompt") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_input_set_input_sets_id_fk" FOREIGN KEY ("input_set") REFERENCES "public"."input_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "input_sets_prompt_idx" ON "input_sets" USING btree ("prompt");--> statement-breakpoint
CREATE INDEX "suite_checks_run_idx" ON "suite_checks" USING btree ("suite_run","position");--> statement-breakpoint
CREATE INDEX "suite_results_run_idx" ON "suite_results" USING btree ("suite_run");--> statement-breakpoint
CREATE INDEX "suite_results_check_idx" ON "suite_results" USING btree ("suite_check");--> statement-breakpoint
CREATE INDEX "suite_runs_prompt_created_idx" ON "suite_runs" USING btree ("prompt","created_at");