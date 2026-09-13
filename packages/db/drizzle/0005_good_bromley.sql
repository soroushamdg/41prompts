CREATE TABLE "prompt_variables" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"name" text NOT NULL,
	"default_value" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_variables" ADD CONSTRAINT "prompt_variables_prompt_prompts_id_fk" FOREIGN KEY ("prompt") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_variables_prompt_name_idx" ON "prompt_variables" USING btree ("prompt","name");