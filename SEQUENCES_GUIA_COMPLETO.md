# 📨 Sequências de Mensagens - Guia Completo

## ✨ Novo Recurso: Enviar Múltiplas Mensagens em Sequência com Horário Agendado

Agora você pode criar e agendar sequências de mensagens que serão enviadas automaticamente! Envie uma imagem, depois um texto, depois um áudio - tudo em ordem e no horário que você escolher.

## 🎯 Casos de Uso

1. **Boas-vindas em Sequência**
   - Enviar imagem de boas-vindas → esperar 2 segundos → enviar mensagem de texto → esperar 3 segundos → enviar áudio com instruções

2. **Campanhas de Venda**
   - Imagem do produto → Descrição texto → Vídeo demonstração → Mensagem de oferta

3. **Suporte Automático**
   - Enviar formulário em texto → Imagem com passo a passo → Documento com manual

4. **Notificações Programadas**
   - Enviar lembretes em sequência para alunos em horários específicos

## 🚀 Como Usar

### 1. Acessar Página de Sequências
- No menu lateral, clique em **"Sequências"** (ícone de envio ➤)
- Será aberta a tela de gerenciamento

### 2. Criar Nova Sequência
1. Clique em **"+ Criar Sequência"**
2. Preencha os campos:
   - **Nome**: Dar um nome descritivo (ex: "Boas-vindas Alunos")
   - **Descrição**: Detalhe do que é a sequência (opcional)
   - **Data**: Quando enviar
   - **Hora**: A que horas enviar (no horário do seu WhatsApp)

### 3. Configurar Destinatários
- **Tipo de Alvo**:
  - `Contato Específico`: Uma pessoa em particular
  - `Grupo Específico`: Um grupo do WhatsApp
  - `Todos`: Enviar para todos os contatos + grupos
  - `Com Tag`: Enviar para contatos com uma tag específica
  - `Todos os Alunos`: Apenas para alunos cadastrados

### 4. Adicionar Mensagens
1. Clique em **"+ Adicionar Mensagem"** para cada mensagem
2. Para cada mensagem, configure:

   **Tipo de Mensagem:**
   - 📄 **Texto**: Mensagem simples
   - 🖼️ **Imagem**: JPEG, PNG, GIF (máx 64MB)
   - 🎵 **Áudio**: MP3, WAV, OGG (máx 64MB)
   - 🎬 **Vídeo**: MP4, WEBM (máx 64MB)
   - 📎 **Documento**: PDF, DOCX (máx 64MB)

   **Delay Antes**: Tempo de espera (ms) antes de enviar esta mensagem
   - 1000ms = 1 segundo
   - 2000ms = 2 segundos
   - 5000ms = 5 segundos

### 5. Exemplo de Sequência

```
Mensagem 1: 🖼️ Imagem
  - Arquivo: logo.png
  - Legenda: "Bem-vindo ao nosso curso!"
  - Delay: 2000ms

Mensagem 2: 📄 Texto
  - Texto: "Este curso é 100% online e você tem acesso vitalício!"
  - Delay: 3000ms

Mensagem 3: 🎵 Áudio
  - Arquivo: instrucoes.mp3
  - Legenda: "Clique no link abaixo para começar"
  - Delay: 2000ms
```

**Resultado**: Pessoa recebe a imagem → espera 2s → recebe texto → espera 3s → recebe áudio

### 6. Confirmar e Agendar
1. Clique em **"✅ Criar Sequência"**
2. Sistema agendará automaticamente para o horário especificado
3. Você verá a sequência na lista com status ⏳ "Agendada"

## ⏱️ Gerenciar Sequências

### Ver Status
Na lista, você vê:
- ⏳ **Agendada**: Aguardando horário para enviar
- 🚀 **Em progresso**: Estando sendo enviada agora
- ✅ **Concluída**: Enviada com sucesso para todos
- ❌ **Cancelada**: Cancelada antes do horário

### Enviar Agora (Antes do Horário)
1. Localize a sequência na lista
2. Clique no botão 🚀 **"Enviar Agora"**
3. Será enviada imediatamente para todos os destinatários

