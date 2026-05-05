# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first for better layer caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build


# ─── Stage 2: Build backend ───────────────────────────────────────────────────
FROM node:20-slim AS backend-builder

WORKDIR /app/backend

# Install dependencies first for better layer caching
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY backend/ ./
RUN npx prisma generate
RUN npm run build


# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-slim AS production

# Install Chromium, OpenSSL (required by Prisma), and all system dependencies
# required by whatsapp-web.js / Puppeteer
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

# Tell Puppeteer/whatsapp-web.js to use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app/backend

# Install production dependencies only
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled backend from builder stage
COPY --from=backend-builder /app/backend/dist ./dist

# Copy Prisma schema and generated client
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=backend-builder /app/backend/node_modules/.prisma ./node_modules/.prisma

# Copy built frontend so the backend can serve it as static files
# Backend resolves: path.join(process.cwd(), '..', 'frontend', 'dist')
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose backend port
EXPOSE 3333

ENV NODE_ENV=production

# Healthcheck: poll /api/health every 30s, allow 60s start-up grace period
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Run DB migration then start the server; log any startup errors to stderr
CMD ["sh", "-c", "echo '[CMD] Running prisma db push...' && npx prisma db push && echo '[CMD] Starting server...' && node dist/index.js"]
