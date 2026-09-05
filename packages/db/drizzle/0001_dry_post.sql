CREATE TABLE "plan_budget_defaults" (
	"plan" text PRIMARY KEY NOT NULL,
	"monthly_cap_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"cap_cents" integer NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "run_budgets_owner_unique" UNIQUE("owner")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "run_budgets" ADD CONSTRAINT "run_budgets_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Placeholder monthly caps (EPIC-004 decision 6: "a number in the database, not a constant in
-- code" — the point is that the enforced cap lives in a row, not what the exact number is yet).
-- EPIC-070 (Stripe/billing) owns the real pricing and replaces these.
INSERT INTO "plan_budget_defaults" ("plan", "monthly_cap_cents") VALUES
	('free', 500),
	('pro', 5000),
	('team', 20000)
ON CONFLICT ("plan") DO NOTHING;