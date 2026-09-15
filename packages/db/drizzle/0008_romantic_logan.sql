ALTER TABLE "suite_runs" ADD COLUMN "judge_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suite_runs" ADD COLUMN "judge_cached_calls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suite_runs" ADD COLUMN "judge_cost_cents" integer DEFAULT 0 NOT NULL;