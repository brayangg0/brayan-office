# 🚀 Sequências - Quickstart Visual

## Exemplo Prático: "Boas-vindas para Novo Aluno"

### Cenário
Você quer que quando alguém novo se matricule, uma sequência de boas-vindas seja enviada automaticamente às 09:00 da manhã.

### Passo a Passo Visual

#### 1️⃣ Acessar Sequências
```
Navegação Lateral → Clique em "Sequências" (ícone ➤)
```

#### 2️⃣ Criar Nova Sequência
```
Botão "+ Criar Sequência" (canto superior direito)
```

#### 3️⃣ Preencher Form Básico
```
┌─────────────────────────────────────────┐
│ Nome da sequência *                     │
│ Boas-vindas - Novo Aluno               │
├─────────────────────────────────────────┤
│ Descrição (opcional)                    │
│ Sequência enviada quando aluno entra    │
├─────────────────────────────────────────┤
│ Data * (DD/MM/YYYY)                    │
│ 01/04/2026                              │
├─────────────────────────────────────────┤
│ Hora * (HH:MM)                          │
│ 09:00                                   │
├─────────────────────────────────────────┤
│ Tipo de Destinatário *                  │
│ ▼ Contato Específico                   │
│   - Contato Específico                  │
│   - Grupo Específico                    │
│   - Todos                               │
│   - Com Tag                             │
│   - Todos os Alunos                     │
└─────────────────────────────────────────┘
```

#### 4️⃣ Selecionar Destinatário
```
Tipo: "Contato Específico"
Selecione um contato: ▼ João Silva (11988884444)
```

#### 5️⃣ Construir Sequência de Mensagens

**Mensagem 1: Imagem + Legenda**
```
┌────────────────────────────────────────────┐
│ Mensagem 1 de 3                      ❌    │
├────────────────────────────────────────────┤
│ Tipo: 🖼️ Imagem                            │
├────────────────────────────────────────────┤
│ Arquivo: [Escolher arquivo]                │
│         ✓ logo_curso.jpg (245KB)          │
├────────────────────────────────────────────┤
│ Legenda:                                   │
│ Bem-vindo ao seu novo curso! 🎉           │
├────────────────────────────────────────────┤
│ Delay antes (ms): 2000                     │
│                  (Aguarda 2 segundos       │
│                   antes de enviar           │
│                   próxima mensagem)        │
└────────────────────────────────────────────┘
```

**Mensagem 2: Texto**
```
┌────────────────────────────────────────────┐
│ Mensagem 2 de 3                      ❌    │
├────────────────────────────────────────────┤
│ Tipo: 📄 Texto                             │
├────────────────────────────────────────────┤
│ Mensagem:                                  │
│ Este é um curso 100% online com:          │
│ ✅ Acesso vitalício                       │
│ ✅ Certificado ao final                   │
│ ✅ Suporte exclusivo no grupo             │
│                                           │
│ Você tem acesso a todo material desde     │
│ agora! O login é: seu@email.com           │
├────────────────────────────────────────────┤
│ Delay antes (ms): 3000                     │
│                  (Aguarda 3 segundos)      │
└────────────────────────────────────────────┘
```

**Mensagem 3: Áudio**
```
┌────────────────────────────────────────────┐
│ Mensagem 3 de 3                      ❌    │
├────────────────────────────────────────────┤
│ Tipo: 🎵 Áudio                             │
├────────────────────────────────────────────┤
│ Arquivo: [Escolher arquivo]                │
│         ✓ mensagem_boas_vindas.mp3        │
├────────────────────────────────────────────┤
│ Legenda:                                   │
│ Uma mensagem especial para você!           │
├────────────────────────────────────────────┤
│ Delay antes (ms): 1000                     │
└────────────────────────────────────────────┘
```

#### 6️⃣ Adicionar Mais Mensagens (Opcional)
```
Clique "+ Adicionar Mensagem" para adicionar mais
```

