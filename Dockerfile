# syntax=docker/dockerfile:1.7
# Image fullstack : backend NestJS + SPA React servis par le même conteneur.
# Build reproductible avec package-lock.json, sans installation réseau au démarrage.

# -----------------------------------------------------------------------------
# Base commune
# -----------------------------------------------------------------------------
ARG NODE_VERSION=24.12.0
FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# -----------------------------------------------------------------------------
# Stage: dépendances de build
# -----------------------------------------------------------------------------
FROM base AS build-deps

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY backend/prisma ./backend/prisma/
COPY backend/prisma.config.cjs ./backend/prisma.config.cjs
COPY backend/scripts/prisma-generate.js ./backend/scripts/prisma-generate.js

RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# -----------------------------------------------------------------------------
# Stage: build backend + frontend
# -----------------------------------------------------------------------------
FROM build-deps AS builder

COPY backend ./backend
COPY frontend ./frontend

# prisma generate charge la config (prisma.config.*) qui exige DATABASE_URL ; valeur factice suffit (pas de connexion).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

RUN --mount=type=secret,id=ca_cert,target=/tmp/ca.pem,required=0 \
    sh -c 'if [ -f /tmp/ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/ca.pem; fi; \
    npm -w backend run db:generate && \
    npm -w backend run build && \
    npm -w frontend run build && \
    npm cache clean --force'

# -----------------------------------------------------------------------------
# Stage: dépendances runtime
# -----------------------------------------------------------------------------
FROM base AS prod-deps

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY backend/prisma ./backend/prisma/
COPY backend/prisma.config.cjs ./backend/prisma.config.cjs
COPY backend/scripts/prisma-generate.js ./backend/scripts/prisma-generate.js

RUN --mount=type=secret,id=ca_cert,target=/tmp/ca.pem,required=0 \
    sh -c 'if [ -f /tmp/ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/ca.pem; fi; \
    npm ci --omit=dev --workspace backend --ignore-scripts && \
    PRISMA_VERSION="$(node -e "const lock=require(\"./package-lock.json\"); const p=lock.packages[\"node_modules/prisma\"] || lock.packages[\"backend/node_modules/prisma\"]; if (!p) process.exit(1); console.log(p.version)")" && \
    npm install --omit=dev --ignore-scripts --no-save "prisma@${PRISMA_VERSION}" && \
    npm rebuild bcrypt --workspace backend && \
    npm -w backend run db:generate && \
    rm -rf /root/.npm'

# -----------------------------------------------------------------------------
# Stage: production (backend + client statique)
# -----------------------------------------------------------------------------
FROM base AS production

ARG APP_VERSION=unknown
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Taskmaster" \
      org.opencontainers.image.description="Taskmaster fullstack NestJS + React image" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/mikaYX/taskmaster" \
      org.opencontainers.image.url="https://github.com/mikaYX/taskmaster/releases"

WORKDIR /app

ENV NODE_ENV=production

# Dépendances système minimales pour Chromium/Puppeteer + init PID 1.
# Note: Chromium sous Alpine peut tirer ffmpeg/libsndfile ; les CVE associées
# sont côté Alpine et non corrigeables ici — surveiller les mises à jour apk.
RUN apk upgrade --no-cache && \
    apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tini && \
    rm -rf /var/cache/apk/*

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node backend/package.json ./
COPY --chown=node:node backend/prisma ./prisma/
COPY --chown=node:node backend/prisma.config.cjs ./
COPY --chown=node:node --from=builder /app/backend/dist ./dist
COPY --chown=node:node --from=builder /app/frontend/dist ./client

RUN install -d -o node -g node \
    /app/backups \
    /app/public/uploads \
    /app/storage/procedures

COPY --chown=node:node docker-entrypoint.sh /app/docker-entrypoint.sh
# Supprimer les CRLF (Windows) pour éviter "no such file or directory" sous Linux
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

VOLUME ["/app/backups", "/app/public/uploads", "/app/storage/procedures"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["tini", "--", "/app/docker-entrypoint.sh"]
