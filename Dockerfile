# syntax=docker/dockerfile:1.7

# ── Stage 1: native addon build ──────────────────────────────────
FROM node:22-bookworm-slim AS addon-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential python3 pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY binding.gyp ./
COPY addon ./addon
COPY engine ./engine
RUN npx node-gyp rebuild

# ── Stage 2: dashboard build ────────────────────────────────────
FROM node:22-bookworm-slim AS dashboard-builder

WORKDIR /src/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard ./
RUN npm run build

# ── Stage 3: server build ───────────────────────────────────────
FROM node:22-bookworm-slim AS server-builder

WORKDIR /src/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server ./
RUN npm run build

# ── Stage 4: runtime ────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# libcap2-bin so we can setcap the node binary — but the container
# already gets CAP_NET_RAW via docker-compose cap_add, so we don't
# actually need setcap in the image. Keep the image minimal.
RUN apt-get update && apt-get install -y --no-install-recommends \
        dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Unprivileged user. Grants CAP_NET_RAW at container start via
# docker-compose; the process itself never runs as root.
RUN groupadd -r netsentinel && useradd -r -g netsentinel netsentinel

WORKDIR /app

# Server compiled output + node_modules (prod only)
COPY --from=server-builder /src/server/dist        ./server/dist
COPY --from=server-builder /src/server/package.json ./server/package.json
COPY --from=server-builder /src/server/node_modules ./server/node_modules

# Native addon
COPY --from=addon-builder /src/build/Release/netsentinel_addon.node ./build/Release/netsentinel_addon.node

# Dashboard static build
COPY --from=dashboard-builder /src/dashboard/dist ./dashboard/dist

# Runtime env defaults
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    STATS_INTERVAL_MS=500 \
    WS_PATH=/ws

EXPOSE 3000

# dumb-init is PID 1, so SIGTERM reaches node and the graceful shutdown
# in index.ts runs. Without this, Docker kills the process immediately
# on `docker stop`, and capture_destroy() never runs.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server/dist/index.js"]