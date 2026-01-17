ALTER TABLE "users" ALTER COLUMN "ai_credits" SET DEFAULT 5;

UPDATE "users"
SET "ai_credits" = LEAST("ai_credits", 5);