#### 7️⃣ Confirmar Criação
```
Botão "✅ Criar Sequência"
```

#### 8️⃣ Ver na Lista
```
ANTES DE ENVIAR (⏳ Agendada):
┌────────────────────────────────────────────┐
│ Boas-vindas - Novo Aluno                  │
│ Status: ⏳ Agendada                       │
│ Mensagens: 3                               │
│ Agendada: 01/04/2026 09:00                │
│                                            │
│ [👁️ Ver Detalhes] [🚀 Enviar Agora]      │
│ [🗑️ Deletar]                              │
└────────────────────────────────────────────┘
```

#### 9️⃣ Resultado no WhatsApp

**Timeline de Envio:**
```
09:00:00 - ✅ Imagem recebida
          "Bem-vindo ao seu novo curso! 🎉"

09:00:02 - ✅ Mensagem de texto recebida
          "Este é um curso 100% online com:
           ✅ Acesso vitalício
           ..."

09:00:05 - ✅ Áudio recebido
          "Uma mensagem especial para você!"
          🎵 [play]
```

#### 🔟 Depois que Envia
```
APÓS CONCLUSÃO (✅ Concluída):
┌────────────────────────────────────────────┐
│ Boas-vindas - Novo Aluno                  │
│ Status: ✅ Concluída                      │
│ Mensagens: 3                               │
│ Agendada: 01/04/2026 09:00                │
│                                            │
│ ✅ 1 enviada | ❌ 0 falhadas              │
│                                            │
│ [👁️ Ver Detalhes] [🚀 Enviar Agora]      │
│ [🗑️ Deletar]                              │
└────────────────────────────────────────────┘
```

---

## Exemplo 2: Enviar Agora (Sem Agendar)

### Situação
Você criou uma sequência. Pode enviar:

**Opção A: Deixar agendada**
- Sistema envia automaticamente no horário

**Opção B: Enviar agora**
```
Na lista de sequências:
┌────────────────────────────────────────────┐
│ Sua Sequência                              │
│ ...                                        │
│ [🚀 Enviar Agora] ← Clica aqui            │
└────────────────────────────────────────────┘

↓

Loading... ⏳
"Enviando 1 destinatário..."

↓

✅ "Sequência enviada com sucesso!"
```

---

## Exemplo 3: Ver Detalhes

```
Clique [👁️ Ver Detalhes]

┌──────────────────────────────────────┐
│        Boas-vindas - Novo Aluno      │
├──────────────────────────────────────┤
│                                      │
│📄 Mensagem 1 - 🖼️ image             │
│ Legenda: Bem-vindo ao seu novo...    │
│ ⏱️ Delay: 2000ms                     │
│                                      │
│📄 Mensagem 2 - 📄 text              │
│ "Este é um curso 100% online com..." │
│ ⏱️ Delay: 3000ms                     │
│                                      │
│📄 Mensagem 3 - 🎵 audio             │
│ Legenda: Uma mensagem especial...    │
│ ⏱️ Delay: 1000ms                     │
│                                      │
│                                      │
│          [Fechar]                    │
└──────────────────────────────────────┘
```

---

## Exemplo 4: Tipos de Destinatários

### Tipo: Contato Específico
```
Enviar para: João Silva (11988884444)
Resultado: Apenas João recebe
```

### Tipo: Grupo Específico
```
Enviar para: Turma 2026-01
Resultado: Todos do grupo recebem
```

### Tipo: Todos
```
Resultado: Todos os contatos + todos os grupos
```

### Tipo: Com Tag
```
Enviar para contatos com tag: "premium"
Resultado: Apenas contatos marcados como "premium"
```

### Tipo: Todos os Alunos
```
Resultado: Apenas contatos que são alunos (têm registro em Student)
```

---

## Tipos de Mensagem

### 📄 Texto
- Simples, sem arquivo
- Máximo ~4000 caracteres
- Suporta quebras de linha

