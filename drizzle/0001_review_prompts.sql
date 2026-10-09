CREATE TABLE "review_prompts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"ask_count" integer DEFAULT 0 NOT NULL,
	"last_stage" text,
	"last_asked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_prompts" ADD CONSTRAINT "review_prompts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;