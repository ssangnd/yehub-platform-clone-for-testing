-- ─── Enums ───────────────────────────────────────────────────────────

CREATE TYPE "global_role" AS ENUM ('ADMIN', 'INTERNAL_USER', 'AUTHORIZED_USER');
CREATE TYPE "user_status" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE');
CREATE TYPE "project_role" AS ENUM ('MANAGER', 'EXECUTIVE', 'ANALYST', 'VIEWER');
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'THREADS');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "MediaType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL', 'STORY', 'REEL');
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED');
CREATE TYPE "Emotion" AS ENUM ('JOY', 'SADNESS', 'ANGER', 'FEAR', 'SURPRISE', 'DISGUST', 'TRUST', 'ANTICIPATION');

-- ─── Users ───────────────────────────────────────────────────────────

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "role" "global_role" NOT NULL DEFAULT 'AUTHORIZED_USER',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "invited_by" UUID,
    "invitation_token_hash" TEXT,
    "invitation_expires_at" TIMESTAMP(3),
    "invitation_accepted_at" TIMESTAMP(3),
    "invitation_sent_at" TIMESTAMP(3),
    "reset_token_selector" TEXT,
    "reset_token_hash" TEXT,
    "reset_token_expires_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "locked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_reset_token_selector_key" ON "users"("reset_token_selector");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_invitation_token_hash_idx" ON "users"("invitation_token_hash");

-- ─── Sessions ────────────────────────────────────────────────────────

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "os_name" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "location" TEXT,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
