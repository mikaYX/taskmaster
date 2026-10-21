@echo off
setlocal EnableExtensions DisableDelayedExpansion
REM Mise a jour depuis les sources. Pour une installation MSI, lancer le nouveau MSI.
REM Dump automatique avant toute mise a jour. Sauvegarder les fichiers separement.
pushd "%~dp0.."
if errorlevel 1 exit /b 1

echo =======================================
echo Taskmaster - Mise a jour depuis les sources
echo =======================================
echo Les fichiers uploades doivent etre sauvegardes separement.

set "UPDATE_STEP=database backup"
echo [1/5] Sauvegarde de la base avant toute modification...
call node scripts\backup-database.cjs
if errorlevel 1 goto :error

set "UPDATE_STEP=git pull --ff-only"
echo [2/5] Recuperation des dernieres modifications...
call git pull --ff-only
if errorlevel 1 goto :error

set "UPDATE_STEP=npm ci --include=dev"
echo [3/5] Installation des dependances depuis le lockfile et generation Prisma...
call npm ci --include=dev
if errorlevel 1 goto :error

set "UPDATE_STEP=prisma migrate deploy"
echo [4/5] Application des migrations existantes...
REM Prisma 7 ne charge pas automatiquement les fichiers .env.
REM Node les lit sans executer leur contenu ; les variables deja exportees priment.
set "UPDATE_ENV_ARGS="
if exist ".env" set "UPDATE_ENV_ARGS=--env-file=.env"
if exist "backend\.env" set "UPDATE_ENV_ARGS=%UPDATE_ENV_ARGS% --env-file=backend\.env"
call node %UPDATE_ENV_ARGS% node_modules\prisma\build\index.js migrate deploy --config=backend\prisma.config.cjs
if errorlevel 1 goto :error

set "UPDATE_STEP=npm run build"
echo [5/5] Compilation du backend et du frontend...
call npm run build
if errorlevel 1 goto :error

echo Mise a jour terminee. Redemarrez votre processus ou service Taskmaster.
popd
exit /b 0

:error
set "UPDATE_EXIT_CODE=%errorlevel%"
if "%UPDATE_EXIT_CODE%"=="0" set "UPDATE_EXIT_CODE=1"
echo ERREUR : echec de %UPDATE_STEP%. Mise a jour interrompue. 1>&2
popd
exit /b %UPDATE_EXIT_CODE%
