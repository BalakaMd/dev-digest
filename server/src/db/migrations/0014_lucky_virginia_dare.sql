ALTER TABLE "findings" ADD COLUMN "cited_docs" jsonb;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "context_docs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "context_docs" jsonb DEFAULT '[]'::jsonb NOT NULL;