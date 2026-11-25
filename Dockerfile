# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Multi-stage production image
#   deps    → install all deps (cached by lockfile)
#   build   → compile TypeScript, then prune to production deps
#   runtime → minimal image, non-root user, only dist + prod node_modules
# ---------------------------------------------------------------------------
ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod --ignore-scripts

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/'+(process.env.API_PREFIX||'api')+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# tini = proper PID 1: forwards SIGTERM so Nest shutdown hooks run (graceful shutdown).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
