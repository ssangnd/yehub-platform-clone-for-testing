-- ─── Enums ───────────────────────────────────────────────────────────

CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- ─── Profiles ────────────────────────────────────────────────────────

CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "gender" "gender",
    "email" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- ─── Social Accounts ─────────────────────────────────────────────────

CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "username" TEXT,
    "display_name" TEXT,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_accounts_profile_id_idx" ON "social_accounts"("profile_id");
CREATE UNIQUE INDEX "social_accounts_platform_platform_user_id_key" ON "social_accounts"("platform", "platform_user_id");

ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── KOL Categories ──────────────────────────────────────────────────

CREATE TABLE "kol_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kol_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kol_categories_name_key" ON "kol_categories"("name");

-- ─── KOL Tiers ───────────────────────────────────────────────────────

CREATE TABLE "kol_tiers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "min_followers" INTEGER NOT NULL DEFAULT 0,
    "max_followers" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kol_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kol_tiers_name_key" ON "kol_tiers"("name");

-- ─── Profile ↔ KOL Category (join table) ─────────────────────────────

CREATE TABLE "profile_categories" (
    "profile_id" UUID NOT NULL,
    "kol_category_id" UUID NOT NULL,

    CONSTRAINT "profile_categories_pkey" PRIMARY KEY ("profile_id","kol_category_id")
);

CREATE INDEX "profile_categories_kol_category_id_idx" ON "profile_categories"("kol_category_id");

ALTER TABLE "profile_categories" ADD CONSTRAINT "profile_categories_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "profile_categories" ADD CONSTRAINT "profile_categories_kol_category_id_fkey"
    FOREIGN KEY ("kol_category_id") REFERENCES "kol_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Profile ↔ KOL Tier (one tier per profile) ───────────────────────

CREATE TABLE "profile_tiers" (
    "profile_id" UUID NOT NULL,
    "tier_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_tiers_pkey" PRIMARY KEY ("profile_id")
);

CREATE INDEX "profile_tiers_tier_id_idx" ON "profile_tiers"("tier_id");

ALTER TABLE "profile_tiers" ADD CONSTRAINT "profile_tiers_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "profile_tiers" ADD CONSTRAINT "profile_tiers_tier_id_fkey"
    FOREIGN KEY ("tier_id") REFERENCES "kol_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
