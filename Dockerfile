# ─── Stage 1: Frontend build ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ─── Stage 2: Backend build ───────────────────────────────────────────────────
FROM node:20-slim AS backend-builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build && npx prisma generate


# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-slim AS production

# Install Chromium and all required system libraries (replaces nixpacks.toml setup phase)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    fonts-liberation \
    libglib2.0-0 \
    libdbus-1-3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libxkbcommon0 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer/whatsapp-web.js where to find the system Chromium
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

WORKDIR /app

# Copy built frontend dist so backend can serve it at ../frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy backend production dependencies and compiled output
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist         ./backend/dist
COPY --from=backend-builder /app/backend/prisma       ./backend/prisma
COPY backend/package.json                             ./backend/package.json

# Expose the backend port (default 3333, overridden by Railway's $PORT)
EXPOSE 3333

# Run Prisma schema push then start the server
CMD ["sh", "-c", "cd backend && npx prisma db push && node dist/index.js"]
