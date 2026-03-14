@echo off
echo =======================================
echo Taskmaster - Script de Mise a Jour
echo =======================================

echo.
echo [1/5] Recuperation des dernieres modifications (git pull)...
git pull

echo.
echo [2/5] Mise a jour des dependances a la racine...
call npm install

echo.
echo [3/5] Mise a jour du Backend...
cd backend
call npm install
echo  - Generation Prisma et application des migrations...
call npx prisma generate
call npx prisma migrate dev
cd ..

echo.
echo [4/5] Mise a jour du Frontend...
cd frontend
call npm install
cd ..

echo.
echo =======================================
echo Mise a jour terminee avec succes !
echo Vous pouvez maintenant lancer l'application avec : npm run dev
echo =======================================
pause
