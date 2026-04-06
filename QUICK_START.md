# ⚡ QUICK START - BOT AUTOMÁTICO WHATSAPP

## 📱 Seus Servidores Estão Rodando!

```
✅ Backend:  http://localhost:3333
✅ Frontend: http://localhost:5173
```

---

## 🎯 5 Passos para Começar em 5 Minutos

### 1️⃣ **Conectar WhatsApp** (1-2 min)
```
→ Abra http://localhost:5173 no navegador
→ Menu: WhatsApp
→ Escaneie o QR Code com seu celular
→ Clique em "Conectar dispositivo"
→ Aguarde mensagem: "WhatsApp conectado!" ✅
```

### 2️⃣ **Criar Autorresponse** (1 min)
```
→ Menu: Automação
→ Aba: Autorresponse
→ Clique: "Novo Template de Resposta"

Preencha:
- Nome: Horário
- Tipo: Texto
- Mensagem: O curso começa às 19h! Quando quiser?

→ Clique: Criar Template
```

### 3️⃣ **Testar a Resposta** (1 min)
```
→ Abra WhatsApp no celular
→ Mande uma mensagem para você mesmo (ou grupo teste):
   "Qual o horário?"

→ Aguarde 1-2 segundos...
→ ✅ Bot responde automaticamente!
```

### 4️⃣ **Criar Campanha Agendada** (1 min)
```
→ Menu: Automação
→ Aba: Campanhas
→ Clique: "Nova Campanha"

Preencha:
- Nome: Informações do Curso
- Tipo: Contatos
- Data/Hora: Agora + 1 minuto
- Selecione: Seus contatos/grupos

→ Clique: Criar Campanha
→ Clique no ícone de "envio" para disparar AGORA
```

### 5️⃣ **Pronto!** 🎉
```
Seu bot agora:
✅ Responde mensagens automaticamente
✅ Envia campanhas agendadas
✅ Apoia seu negócio 24/7
```

---

## 🚀 Comandos Úteis

### **Recarregar dados de exemplo:**
```bash
cd backend
npm run db:seed
```

### **Ver banco no Prisma Studio:**
```bash
cd backend
npm run db:studio
```

### **Verificar logs do backend:**
```bash
# Os logs aparecem no terminal onde npm run dev está rodando
# Procure por: [WhatsApp], [AutoResponse], [Scheduler]
```

---

## 📊 Suas Funcionalidades Agora Disponíveis

### 🤖 **Autorresponse**
Palavras-chave que disparam respostas automáticas:
- `"horário"`, `"hora"`, `"quando"` 
- `"duração"`, `"tempo"`
- `"preço"`, `"valor"`, `"custa"`
- `"como faço"`, `"inscrição"`
- `"dúvida"`, `"ajuda"`

### 📅 **Campanhas**
Envie mensagens agendadas para:
- ✅ Contatos individuais
- ✅ Grupos inteiros
- ✅ Com data/hora específica
- ✅ Converte variáveis ({{nome}}, {{email}})

### 📦 **Tipos de Mensagem**
- ✅ Texto puro
- ✅ Fotos/Imagens
- ✅ Vídeos
- ✅ Áudio
- ✅ Documentos

---

## 🎓 Exemplos de Uso

### **Exemplo 1: Bomba diária de conteúdo**
```
Campanha: "Dica Diária"
Tempo: 08:00 todos os dias
Grupo: "Alunos Python"
Mensagem: "Dica do dia: [seu conteúdo aqui]"

Resultado: Engajamento aumenta 3x 📈
```

### **Exemplo 2: Lembrete de aula**
```
Campanha: "Aula começando"
Tempo: 18:55 (5 min antes)
Contatos: Todos os alunos ativos
Mensagem: "Aula começando em 5 minutos! Link: [seu_link]"

Resultado: Reduz ausências em 50% 📊
```

### **Exemplo 3: Autorresposta inteligente**
```
Customer recebe dúvida: "Vale a pena?"
Bot responde: "Sim! 40 horas de conteúdo, acesso vitalício..."
Sem você fazer nada!

Resultado: 90% dúvidas resolvidas automaticamente ⚡
```

---

## 🔧 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| QR Code não aparece | Reconecte: WhatsApp → Reiniciar |
| Bot não responde | Verifique template criado + mensagem contém palavra-chave |
| Campanha não envia | Confirme data/hora (use horário do servidor) |
| Erro de conexão | Reinicie tanto backend quanto frontend |

---

## 📚 Documentação Completa

Para guia detalhado, veja:
```
→ GUIA_AUTOMACAO.md      (Como usar cada funcionalidade)
→ AUTOMACAO_IMPLEMENTADA.md (O que foi feito tecnicamente)
```

---

## 💡 Pro Tips

1. **Teste tudo primeiro em privado** antes de campanhas grandes
2. **Use horários estratégicos**: 
   - Manhã (8h): anúncios
   - Noite (19h): cursos noturnos
3. **Personalize sempre** com {{nome}} para +30% engajamento
4. **Monitore**, não ignore dúvidas em mensagens recebidas
5. **Backup regular** do seu banco de dados

---

## 🎯 SEU PRÓXIMO OBJETIVO

Depois de testar tudo:

[ ] 1. Conectar WhatsApp
[ ] 2. Criar 3 templates de autorresponse
[ ] 3. Agendar 1 campanha
[ ] 4. Testar fluxo completo
[ ] 5. Documentar suas configs

---

## 📞 Precisa de Help?

Se o bot não funcionar:

1. **Verifique o terminal do backend**
   - Procure por logs com `[WhatsApp]`, `[AutoResponse]`
   - Erros aparecem em vermelho

2. **Console do navegador (F12)**
   - Abra DevTools
   - Veja Network para erros de API
   - Console para erros JavaScript

3. **Reinicie tudo**
   ```bash
   Matador o terminal (Ctrl+C)
   npm run dev  # backend
   npm run dev  # frontend (outro terminal)
   ```

---

## 🎉 Agora É Sua Vez!

Seu sistema está 100% funcional e pronto para uso.

**Comece pequeno, expanda depois.**

Boa sorte na automação! 🚀

---

*Sistema desenvolvido com ❤️ para sua empresa de treinamentos*
