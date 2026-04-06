# 🤖 Guia Completo - Automação WhatsApp Bot

## 📋 O que foi implementado

### 1. **Autorresponse (Chat Automático)**
- Responde automaticamente mensagens baseado em palavras-chave
- Suporta templates com variáveis ({{nome}}, {{email}}, {{phone}})
- Múltiplos tipos de resposta: texto, imagem, áudio, vídeo
- Sem limite de respostas simultâneas

### 2. **Campanhas Agendadas**
- Envie mensagens para grupos e contatos em data/hora específica
- Suporte a listas de destino (contatos, grupos, ou combinado)
- Rastreamento de entrega
- Intervalo de envio configurável para evitar bloqueio

### 3. **Mensagens Recorrentes**
- Agende mensagens com expressão cron
- Envie avisos diários, semanais, etc
- Ideais para lembretes de aulas, promoções recorrentes

### 4. **Envio de Mídia**
- ✅ Texto
- ✅ Fotos/imagens
- ✅ Vídeos
- ✅ Áudio
- ✅ Documentos

---

## 🚀 Como Usar

### Passo 1: Conectar WhatsApp

1. Acesse **WhatsApp** no menu lateral
2. Escaneie o QR Code com seu WhatsApp normal ou Business
3. Após conectar, você verá "Conectado" ✅

### Passo 2: Criar Templates de Autorresponse

1. Vá em **Automação** → **Autorresponse**
2. Clique em **"Novo Template de Resposta"**
3. Configure:
   - **Nome**: "Horário do Curso"
   - **Tipo**: Texto
   - **Resposta**: `Olá {{nome}}!\nO curso começa às 19h.\nAlguma dúvida?`
4. Clique em **"Criar Template"**

**Palavras-chave que ativam:**
- `"horário"`, `"hora"`, `"quando"` → Horário do Curso
- `"duração"`, `"quanto tempo"` → Duração
- `"preço"`, `"valor"`, `"custa"` → Preço
- `"como faço"`, `"inscrição"` → Como se inscrever
- `"dúvida"`, `"ajuda"` → Oferece suporte

### Passo 3: Criar Campanhas Agendadas

1. Vá em **Automação** → **Campanhas**
2. Preencha:
   - **Nome**: "Novo Curso - Grupo Anúncio"
   - **Tipo de destino**: "Grupos"
   - **Data/Hora**: Quando você quer enviar
   - **Selecione os grupos**: Marque os grupos desejados
3. Clique em **"Criar Campanha"**
4. Depois de criar, clique no ícone de **envio** para disparar agora

### Passo 4: Setup de Automação Completa

**Exemplo: Automação para Novos Alunos**

```
1. Novo aluno se inscreve
2. Bot envia "Bem-vindo! Qual sua dúvida?" (Autorresponse)
3. Aluno pergunta "Quando começa?"
4. Bot responde com horário (Autorresponse)
5. Campanha agendada enviada 1h antes da aula
6. Cron diário para enviar dica do dia
```

---

## 📊 Exemplos Práticos

### Exemplo 1: Bomba Diária de Notícias

**Setup:**
- Crie um template com as notícias diárias
- Crie una campanha recorrente para **todos os dias às 08h**
- Destino: Todos os contatos ativos

**Resultado:** Seus alunos recebem notícias todo dia no mesmo horário

### Exemplo 2: Lembrete de Aula

**Setup:**
- Crie campanha agendada 1 hora antes da aula
- Destino: Alunos do módulo "Python Avançado"
- Mensagem: "Aula começando em 1 hora! Link: [seu_link]"

**Resultado:** Reduz ausências em aulas online

### Exemplo 3: Autorresposta Inteligente

**Setup:**
1. Template "Preço":
   ```
   Oi {{nome}}!
   Nossos cursos começam em R$ 99,90
   Quer saber mais?
   ```

2. Template "Duração":
   ```
   Cada curso tem 40 horas
   Você faz no seu tempo! ⏰
   ```

**Resultado:** 90% das dúvidas resolvidas automaticamente

### Exemplo 4: Automação de Certificados

**Setup:**
- Ao aluno completar curso (status muda em Alunos)
- Campanha é disparada automaticamente
- Envia PDF do certificado + foto de parabéns

---

## ⚙️ APIs Disponíveis

### Autorresponse
```bash
POST /api/automation/autoresponse/template
GET /api/automation/autoresponse/templates
DELETE /api/automation/autoresponse/template/:id
```

### Campanhas
```bash
GET /api/automation/campaigns
POST /api/automation/campaigns
POST /api/automation/campaigns/:id/send
DELETE /api/automation/campaigns/:id
```

### Mensagens Agendadas
```bash
GET /api/automation/scheduled-messages
POST /api/automation/scheduled-messages
POST /api/automation/scheduled-messages/:id/cancel
```

---

## 🔍 Troubleshooting

**Q: O bot não está respondendo minhas mensagens**
- Verifique se WhatsApp está conectado (ícone verde)
- Confirme que o template foi criado
- Tente usar uma das palavras-chave sugeridas

**Q: Não consigo enviar para um grupo**
- Grupo precisa estar sincronizado (clique "Sincronizar Grupos")
- Você precisa ser membro do grupo
- O bot precisa ser membro também

**Q: Campanhas não estão saindo no horário**
- Confirme data/hora correta (servidor usa UTC)
- Backend precisa estar rodando
- Sem relatório de erro = problema de configuração

**Q: Como saber se mensagem foi entregue?**
- Veja em **Mensagens** o histórico
- Status: "sent" = enviada, "delivered" = entregue, "read" = lida

---

## 📈 Próximas Funcionalidades

- [ ] Dashboard de analytics (quantas mensagens entregues, taxa de leitura)
- [ ] Criar bot com IA (ChatGPT) para respostas mais inteligentes
- [ ] Webhooks para integrar com sistemas externos
- [ ] A/B testing de mensagens
- [ ] Segmentação avançada por comportamento

---

## 💡 Dicas Profissionais

1. **Use templates curtos**: Mensagens longas perdem engagement
2. **Teste primeiro em privado**: Mande para si mesmo antes de campanhas grandes
3. **Horários estratégicos**: 
   - 19h-20h: melhor para cursos noturnos
   - 08h-09h: melhor para anúncios matinais
4. **Personalize sempre**: Use {{nome}} para aumentar engajamento
5. **Monitore respostas**: Leia o histórico de mensagens para melhorar

---

**Desenvolvido com ❤️ para sua empresa de treinamentos**
