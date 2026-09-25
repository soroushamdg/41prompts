CREATE TABLE "billing_customers" (
	"owner" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"key" text PRIMARY KEY NOT NULL,
	"stripe_price_id" text,
	"monthly_run_limit" integer NOT NULL,
	"monthly_cap_cents" integer NOT NULL,
	CONSTRAINT "plans_stripe_price_id_unique" UNIQUE("stripe_price_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"handled" boolean NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_key_plans_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_owner_idx" ON "subscriptions" USING btree ("owner");--> statement-breakpoint
-- EPIC-070 / ADR-007 §1 and §2. The three plans, seeded the way 0001 seeded the table this one
-- replaces. `stripe_price_id` is NULL for two of the three on purpose: Free is never bought, and
-- Team is a contact link with no price and no checkout, because its five mockup features do not
-- exist and four of them are denylisted.
--
-- `monthly_run_limit` counts **suite runs** — the thing a person triggers and the Runs page lists —
-- not `runs` rows, which are single model calls inside one of them. `monthly_cap_cents` carries
-- EPIC-004's values across unchanged; it is the unbounded-provider-bill rail and is printed nowhere.
--
-- Pro's price id is written by `scripts/stripe-products.mjs` against whichever Stripe account is
-- configured, never committed: a `price_…` from one account means nothing in another.
INSERT INTO "plans" ("key", "stripe_price_id", "monthly_run_limit", "monthly_cap_cents") VALUES
	('free', NULL, 50, 500),
	('pro', NULL, 5000, 5000),
	('team', NULL, 5000, 20000)
ON CONFLICT ("key") DO NOTHING;
