# SmartMaint — imagem única (frontend + API), pronta para AWS (ECS, App Runner, Elastic Beanstalk).
# O Node serve a API em /api, os arquivos em /uploads e o build do React nas demais rotas.

# ---------- 1. Build do frontend ----------
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: o postinstall instala o backend, que tem estágio próprio
RUN npm ci --ignore-scripts
COPY index.html vite.config.js eslint.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---------- 2. Dependências de produção do backend ----------
FROM node:20-alpine AS api-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---------- 3. Imagem final ----------
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_DIR=/app/uploads
WORKDIR /app

COPY --from=api-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=web /app/dist ./dist

# Pasta de uploads local (em produção prefira S3_BUCKET: o disco do container é descartado a cada deploy)
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "server/index.js"]
