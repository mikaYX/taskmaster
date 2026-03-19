# 🚀 Taskmaster - Démarrage Rapide

## 📂 Structure du projet
```bash
.
├── backend/    # API NestJS
├── frontend/   # SPA React
├── .env        # Configuration
└── docker-compose.yml
```

## 🛠️ Installation

```bash
# Installation des dépendances à la racine
npm install

# Installation des dépendances backend & frontend
cd backend
npm install 
cd ..
cd frontend  
npm install
cd ..
```

## 🐳 Docker (stack complète `docker-compose.yml`)

Avant le premier `docker compose up`, créez les dossiers persistés sous `./data` et, sur **Linux / WSL**, donnez la propriété à l’utilisateur `node` du conteneur (UID **1000**) :

```bash
mkdir -p data/node_modules data/app/backups data/app/public/uploads data/app/storage/procedures
# Linux / WSL uniquement si erreurs d’accès en écriture :
# sudo chown -R 1000:1000 data
```

Voir le détail dans [`SETUP.md`](SETUP.md) (section *Dossiers de données*).

## 🗄️ Base de Données

```bash
# (facultatif si vous avez une instance postgresql distante) Lancement de la base PostgreSQL (Docker)
docker compose -f .\docker-compose.local-db.yml up -d

# Copier le fichier .env.example en .env
cp .env.example .env

# Modifier le fichier .env avec les informations de connexion à la base de données

# Initialisation de la base (Prisma)
cd backend
npx prisma migrate dev
npx prisma generate
```

## 🚀 Lancement

```bash
# À la racine pour tout lancer (Backend + Frontend)
npm run dev
```

---
*Backend: http://localhost:3000 | Frontend: http://localhost:5173*