### 🖼️ Imagem
- Formatos: JPEG, PNG, GIF, WebP
- Máximo: 64MB
- Com legenda opcional (aparece abaixo da imagem)

### 🎵 Áudio
- Formatos: MP3, WAV, OGG, AAC, M4A
- Máximo: 64MB
- Legenda aparece como "mensagem" acima do áudio

### 🎬 Vídeo
- Formatos: MP4, WebM, OGG, MPEG
- Máximo: 64MB
- Legenda opcional

### 📎 Documento
- Formatos: PDF, DOC, DOCX
- Máximo: 64MB
- Legenda opcional

---

## Dicas Práticas

### ⏱️ Delays Recomendados

```
Entre leitura e próxima:       2-3 segundos (2000-3000ms)
Antes de vídeo/áudio:         3-5 segundos (3000-5000ms)
Sequência rápida:             1-2 segundos (1000-2000ms)
Deixar tempo de interação:    5+ segundos (5000ms+)
```

### 📊 Estrutura Boa

```
1️⃣ Imagem + legenda atrativa
   (Pega atenção)

2️⃣ Texto com informação
   (Explica claramente)

3️⃣ Áudio ou descrição
   (Reforça mensagem)

4️⃣ Chamada para ação
   (Clique aqui, acesse link, etc)
```

### ❌ O Que Evitar

```
❌ Mais de 5 mensagens
❌ Delays muito curtos (< 1s)
❌ Textos muito longos (quebrar em 2-3 mensagens)
❌ Muitos arquivos pesados seguidos
❌ Enviar entre 22:00 - 07:00 (pessoa dormindo)
```

---

## Troubleshooting Visual

### "Nada aparece após clicar 'Criar'"
```
❓ O backend pode estar lento
✅ Espere 5 segundos
✅ Recarregue a página (F5)
✅ Verifique se backend está rodando
   http://localhost:3333/api/health deve retornar {"status":"ok"}
```

### "Erro: Arquivo não encontrado"
```
❌ Arquivo não foi salvo corretamente
✅ Tente fazer upload novamente
✅ Verifique: Arquivo < 64MB
✅ Formato correto (JPEG/PNG para imagem, etc)
```

### "WhatsApp não está conectado (vermelho)"
```
❌ QR Code não foi lido
✅ Vá para WhatsApp (no menu)
✅ Leia o QR Code
✅ Aguarde "Conectado" (verde)
✅ Tente enviar sequência de novo
```

### "Sequência foi criada mas não enviou"
```
❓ Pode ser um dos problemas:
✅ Servidor foi desligado no horário → Reinicie
✅ Contato não existe → Verifique em "Contatos"
✅ Arquivo foi deletado → Crie nova sequência
✅ Problema de conexão WhatsApp → Reconecte
```

---

## ✨ Dicas Avançadas

### Criar Sequência de Acompanhamento
```
Msg 1: Obrigado por se cadastrar! 🙏
       (delay: 1000ms)

Msg 2: Seus dados foram salvos
       (delay: 2000ms)

Msg 3: Link para começar: https://...
       (delay: 3000ms)

Msg 4: Qualquer dúvida, fale conosco!
       (delay: 1000ms)
```

### Criar Sequência de Venda
```
Msg 1: 🖼️ Imagem do produto
Msg 2: 📄 Descrição completa
Msg 3: 🎬 Vídeo de demonstração
Msg 4: 📄 Preço e oferta
Msg 5: 🎵 Depoimento de cliente
```

### Criar Sequência de Suporte
```
Msg 1: Recebemos seu contato ✅
Msg 2: 🖼️ Guia de soluções rápidas
Msg 3: 📄 Tutorial passo-a-passo
Msg 4: 📎 Documentação completa
```

---

**Última atualização: 01/04/2026** ✅  
**Testado e Pronto para Usar** 🚀
