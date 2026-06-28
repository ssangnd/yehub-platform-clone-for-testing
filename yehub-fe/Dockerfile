# --- Base ---
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS build
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- Runtime ---
FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_PROXY_TARGET=http://localhost:3000
ENV NGINX_ENVSUBST_FILTER_VARS=API_PROXY_TARGET
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
