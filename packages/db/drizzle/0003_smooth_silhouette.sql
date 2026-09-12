CREATE TABLE "decompile_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_hash" text,
	"bloks" integer NOT NULL,
	"findings" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
