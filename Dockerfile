# syntax=docker/dockerfile:1
# Image fullstack : backend NestJS + SPA React servis par le même conteneur.
# Un seul déploiement, une seule image. BuildKit: DOCKER_BUILDKIT=1
#
# Contexte de build : racine du repo (docker build -f Dockerfile.fullstack .)
# Node 24.x = Active LTS (Krypton). 24.14 = dernier patch LTS au 2026-02.
# Voir https://nodejs.org/en/about/releases/

# -----------------------------------------------------------------------------
# Stage: frontend (build SPA)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps

COPY frontend/ .
RUN npm run build && rm -rf /root/.npm

# -----------------------------------------------------------------------------
# Stage: backend builder
# -----------------------------------------------------------------------------
FROM node:24-alpine AS backend-builder

WORKDIR /app

COPY backend/package.json ./
COPY backend/prisma ./prisma/

RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --ignore-scripts

COPY backend/ .

# prisma generate charge la config (prisma.config.*) qui exige DATABASE_URL ; valeur factice suffit (pas de connexion)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

# Optionnel : certificat CA (ex. Zscaler) pour HTTPS derrière proxy corporate (--secret id=ca_cert,src=...)
RUN --mount=type=secret,id=ca_cert,target=/tmp/ca.pem,required=0 \
    sh -c 'if [ -f /tmp/ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/ca.pem; fi; \
    npx prisma generate --schema=./prisma/schema.prisma && \
    npm run build && \
    rm -rf /root/.npm'

# -----------------------------------------------------------------------------
# Stage: production (backend + client statique)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
# Empêcher Puppeteer de télécharger Chromium (on utilise le binaire système)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

# Dépendances système pour Chromium/Puppeteer + su-exec (drop root).
# Note: Chromium sous Alpine peut tirer ffmpeg/libsndfile ; les CVE associées
# sont côté Alpine et non corrigeables ici — surveiller les mises à jour apk.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    su-exec

# Fichiers nécessaires pour l'installation des dépendances au premier démarrage.
# On ne copie que package.json (pas le lockfile) pour que npm install applique les overrides
# (minimatch, tar) et résolve des versions corrigées des CVE.
COPY --chown=node:node backend/package.json ./
COPY --chown=node:node backend/prisma ./prisma/
COPY --chown=node:node backend/prisma.config.cjs ./

# Pas d'installation npm en phase de build : les dépendances seront installées
# dans un volume au premier démarrage du conteneur.

COPY --chown=node:node --from=backend-builder /app/dist ./dist

# SPA servie par NestJS depuis /app/client
COPY --chown=node:node --from=frontend-builder /app/dist ./client

# Volume pour node_modules (installé au premier démarrage)
VOLUME ["/app/node_modules"]

RUN mkdir -p /app/backups /app/public/uploads /app/storage/procedures && \
    chown -R node:node /app/backups /app/public/uploads /app/storage /app/client

COPY --chown=node:node docker-entrypoint.sh /app/docker-entrypoint.sh
# Supprimer les CRLF (Windows) pour éviter "no such file or directory" sous Linux
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# Pas de USER node : l'entrypoint lance l'install en root puis exécute l'app avec su-exec node
EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
