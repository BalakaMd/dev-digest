CREATE TABLE "convention_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"sample_files" jsonb NOT NULL,
	"proposed" integer NOT NULL,
	"kept" integer NOT NULL,
	"dropped_unverified" integer NOT NULL,
	"merged_duplicates" integer NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "scan_id" uuid;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "category" text NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "line_start" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "line_end" integer;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "evidence" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "model_confidence" double precision;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convention_scans" ADD CONSTRAINT "convention_scans_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convention_scans_repo_idx" ON "convention_scans" USING btree ("repo_id","created_at");--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_scan_id_convention_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."convention_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conventions_repo_status_idx" ON "conventions" USING btree ("repo_id","status");--> statement-breakpoint
CREATE INDEX "conventions_ws_idx" ON "conventions" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "accepted";--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_status_ck" CHECK ("conventions"."status" in ('pending', 'accepted', 'rejected'));