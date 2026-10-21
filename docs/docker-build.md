# Docker build

Taskmaster ships as a single image holding the API and the web interface. Official images are published on Docker Hub as [`mikaxy/taskmaster`](https://hub.docker.com/r/mikaxy/taskmaster). This page is for building your own.

| File | Role |
| --- | --- |
| [`Dockerfile`](../Dockerfile) | Multi-stage build (production dependencies, build, `production` image) |
| [`docker-compose.yml`](../docker-compose.yml) | Production stack, using `TASKMASTER_IMAGE` |
| [`docker-compose.build.yml`](../docker-compose.build.yml) | The same stack, building the app from the local sources |
| [`scripts/docker-build-push.sh`](../scripts/docker-build-push.sh), [`.bat`](../scripts/docker-build-push.bat) | Build and push to your Docker Hub account |

## Build

```bash
DOCKER_BUILDKIT=1 docker build -t taskmaster:secure-local .
TASKMASTER_IMAGE=taskmaster:secure-local docker compose up -d
```

Or build and start in one go, reusing the volumes of `docker-compose.yml`:

```bash
docker compose -f docker-compose.build.yml up --build -d
```

Behind a TLS-inspecting corporate proxy, pass its CA certificate as a BuildKit secret, so npm and Prisma can download:

```bash
docker build --secret id=ca_cert,src=/path/to/corporate-ca.pem -t taskmaster:secure-local .
```

`scripts/docker-build-push.sh` does the same when `CORPORATE_CA_CERT_FILE` is set.

## Publish

**From GitHub Actions.** Pushing a version tag (`v1.2.0`, `v1.2.0-beta.1`…) runs [`release.yml`](../.github/workflows/release.yml), which:
- runs the quality checks, and publishes nothing if they fail;
- builds `linux/amd64`;
- pushes the version tag to Docker Hub;
- creates the GitHub release from the changelog.

A stable version also moves `latest`. A pre-release (`v1.2.0-beta.1`) moves `beta` instead and is marked as a pre-release on GitHub.

The repository needs:
- a `DOCKERHUB_TOKEN` secret;
- a `DOCKERHUB_USERNAME` variable, the Docker Hub namespace. A secret of the same name still works.

**By hand:**

```bash
DOCKERHUB_USER=your-account TAG=1.2.0 ./scripts/docker-build-push.sh push
```

## What the image does

- Runs as the non-root `node` user. The entrypoint refuses to start as root.
- Installs its dependencies at build time with `npm ci`. Nothing is installed at startup.
- Applies `prisma migrate deploy` at startup, then starts the server. The Prisma CLI stays in the image for that.
- Generates PDF reports in JavaScript (pdfkit), so no browser is bundled. The 1.2.0-beta.5 image is about 1.1 GB.
- Declares a `HEALTHCHECK` on `/api/health` (through Node.js, since the image has no `curl`).
- Ships the PostgreSQL 18 client (`pg_dump`, `pg_restore`) for backups.

## Security scan

[`security-scan.yml`](../.github/workflows/security-scan.yml):
1. rebuilds the `production` stage without cache, so `apk upgrade` picks up the latest Alpine fixes;
2. runs Trivy;
3. checks that `pg_dump` is present.

`apk upgrade` does not update Node.js itself: a Node.js CVE needs a newer `NODE_VERSION` in the Dockerfile.

The scan blocks HIGH and CRITICAL vulnerabilities that have a fix, except the active entries of [`security/trivy-exceptions.json`](../security/trivy-exceptions.json). The `trivy-image-report` artifact also lists those without a fix. A passing scan therefore does not mean there are no vulnerabilities.

To reproduce it locally:

```bash
docker buildx build --pull --no-cache-filter production --load -t taskmaster:ci .
node scripts/validate-trivy-exceptions.js
trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 taskmaster:ci
```

## Check a build

```bash
docker image inspect taskmaster:secure-local --format '{{.Config.User}}'   # node
TASKMASTER_IMAGE=taskmaster:secure-local docker compose up -d
docker compose ps
curl http://localhost:3000/api/health
```
