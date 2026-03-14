@echo off
setlocal EnableDelayedExpansion
REM Build et push de l'image Docker taskmaster (fullstack) vers Docker Hub.
REM
REM Prérequis: docker (et docker compose v2), compte Docker Hub.
REM
REM Usage:
REM   Par argument (recommandé sous PowerShell):
REM     scripts\docker-build-push.bat mikaxy build
REM     scripts\docker-build-push.bat mikaxy push
REM   Par variable d'environnement (CMD):
REM     set DOCKERHUB_USER=monuser
REM     scripts\docker-build-push.bat build
REM   Sous PowerShell: $env:DOCKERHUB_USER = "monuser"; .\scripts\docker-build-push.bat build
REM
REM Derrière proxy corporate (Zscaler, etc.) — certificat CA pour Prisma/npm :
REM   set CORPORATE_CA_CERT_FILE=C:\chemin\vers\zscaler.cer
REM   scripts\docker-build-push.bat build
REM
REM Avec tag:
REM   set TAG=1.0.0
REM   scripts\docker-build-push.bat mikaxy push

cd /d "%~dp0\.."

REM Si le 1er argument n'est pas build/push, c'est le compte Docker Hub
set "ACTION=%1"
if "%ACTION%"=="build" goto :check_user
if "%ACTION%"=="push"  goto :check_user
set "DOCKERHUB_USER=%1"
shift
set "ACTION=%1"

:check_user
if "%DOCKERHUB_USER%"=="" (
  echo Erreur: definir DOCKERHUB_USER ^(votre compte Docker Hub^).
  echo Exemples:
  echo   scripts\docker-build-push.bat mikaxy build
  echo   set DOCKERHUB_USER=monuser ^& scripts\docker-build-push.bat build
  echo   PowerShell: $env:DOCKERHUB_USER = "monuser"; .\scripts\docker-build-push.bat build
  exit /b 1
)

if "%TAG%"=="" set TAG=latest
set IMAGE=%DOCKERHUB_USER%/taskmaster:%TAG%

set CA_FILE=
if defined CORPORATE_CA_CERT_FILE (
  if exist "!CORPORATE_CA_CERT_FILE!" set CA_FILE=!CORPORATE_CA_CERT_FILE!
)
if "!CA_FILE!"=="" if defined CORPORATE_CA_CERT (
  for /f "tokens=1" %%a in ("!CORPORATE_CA_CERT!") do (
    if exist "%%a" set CA_FILE=%%a
  )
)

echo Build image: !IMAGE!
if defined CA_FILE (
  echo Using CA cert for build: !CA_FILE!
  set DOCKER_BUILDKIT=1
  docker build --secret id=ca_cert,src="!CA_FILE!" -t "!IMAGE!" -f Dockerfile .
) else (
  docker compose -f docker-compose.dockerhub.yml build
)

if "%ACTION%"=="push" (
  echo Push vers Docker Hub...
  echo Astuce: en cas d'erreur d'auth, executez: docker login
  docker compose -f docker-compose.dockerhub.yml push
  echo Termine.
)

endlocal
