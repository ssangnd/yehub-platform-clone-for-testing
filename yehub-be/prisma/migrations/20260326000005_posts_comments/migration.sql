-- ─── Posts ───────────────────────────────────────────────────────────

CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "platform_post_id" TEXT NOT NULL,
    "url" TEXT,
    "content" TEXT,
    "media_type" "MediaType" NOT NULL DEFAULT 'TEXT',
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "polling_enabled" BOOLEAN NOT NULL DEFAULT true,
    "polling_comment_override" INTEGER,
    "polling_metric_override" INTEGER,
    "author_avatar" TEXT,
    "author_name" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "kpi_currents" JSONB,
    "kpi_targets" JSONB,
    "metrics_snapshot" JSONB,
    "last_poll_status" TEXT,
    "last_polled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "posts_campaign_id_idx" ON "posts"("campaign_id");
CREATE INDEX "posts_last_polled_at_idx" ON "posts"("last_polled_at");
CREATE UNIQUE INDEX "posts_campaign_id_platform_platform_post_id_key" ON "posts"("campaign_id", "platform", "platform_post_id");

ALTER TABLE "posts" ADD CONSTRAINT "posts_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Comments ────────────────────────────────────────────────────────

CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "platform_comment_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parent_comment_id" UUID,
    "language" TEXT,
    "author_profile_url" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'FACEBOOK',
    "platform_created_at" TIMESTAMP(3),
    "sentiment" "Sentiment",
    "confidence_score" DOUBLE PRECISION,
    "emotions" "Emotion"[] DEFAULT ARRAY[]::"Emotion"[],
    "is_noise" BOOLEAN NOT NULL DEFAULT false,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "hashtags" JSONB,
    "mentions" JSONB,
    "social_account_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comments_post_id_idx" ON "comments"("post_id");
CREATE INDEX "comments_parent_comment_id_idx" ON "comments"("parent_comment_id");
CREATE INDEX "comments_is_noise_idx" ON "comments"("is_noise");
CREATE INDEX "comments_social_account_id_idx" ON "comments"("social_account_id");
CREATE INDEX "comments_post_id_platform_created_at_idx" ON "comments"("post_id", "platform_created_at");

ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey"
    FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comments" ADD CONSTRAINT "comments_social_account_id_fkey"
    FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Profile ↔ Post (join table) ─────────────────────────────────────

CREATE TYPE "linked_by" AS ENUM ('AUTO', 'MANUAL');

CREATE TABLE "profile_posts" (
    "profile_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "linked_by" "linked_by" NOT NULL DEFAULT 'AUTO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_posts_pkey" PRIMARY KEY ("profile_id","post_id")
);

CREATE UNIQUE INDEX "profile_posts_post_id_key" ON "profile_posts"("post_id");

ALTER TABLE "profile_posts" ADD CONSTRAINT "profile_posts_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "profile_posts" ADD CONSTRAINT "profile_posts_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