### Ver Detalhes
1. Clique em 👁️ **"Ver Detalhes"**
2. Aparecerá um modal mostrando:
   - Todas as mensagens da sequência
   - Tipo de cada mensagem
   - Delays configurados
   - Legenda/conteúdo

### Deletar Sequência
1. Clique em 🗑️ **"Deletar"**
2. Confirme a exclusão
3. Sequência será removida (mesmo se ainda não foi enviada)

## 📊 Estatísticas

Após a sequência ser concluída, você vê:
- ✅ Número de destinatários que receberam
- ❌ Número que falharam (problemas de envio)

## ⚠️ Importantes

### Requisitos
- ✅ WhatsApp deve estar **conectado** (QR code já lido)
- ✅ Destinatários devem estar salvos no banco de dados
- ✅ Arquivos de mídia não devem exceder 64MB

### Timing
- Os delays são **entre cada mensagem**, não antes da primeira
- Se você colocar 2000ms (2 segundos), aguardará 2 segundos após enviar a mensagem anterior
- O delay mínimo recomendado é 1000ms (1 segundo) para evitar bloqueios do WhatsApp

### Horários
- Use horários da sua zona de tempo (seu computador)
- Se agendar para um horário passado, enviará imediatamente
- O servidor precisa estar rodando quando chegar o horário

### Arquivos
- Imagens: JPEG, PNG, GIF, WebP
- Áudio: MP3, WAV, OGG, AAC, M4A
- Vídeo: MP4, WebM, OGG, MPEG
- Documentos: PDF, DOC, DOCX

## 🔧 API Endpoints

Se preferir usar a API diretamente:

### Criar Sequência
```bash
POST /api/sequences
{
  "name": "Minha Sequência",
  "description": "Descrição opcional",
  "targetType": "contact",
  "targetId": "id_do_contato",
  "scheduledAt": "2026-04-01T14:30:00Z",
  "messages": [
    {
      "type": "text",
      "body": "Olá!",
      "delayBefore": 2000
    },
    {
      "type": "image",
      "mediaPath": "uploads/media/uuid.png",
      "caption": "Minha imagem",
      "delayBefore": 3000
    }
  ]
}
```

### Listar Sequências
```bash
GET /api/sequences?status=pending&page=1&limit=20
```

### Enviar Agora
```bash
POST /api/sequences/{id}/send
```

### Cancelar
```bash
POST /api/sequences/{id}/cancel
```

### Deletar
```bash
DELETE /api/sequences/{id}
```

## 💡 Dicas e Macetes

1. **Reuse Sequências**: Copie uma sequência criando com os mesmos valores
2. **Teste Primeiro**: Envie para você mesmo antes de enviar para muitos
3. **Delay Estratégico**: Use delays maiores (3-5s) para dar tempo de ler/assistir
4. **Fácil Leitura**: Use mensagens curtas e diretas
5. **Hora Certa**: Agende para horário que seu aluno provavelmente estiver disponível

## ❓ Troubleshooting

**Problema**: "Sequência enviada mas ninguém recebeu"
- ✅ Verificar se WhatsApp está conectado (deve estar verde)
- ✅ Verificar se contatos/grupos existem no banco
- ✅ Ver logs do backend para detalhes do erro

**Problema**: "Arquivo não encontrado"
- ✅ Reuploade o arquivo
- ✅ Certifique-se que é um formato aceito
- ✅ Verifique tamanho (máximo 64MB)

**Problema**: "Horário passou e não enviou"
- ✅ Servidor precisa estar rodando no horário agendado
- ✅ Se agendar atrasado, clique "Enviar Agora"

**Problema**: "Delay não funciona"
- ✅ Delay é em milissegundos (1000 = 1 segundo)
- ✅ Delay funciona com WhatsApp real, não será mais rápido
- ✅ Mínimo recomendado: 1000ms para evitar bloqueios

## 📝 Notas

- Sequências são criadas no servidor e podem levar alguns segundos para aparecer na lista
- Sempre faça um teste com um contato de teste antes de enviar para muitos
- Horários são sempre em sua zona de tempo local
- Se tiver perguntas, o dashboard mostra log de erros em tempo real

---

**Versão**: 1.0  
**Data**: Abril 2026  
**Status**: ✅ Completo e Testado
