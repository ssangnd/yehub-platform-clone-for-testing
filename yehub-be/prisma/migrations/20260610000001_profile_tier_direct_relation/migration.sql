-- Link profiles directly to a single KOL tier instead of via the profile_tiers
-- join table. tier_id is nullable because auto-created profiles have no tier yet.

-- 1. Add the nullable tier_id column to profiles.
ALTER TABLE "profiles" ADD COLUMN "tier_id" UUID;

-- 2. Backfill from the existing profile_tiers join table.
UPDATE "profiles" p
SET "tier_id" = pt."tier_id"
FROM "profile_tiers" pt
WHERE pt."profile_id" = p."id";

-- 3. Index + FK (clearing tier_id when the referenced tier is deleted).
CREATE INDEX "profiles_tier_id_idx" ON "profiles"("tier_id");

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_tier_id_fkey"
    FOREIGN KEY ("tier_id") REFERENCES "kol_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Drop the obsolete join table.
ALTER TABLE "profile_tiers" DROP CONSTRAINT "profile_tiers_profile_id_fkey";
ALTER TABLE "profile_tiers" DROP CONSTRAINT "profile_tiers_tier_id_fkey";
DROP TABLE "profile_tiers";
