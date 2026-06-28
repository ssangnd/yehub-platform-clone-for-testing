-- Move post links from profiles to social accounts and keep the original
-- posts/comments migration immutable for already-deployed databases.

ALTER TABLE "posts" DROP COLUMN IF EXISTS "kpi_currents";

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "author_name" TEXT;

CREATE TABLE IF NOT EXISTS "social_account_posts" (
    "social_account_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "linked_by" "linked_by" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_account_posts_pkey" PRIMARY KEY ("social_account_id","post_id")
);

DO $$
BEGIN
    IF to_regclass('profile_posts') IS NOT NULL THEN
        INSERT INTO "social_account_posts" ("social_account_id", "post_id", "linked_by", "created_at")
        SELECT DISTINCT ON (pp."post_id")
            sa."id",
            pp."post_id",
            pp."linked_by",
            pp."created_at"
        FROM "profile_posts" pp
        JOIN "social_accounts" sa ON sa."profile_id" = pp."profile_id"
        ON CONFLICT ("social_account_id", "post_id") DO NOTHING;

        DROP TABLE "profile_posts";
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "social_account_posts_post_id_key"
    ON "social_account_posts"("post_id");

CREATE INDEX IF NOT EXISTS "social_account_posts_social_account_id_idx"
    ON "social_account_posts"("social_account_id");

ALTER TABLE "social_account_posts" DROP CONSTRAINT IF EXISTS "social_account_posts_social_account_id_fkey";
ALTER TABLE "social_account_posts" ADD CONSTRAINT "social_account_posts_social_account_id_fkey"
    FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_account_posts" DROP CONSTRAINT IF EXISTS "social_account_posts_post_id_fkey";
ALTER TABLE "social_account_posts" ADD CONSTRAINT "social_account_posts_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
