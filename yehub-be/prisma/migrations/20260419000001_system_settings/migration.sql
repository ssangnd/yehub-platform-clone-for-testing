-- ─── System Settings ─────────────────────────────────────────────────

CREATE TYPE "system_setting_type" AS ENUM ('TEXT', 'BOOLEAN', 'NUMBER');

CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "type" "system_setting_type" NOT NULL,
    "value_text" TEXT,
    "value_boolean" BOOLEAN,
    "value_number" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
