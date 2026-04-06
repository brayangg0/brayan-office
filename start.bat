@echo off
echo ================================================
echo   CRM WhatsApp - Sistema de Treinamentos
echo ================================================
echo.

:: Verifica se node_modules do backend existe
if not exist "backend\node_modules" (
    echo [1/4] Instalando dependencias do backend...
    cd backend
    call npm install
    cd ..
) else (
    echo [1/4] Backend: dependencias ja instaladas
)

:: Verifica se node_modules do frontend existe
if not exist "frontend\node_modules" (
    echo [2/4] Instalando dependencias do frontend...
    cd frontend
    call npm install
    cd ..
) else (
    echo [2/4] Frontend: dependencias ja instaladas
)

:: Gera o Prisma Client e cria o banco
echo [3/4] Configurando banco de dados...
cd backend
call npx prisma generate
call npx prisma db push --skip-generate
cd ..

echo [4/4] Iniciando servidores...
echo.
echo  Backend:  http://localhost:3333
echo  Frontend: http://localhost:5173
echo.

:: Inicia backend e frontend em paralelo
start "Backend CRM" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak > nul
start "Frontend CRM" cmd /k "cd frontend && npm run dev"

echo Servidores iniciados! Acesse http://localhost:5173
pause
