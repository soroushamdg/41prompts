CREATE TABLE "model_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"provider" text NOT NULL,
	"runs_in" text NOT NULL,
	"model_id" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ciphertext" text,
	"iv" text,
	"auth_tag" text,
	"key_version" integer,
	"secret_hint" text,
	"input_per_mtok" double precision,
	"output_per_mtok" double precision,
	"price_source" text,
	"price_at" timestamp with time zone,
	"last_test_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_test_ms" integer,
	"last_test_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_connections_browser_no_secret" CHECK ("model_connections"."runs_in" = 'server' or "model_connections"."ciphertext" is null),
	CONSTRAINT "model_connections_sealed_complete" CHECK (("model_connections"."ciphertext" is null) = ("model_connections"."iv" is null) and ("model_connections"."iv" is null) = ("model_connections"."auth_tag" is null) and ("model_connections"."auth_tag" is null) = ("model_connections"."key_version" is null)),
	CONSTRAINT "model_connections_prices" CHECK (coalesce("model_connections"."input_per_mtok", 0) >= 0 and coalesce("model_connections"."output_per_mtok", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "model_connections" ADD CONSTRAINT "model_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_connections_user_label_idx" ON "model_connections" USING btree ("user_id",lower("label"));--> statement-breakpoint
CREATE INDEX "model_connections_user_created_idx" ON "model_connections" USING btree ("user_id","created_at");