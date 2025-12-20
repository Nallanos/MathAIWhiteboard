DROP INDEX IF EXISTS idx_tutoring_sessions_conversation_id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tutoring_sessions_conversation_user" ON "tutoring_sessions" USING btree ("conversation_id","user_id");