ALTER TABLE "ci_installations" ADD COLUMN "agent_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_path" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "exported_agent_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_number" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_collected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_installation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "external_pr_number" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "actions_run_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "actions_run_attempt" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "actions_job_url" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "ci_trace" jsonb;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_ci_installation_id_ci_installations_id_fk" FOREIGN KEY ("ci_installation_id") REFERENCES "public"."ci_installations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_ci_actions_run_uniq" ON "agent_runs" USING btree ("workspace_id","repo","actions_run_id","actions_run_attempt") WHERE "agent_runs"."source" = 'ci';--> statement-breakpoint
CREATE INDEX "agent_runs_ci_ran_at_idx" ON "agent_runs" USING btree ("workspace_id","ran_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "agent_runs"."source" = 'ci';--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_agent_repo_uniq" UNIQUE("agent_id","repo");