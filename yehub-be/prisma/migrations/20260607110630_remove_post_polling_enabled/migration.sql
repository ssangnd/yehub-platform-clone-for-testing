-- Remove the polling_enabled flag from posts; polling is now always active and
-- controlled by the post interval/schedule rather than a boolean toggle.

ALTER TABLE "posts" DROP COLUMN "polling_enabled";
