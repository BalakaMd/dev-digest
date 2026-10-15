ALTER TABLE "agent_runs" ADD COLUMN "cost_source" text;--> statement-breakpoint
CREATE INDEX "agent_runs_ws_ran_idx" ON "agent_runs" USING btree ("workspace_id","ran_at");