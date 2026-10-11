CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cases_done" integer DEFAULT 0 NOT NULL,
	"cases_errored" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "eval_runs" DROP CONSTRAINT "eval_runs_case_id_eval_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "eval_runs" ALTER COLUMN "case_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "case_name" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "expected_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "findings_returned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "findings_kept" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "must_find_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "must_find_matched" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "must_not_flag_hits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_suite_runs_agent_started_idx" ON "eval_suite_runs" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_one_running_uidx" ON "eval_suite_runs" USING btree ("agent_id") WHERE "eval_suite_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_owner_created_idx" ON "eval_cases" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_finding_uidx" ON "eval_cases" USING btree ("source_finding_id") WHERE "eval_cases"."source_finding_id" is not null;