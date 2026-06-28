-- Track metric and comment poll times separately so the post sync schedule
-- can show "Last metric sync" and "Last comment sync" independently.

ALTER TABLE "posts"
  ADD COLUMN "last_metric_polled_at" TIMESTAMP(3),
  ADD COLUMN "last_comment_polled_at" TIMESTAMP(3);
