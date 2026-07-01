# ── Stage 1: Base (shared node + pnpm) ───────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── Stage 2: Install all dependencies ────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 3: Build ────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma:generate && pnpm build

# ── Stage 4: Production ──────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
ENV PATH="/app/node_modules/.bin:$PATH"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
EXPOSE 3000
CMD ["node", "dist/src/main"]

# ── Stage 5: Worker (same artifacts as production, different entrypoint) ──
# EB's Dockerrun.aws.json "Cmd" override is NOT supported on the AL2023
# single-container Docker platform (only Image/Ports/Volumes/Logging are),
# so the worker's command must be baked into its own image via this stage
# rather than relied on as a deploy-time override.
FROM production AS worker
EXPOSE 3001
CMD ["node", "dist/src/worker"]
