# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# IT Desk - multi-stage production image
#
# deps    installs node_modules (cached until package-lock.json changes)
# builder builds the Next.js standalone bundle
# runner  ships only the standalone server and static assets, as a non-root user
# ---------------------------------------------------------------------------

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps -------------------------------------------------------------------
FROM base AS deps
# Compilers are only a fallback: better-sqlite3 downloads a prebuilt binary
# when one matches the server's CPU, and builds from source when it doesn't.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- builder ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data

RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

# SQLite database and uploaded screenshots live here; mount a volume on it.
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
