CREATE TABLE IF NOT EXISTS "cron_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" varchar NOT NULL,
	"operational_date" date NOT NULL,
	"status" varchar NOT NULL,
	"started_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cron_runs_job_name_operational_date_idx" ON "cron_runs" ("job_name","operational_date");