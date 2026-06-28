import * as Joi from 'joi';

// Shared by both the API and the worker processes: database, Redis, and object
// storage. Both load PrismaModule, QueueModule/CacheModule (Redis), and an
// uploads surface (the API serves upload endpoints; the worker stores scraped
// media), so all of these are needed on both sides.
const baseSchema = {
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().uri().required(),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_PUBLIC_ENDPOINT: Joi.string().uri().optional(),
  S3_FORCE_PATH_STYLE: Joi.string().valid('true', 'false').default('false'),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().default('yehub'),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
};

// Apify scraper config + processor concurrency. Only the worker executes
// scrapes (PollingProcessorModule hosts the adapters/Apify clients and the
// BullMQ processors), so these belong solely to the worker schema below.
const apifySchema = {
  APIFY_TOKEN: Joi.string().optional(),
  APIFY_TIMEOUT_MS: Joi.number().default(120000),
  APIFY_MEMORY_MB: Joi.number().default(1024),
  APIFY_USAGE_REFRESH_DELAY_MS: Joi.number().default(15000),
  POLLING_PROCESSOR_CONCURRENCY: Joi.number().default(5),
  APIFY_FACEBOOK_POSTS_ACTOR_ID: Joi.string().default(
    'apify~facebook-posts-scraper',
  ),
  APIFY_FACEBOOK_COMMENTS_ACTOR_ID: Joi.string().default(
    'apify~facebook-comments-scraper',
  ),
  APIFY_FACEBOOK_POSTS_LIMIT: Joi.number().default(25),
  APIFY_FACEBOOK_COMMENTS_LIMIT: Joi.number().default(500),
  APIFY_INSTAGRAM_POSTS_ACTOR_ID: Joi.string().default(
    'apify~instagram-post-scraper',
  ),
  APIFY_INSTAGRAM_COMMENTS_ACTOR_ID: Joi.string().default(
    'apify~instagram-comment-scraper',
  ),
  APIFY_INSTAGRAM_POSTS_LIMIT: Joi.number().default(5),
  APIFY_INSTAGRAM_COMMENTS_LIMIT: Joi.number().default(10000),
  APIFY_INSTAGRAM_PROFILE_ACTOR_ID: Joi.string().default(
    'apify~instagram-profile-scraper',
  ),
  APIFY_THREADS_POSTS_ACTOR_ID: Joi.string().default(
    'logical_scrapers~threads-post-scraper',
  ),
  APIFY_YOUTUBE_POSTS_ACTOR_ID: Joi.string().default(
    'streamers~youtube-scraper',
  ),
  APIFY_YOUTUBE_COMMENTS_ACTOR_ID: Joi.string().default(
    'streamers~youtube-comments-scraper',
  ),
  APIFY_YOUTUBE_POSTS_LIMIT: Joi.number().default(1),
  APIFY_YOUTUBE_COMMENTS_LIMIT: Joi.number().default(500),
  APIFY_TIKTOK_POSTS_ACTOR_ID: Joi.string().default(
    'clockworks~tiktok-scraper',
  ),
  APIFY_TIKTOK_COMMENTS_ACTOR_ID: Joi.string().default(
    'clockworks~tiktok-comments-scraper',
  ),
  APIFY_TIKTOK_POSTS_LIMIT: Joi.number().default(1),
  APIFY_TIKTOK_COMMENTS_LIMIT: Joi.number().default(500),
};

// API process (main.ts / AppModule): base + HTTP server, auth (JWT), and mail
// config. The worker never serves HTTP requests, issues tokens, or sends mail,
// so these are intentionally excluded from the worker schema below.
export const apiValidationSchema = Joi.object({
  ...baseSchema,
  PORT: Joi.number().default(3000),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().default('noreply@yehub.com'),
});

// Worker process (worker.ts / WorkerModule): base + its own health-server port
// + the Apify scraper config it alone executes against.
export const workerValidationSchema = Joi.object({
  ...baseSchema,
  ...apifySchema,
  WORKER_PORT: Joi.number().default(3001),
});
