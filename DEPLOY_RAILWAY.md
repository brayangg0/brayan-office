# 🚂 Como Fazer o Deploy no Railway — Passo a Passo

> Todos os arquivos de configuração já foram criados automaticamente. Siga os passos abaixo.

---

## ✅ Arquivos Criados (já estão no projeto)

| Arquivo | Para que serve |
|---|---|
| `nixpacks.toml` | Instala o Chromium no Railway (necessário para o WhatsApp) |
| `railway.json` | Configurações de build e start do Railway |
| `package.json` (raiz) | Diz ao Railway como buildar o projeto |
| `.railwayignore` | Evita subir arquivos desnecessários |
| `.env.railway.example` | Exemplo das variáveis de ambiente que você precisa configurar |

---

## 🚀 Passo a Passo para o Deploy

### PASSO 1 — Suba o código para o GitHub

Se ainda não fez isso, crie um repositório no GitHub e envie o projeto:

```bash
git init
git add .
git commit -m "Deploy Railway - Brayan Office CRM"
git remote add origin https://github.com/seu-usuario/seu-repositorio.git
git push -u origin main
```

---

### PASSO 2 — Criar projeto no Railway

1. Acesse **[railway.app](https://railway.app)** e faça login com GitHub
2. Clique em **New Project**
3. Selecione **Deploy from GitHub repo**
4. Escolha o repositório do projeto
5. Clique em **Deploy Now**

---

### PASSO 3 — Criar o Volume de persistência (IMPORTANTE!)

Sem isso, o banco de dados e a sessão do WhatsApp são perdidos a cada restart.

1. No painel do seu serviço, clique em **+ Add Volume**
2. Configure:
   - **Mount Path:** `/app/data`
3. Clique em **Create Volume**

---

### PASSO 4 — Configurar as Variáveis de Ambiente

No painel do serviço, clique em **Variables** e adicione uma por uma:

```
NODE_ENV=production
PORT=3333
DATABASE_URL=file:/app/data/prod.db
JWT_SECRET=coloque_uma_senha_muito_longa_e_aleatoria_aqui_minimo_32_chars
FRONTEND_URL=https://SEU-PROJETO.railway.app
CHROMIUM_PATH=/usr/bin/chromium
SESSION_PATH=/app/data/.wwebjs_auth
UPLOADS_PATH=/app/data/uploads
```

> ⚠️ **IMPORTANTE:** Troque `SEU-PROJETO.railway.app` pelo domínio real gerado pelo Railway depois que o deploy terminar. Você pode copiar na aba **Settings → Domains**.

---

### PASSO 5 — Gerar um domínio público

1. No painel do serviço, clique em **Settings**
2. Em **Networking**, clique em **Generate Domain**
3. Copie a URL gerada (ex: `brayan-office-crm.railway.app`)
4. Volte em **Variables** e atualize `FRONTEND_URL` com essa URL

---

### PASSO 6 — Aguardar o build

O Railway vai automaticamente:
1. Instalar o Chromium (via nixpacks.toml) ✅
2. Buildar o frontend React ✅
3. Compilar o backend TypeScript ✅
4. Subir o banco de dados no Volume ✅
5. Iniciar o servidor ✅

O build leva em torno de **3 a 8 minutos** na primeira vez.

---

### PASSO 7 — Conectar o WhatsApp

1. Acesse `https://SEU-PROJETO.railway.app/whatsapp`
2. Clique em **Conectar WhatsApp**
3. Escaneie o QR Code com o celular
4. ✅ Pronto! A sessão fica salva no Volume.

---

## 🐛 Problemas Comuns

| Problema | Solução |
|---|---|
| Build falha com erro de Chromium | Verifique se `nixpacks.toml` está na raiz do projeto |
| Site abre mas API não funciona (CORS) | Atualize `FRONTEND_URL` com a URL real do Railway |
| QR Code some após restart | Certifique-se que o Volume está configurado com mount em `/app/data` |
| Banco de dados zerado após restart | Confirme que `DATABASE_URL=file:/app/data/prod.db` está nas variáveis |
| "Cannot find module" no start | Verifique se o build TypeScript rodou corretamente nos logs |

---

## 📋 Checklist Final

- [ ] Código enviado para o GitHub
- [ ] Projeto criado no Railway conectado ao GitHub
- [ ] Volume criado com mount path `/app/data`
- [ ] Variáveis de ambiente configuradas (todas as 8)
- [ ] Domínio público gerado
- [ ] `FRONTEND_URL` atualizado com o domínio real
- [ ] Build concluído com sucesso (logs verdes)
- [ ] QR Code do WhatsApp escaneado

---

## 💡 Dica: Redeploy fácil

Sempre que fizer mudanças no código e der `git push`, o Railway vai fazer o deploy automático. Você não precisa fazer nada manualmente após a configuração inicial.
