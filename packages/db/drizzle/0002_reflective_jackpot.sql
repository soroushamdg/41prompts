CREATE TABLE "decompiles" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
