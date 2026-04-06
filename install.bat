@echo off
echo ================================================
echo   Instalacao do CRM WhatsApp
echo ================================================
echo.

echo [1/4] Verificando Node.js...
node --version
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado. Instale em https://nodejs.org
    pause
    exit /b 1
)

echo [2/4] Instalando dependencias do backend...
cd backend
call npm install
if errorlevel 1 ( echo ERRO ao instalar backend & pause & exit /b 1 )
cd ..

echo [3/4] Instalando dependencias do frontend...
cd frontend
call npm install
if errorlevel 1 ( echo ERRO ao instalar frontend & pause & exit /b 1 )
cd ..

echo [4/4] Configurando banco de dados...
cd backend
call npx prisma generate
call npx prisma db push
cd ..

echo.
echo ================================================
echo   Instalacao concluida com sucesso!
echo ================================================
echo.
echo  Para iniciar: execute start.bat
echo  Acesso: http://localhost:5173
echo.
pause
