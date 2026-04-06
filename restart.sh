#!/bin/bash
# Script para otimizar e reiniciar o WhatsApp bot

echo "🚀 Otimizando WhatsApp Bot..."

# Kill processos anteriores
pkill -f "npm run dev" || true
sleep 2

# Limpar cache
echo "🧹 Limpando cache..."
cd backend
rm -rf .wwebjs_auth/session-*
rm -f dev.db
cd ..

# Reiniciar
echo "🔄 Reiniciando servidor..."
cd backend
npm run dev &
BACKEND_PID=$!

sleep 5

cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Servidores iniciados!"
echo "   Backend:  http://localhost:3333"
echo "   Frontend: http://localhost:5173"
echo ""
echo "📝 Dica: Se o QR ainda for lento:"
echo "   1. Feche o navegador completamente"
echo "   2. Reinicie os servidores"
echo "   3. Espere 15-30 segundos antes de acessar"
echo ""

wait $BACKEND_PID $FRONTEND_PID
