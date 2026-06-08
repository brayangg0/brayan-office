# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Instala dependências primeiro para melhor cache de camadas
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copia o código fonte e faz o build
COPY frontend/ ./
RUN npm run build


# ─── Stage 2: Build backend ───────────────────────────────────────────────────
FROM node:20-slim AS backend-builder

WORKDIR /app/backend

# Instala dependências primeiro para melhor cache de camadas
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copia o código fonte e faz o build
COPY backend/ ./
RUN npx prisma generate
RUN npm run build


# ─── Stage 3: Imagem de produção ────────────────────────────────────────────────
FROM node:20-slim AS production

# Instala Chromium, OpenSSL (necessário para o Prisma) e todas as dependências
# de sistema exigidas pelo whatsapp-web.js / Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    openssl \
    ca-certificates \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Indica ao Puppeteer/whatsapp-web.js para usar o Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app/backend

# Instala apenas dependências de produção
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copia o backend compilado do estágio de build
COPY --from=backend-builder /app/backend/dist ./dist

# Copia o schema do Prisma e o cliente gerado
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=backend-builder /app/backend/node_modules/.prisma ./node_modules/.prisma

# Copia o frontend compilado para que o backend possa servi-lo como arquivos estáticos
# O backend resolve: path.join(process.cwd(), '..', 'frontend', 'dist')
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expõe a porta do backend
EXPOSE 3333

ENV NODE_ENV=production

# Healthcheck: consulta /api/health a cada 30s, com 60s de período inicial de espera
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Executa a migração do banco e depois inicia o servidor; registra erros de inicialização no stderr
CMD ["sh", "-c", "echo '[CMD] Executando prisma db push...' && npx prisma db push && echo '[CMD] Iniciando servidor...' && node dist/index.js"]