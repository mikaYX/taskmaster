# Taskmaster - Setup Guide

Complete installation and configuration guide.

## Prerequisites

- **Docker** & Docker Compose v2
- **Node.js** 22+ (for local development)
- **PostgreSQL** 18 (if not using Docker)

---

## Quick Start (Docker)

### 1. Clone and Configure

```bash
cd taskmaster

# Backend environment
cp backend/.env.example backend/.env

# Edit backend/.env and set:
# - AUTH_SECRET (generate with: openssl rand -base64 32)
# - DATABASE_URL (if using external database)
# - Change everything as by default it's not secure
```

### 2. Dossiers de données (`docker-compose.yml`)

Les volumes bind-mount du service `app` pointent sous `./data` à la racine du dépôt. **Créez ces dossiers avant le premier `docker compose up`**, sinon Docker peut créer des répertoires avec des propriétaires inadaptés (surtout sur Linux / WSL).

```bash
# À la racine du dépôt (à côté de docker-compose.yml)
mkdir -p data/node_modules \
  data/app/backups \
  data/app/public/uploads \
  data/app/storage/procedures
```

**Linux / WSL / macOS** : l’entrypoint installe les deps en root puis l’application s’exécute en **`node` (UID 1000 dans l’image)**. Pour que les écritures (backups, uploads, etc.) ne tombent pas en « Permission denied » sur les volumes hôtes :

```bash
sudo chown -R 1000:1000 data
chmod -R u+rwX,g+rX,o-rwx data   # optionnel : restreindre aux autres utilisateurs
```

*(Si votre utilisateur hôte est déjà l’UID 1000, `chown` peut être inutile ; en cas de doute, `sudo chown -R 1000:1000 data` reste le réglage attendu pour l’image `node` officielle.)*

**Windows (Docker Desktop)** : le `mkdir` suffit le plus souvent ; pas de `chown`/`chmod` équivalent en natif.

### 3. Start Services

```bash
docker compose up -d
```

### 4. Apply Database Migrations

```bash
cd backend
npx prisma migrate deploy
npx prisma db seed  # Optional: seed initial data
```

### 5. Access Application

- **Frontend**: <http://localhost:5173>
- **Backend API**: <http://localhost:3000>

---

## Local Development

### Backend

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start PostgreSQL (Docker)
docker run -d --name taskmaster-db \
  -e POSTGRES_USER=taskmaster \
  -e POSTGRES_PASSWORD=taskmaster_dev \
  -e POSTGRES_DB=taskmaster \
  -p 5432:5432 \
  postgres:17

# Apply migrations
npx prisma migrate deploy

# Start development server
npm run start:dev
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

---

## First Login

### Default Admin Account

After initial setup, use the setup wizard to:

1. **Set admin password** - Create secure admin credentials
2. **Configure email** (optional) - SMTP or provider settings
3. **Set backup retention** - How long to keep backups
4. **Configure preferences** - Timezone, scheduler settings

### Create Additional Users

1. Login as admin
2. Navigate to **Users** in sidebar
3. Click **Create User**
4. Set username, password, and role (ADMIN/USER)

---

## Environment Variables

### Required

| Variable       | Description           | Example                                |
| :------------- | :-------------------- | :------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db`  |
| `AUTH_SECRET`  | JWT signing secret    | `openssl rand -base64 32`              |

### Optional

| Variable    | Default       | Description       |
| :---------- | :------------ | :---------------- |
| `NODE_ENV`  | `development` | Environment mode  |
| `PORT`      | `3000`        | Backend port      |
| `LOG_LEVEL` | `info`        | Logging verbosity |

### Frontend Variables

| Variable       | Default | Description          |
| :------------- | :------ | :------------------- |
| `VITE_API_URL` | `/api`  | Backend API base URL |

---

## Production Deployment

### 1. Build Frontend

```bash
cd frontend
npm run build
# Output in dist/
```

### 2. Build Backend

```bash
cd backend
npm run build
# Output in dist/
```

### 3. Configure Reverse Proxy

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name taskmaster.example.com;

    # Frontend (static files)
    location / {
        root /var/www/taskmaster/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Start Backend

```bash
cd backend
NODE_ENV=production node dist/main.js
```

---

## Troubleshooting

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Migrations Not Applied

```bash
cd backend
npx prisma migrate status
npx prisma migrate deploy
```

### Frontend Build Errors

```bash
cd frontend
rm -rf node_modules
npm install
npm run build
```

### Reset Everything

```bash
# Stop containers
docker-compose down -v

# Remove data
rm -rf backend/backups/*
rm -rf backend/exports/*

# Restart fresh
docker-compose up -d
cd backend && npx prisma migrate deploy
```