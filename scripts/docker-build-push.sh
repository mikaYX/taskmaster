#!/usr/bin/env bash
# Build et push de l'image Docker taskmaster (fullstack) vers Docker Hub.
#
# Prérequis: docker (et docker compose v2), compte Docker Hub.
#
# Usage:
#   export DOCKERHUB_USER=votre-compte-dockerhub
#   ./scripts/docker-build-push.sh build   # build l'image
#   ./scripts/docker-build-push.sh push    # build puis push
#
# Derrière proxy corporate (Zscaler, etc.) — certificat CA pour Prisma/npm :
#   export CORPORATE_CA_CERT_FILE="/chemin/vers/zscaler.cer"
#   # ou plusieurs certs concaténés dans un seul fichier
#   ./scripts/docker-build-push.sh build
#
# Avec tag:
#   DOCKERHUB_USER=monuser TAG=1.0.0 ./scripts/docker-build-push.sh push

set -e
cd "$(dirname "$0")/.."

if [ -z "${DOCKERHUB_USER}" ]; then
  echo "Erreur: définir DOCKERHUB_USER (votre compte Docker Hub)."
  echo "Exemple: export DOCKERHUB_USER=monuser"
  echo "Puis:    ./scripts/docker-build-push.sh build   # ou  push"
  exit 1
fi

export DOCKERHUB_USER
export TAG="${TAG:-latest}"
IMAGE="${DOCKERHUB_USER}/taskmaster:${TAG}"

# Certificat CA optionnel (premier chemin si plusieurs, ex. CORPORATE_CA_CERT="a.cer b.crt")
CA_FILE=""
if [ -n "${CORPORATE_CA_CERT_FILE}" ] && [ -f "${CORPORATE_CA_CERT_FILE}" ]; then
  CA_FILE="${CORPORATE_CA_CERT_FILE}"
elif [ -n "${CORPORATE_CA_CERT}" ]; then
  FIRST_CA="${CORPORATE_CA_CERT%% *}"
  if [ -f "${FIRST_CA}" ]; then
    CA_FILE="${FIRST_CA}"
  fi
fi

echo "Build image: ${IMAGE}"
if [ -n "${CA_FILE}" ]; then
  echo "Using CA cert for build: ${CA_FILE}"
  DOCKER_BUILDKIT=1 docker build --secret id=ca_cert,src="${CA_FILE}" -t "${IMAGE}" -f Dockerfile .
else
  docker compose -f docker-compose.dockerhub.yml build
fi

if [ "${1:-}" = "push" ]; then
  echo "Push vers Docker Hub..."
  echo "Astuce: en cas d'erreur d'auth, exécutez: docker login"
  docker compose -f docker-compose.dockerhub.yml push
  echo "Terminé."
fi
