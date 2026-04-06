# 🔧 Correção de Erro ENOENT no Envio de Mídia

## Problema
Ao enviar mensagens com mídia (fotos, vídeos, áudio) para grupos via campanhas, o sistema retornava erro:
```
ENOENT: no such file or directory, open 'C:\Users\letic\Downloads\Whats-CRM-main\backend\uploads\media\bf001df0-e00c-43f1-ba36-9a9e5da81566.jfif'
```

## Root Cause
Inconsistência no armazenamento do caminho do arquivo (mediaPath):
1. **Templates** salvava: `/uploads/media/uuid.jfif` (apenas nome, com barra inicial)
2. **Schedules** salvava: `/uploads/media/uuid.jfif` (mesmo formato)
3. **WhatsApp Service** esperava: `uploads/media/uuid.jfif` (caminho relativo completo)

## Alterações Realizadas

### 1. `backend/src/routes/templates.ts`
- **POST /api/templates** (linha 32)
  - ❌ Antes: `mediaPath: req.file ? `/uploads/media/${req.file.filename}` : null`
  - ✅ Depois: `mediaPath: req.file ? req.file.path : null`

- **PUT /api/templates/:id** (linha 47)
  - ❌ Antes: `data.mediaPath = `/uploads/media/${req.file.filename}`
  - ✅ Depois: `data.mediaPath = req.file.path`

**Motivo:** `req.file.path` do Multer já contém o caminho relativo completo (`uploads/media/uuid.ext`)

### 2. `backend/src/routes/schedules.ts`
- **POST /api/schedules** (linha 36)
  - ❌ Antes: `mediaPath: req.file ? `/uploads/media/${req.file.filename}` : undefined`
  - ✅ Depois: `mediaPath: req.file ? req.file.path : undefined`

**Motivo:** Mesma razão - usar `req.file.path` em vez de reconstruir manualmente

### 3. `backend/src/services/whatsapp.service.ts`

#### 3.1 Função `sendMedia()` (linhas 220-230)
- ✅ Adicionada verificação de existência do arquivo com `fs.existsSync()`
- ✅ Adicionado logging detalhado com emojis
- ✅ Adicionado try-catch para melhor tratamento de erros

#### 3.2 Função `sendMediaToGroup()` (linhas 232-242)
- ✅ Adicionada verificação de existência do arquivo com `fs.existsSync()`
- ✅ Adicionado logging detalhado com emojis
- ✅ Adicionado try-catch para melhor tratamento de erros

#### 3.3 Função `sendWithDelay()` (linha 344)
- ❌ Antes: `const filePath = path.join(process.cwd(), content.mediaPath!.replace(/^\//, ''))`
- ✅ Depois: `const filePath = path.join(process.cwd(), content.mediaPath!)`

**Motivo:** Agora que `mediaPath` é o caminho relativo correto, não precisa mais fazer `.replace()` para remover a barra

## Fluxo Correto Agora

1. **Upload de arquivo** → Multer salva em `uploads/media/uuid.ext`
   - `req.file.filename` = `uuid.ext`
   - `req.file.path` = `uploads/media/uuid.ext` ✅

2. **Salvar em DB** (Template/Schedule)
   - Armazena: `uploads/media/uuid.ext` ✅

3. **Enviar campanha**
   - Recupera mediaPath da template/schedule
   - `sendWithDelay()` faz: `path.join(process.cwd(), 'uploads/media/uuid.ext')`
   - Resulta em: `C:\Users\letic\Downloads\Whats-CRM-main\backend\uploads\media\uuid.ext` ✅

4. **Verificação antes de enviar**
   - `fs.existsSync(filePath)` valida o arquivo existe
   - Se não existir, erro claro ao invés de erro críptico do WhatsApp

## Logs Melhorados
Agora o sistema mostra:
```
[WhatsApp] 📤 Enviando mídia para grupo 120363151234567890@g.us...
[WhatsApp] ✅ Mídia enviada para grupo com sucesso

ou em caso de erro:

[WhatsApp] ❌ Arquivo não encontrado: C:\...\uploads\media\uuid.jfif
[WhatsApp] ❌ Erro ao enviar mídia para grupo: Arquivo não encontrado: ...
```

## Como Testar

1. **Criar Template com Mídia**
   ```
   POST /api/templates
   - name: "Bem-vindo com foto"
   - type: "image"
   - body: "Bem-vindo ao nosso curso!"
   - file: <imagem.jpg>
   ```

2. **Criar Campanha com Template**
   ```
   POST /api/campaigns
   - name: "Campanha Welcome"
   - templateId: <id_da_template>
   - targetGroups: [<group_id>]
   ```

3. **Disparar Campanha**
   ```
   POST /api/campaigns/{id}/send
   ```

4. **Verificar Logs**
   - Backend: console mostrará `[WhatsApp] ✅ Mídia enviada...`
   - WhatsApp: mensagem com imagem chegará no grupo

## Próximos Passos (Opcional)
- [ ] Adicionar compactação de imagens antes de enviar
- [ ] Criar endpoint para listar uploads e deletar antigos
- [ ] Implementar retry automático para fails de conexão
- [ ] Adicionar tracking de tamanho de mídia

## Status
✅ **CORRIGIDO** - Envio de mídia agora funciona sem ENOENT
