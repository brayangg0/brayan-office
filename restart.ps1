# Script para otimizar e reiniciar WhatsApp Bot no Windows
# Executar como: powershell -ExecutionPolicy Bypass -File restart.ps1

Write-Host "`n🚀 Otimizando WhatsApp Bot..." -ForegroundColor Cyan

# Matar processos node anteriores
Write-Host "🧹 Parando servidores anteriores..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Limpar cache WhatsApp
Write-Host "🗑️  Limpando cache..." -ForegroundColor Yellow
$sessionPath = "backend\.wwebjs_auth"
if (Test-Path $sessionPath) {
    Remove-Item $sessionPath -Recurse -Force
    Write-Host "   ✅ Cache WhatsApp limpo"
}

# Iniciar backend
Write-Host "`n🔧 Iniciando backend..." -ForegroundColor Cyan
$backendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd backend && npm run dev" -WindowStyle Normal -PassThru
Write-Host "   ✅ Backend iniciado (PID: $($backendProc.Id))"

# Aguardar um pouco
Start-Sleep -Seconds 5

# Iniciar frontend
Write-Host "`n🎨 Iniciando frontend..." -ForegroundColor Cyan
$frontendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd frontend && npm run dev" -WindowStyle Normal -PassThru
Write-Host "   ✅ Frontend iniciado (PID: $($frontendProc.Id))"

Write-Host "`n" -ForegroundColor Green
Write-Host "✅ Servidores iniciados com sucesso!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "📱 Frontend:  http://localhost:5173" -ForegroundColor Green
Write-Host "🔧 Backend:   http://localhost:3333" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

Write-Host "`n💡 Próximos passos:" -ForegroundColor Yellow
Write-Host "   1. Abra http://localhost:5173 no navegador"
Write-Host "   2. Vá em 'WhatsApp' no menu"
Write-Host "   3. Aguarde o QR Code aparecer (15-30 segundos)"
Write-Host "   4. Escaneie com seu celular"

Write-Host "`n⏳ Se o QR for lento:" -ForegroundColor Yellow
Write-Host "   • Primeiro uso é sempre mais lento (Puppeteer instala Chrome)"
Write-Host "   • Feche completamente o navegador e reabra"
Write-Host "   • Próximas vezes será mais rápido (5-10 segundos)"
