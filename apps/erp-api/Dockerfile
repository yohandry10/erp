# Multi-stage build for production
FROM node:20-alpine AS base

# Install the lockfile-compatible pnpm version.
RUN npm install -g pnpm@9.15.4

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy library packages
COPY libs/ ./libs/

# Copy backend app
COPY apps/erp-api/ ./apps/erp-api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build libraries first
RUN pnpm --filter=@erp-suite/dtos build
RUN pnpm --filter=@erp-suite/crypto build

# Build the application
RUN pnpm --filter=@erp-suite/erp-api build

# Segun que fichero entre en el tsconfig, TypeScript deduce como raiz src/ o el
# directorio de la app, y la salida queda en dist/main.js o en dist/src/main.js.
# Adivinar cual de los dos costo un despliegue caido en bucle, asi que aqui se
# aplana a una sola forma y se comprueba: si no hay main.js, falla el BUILD, que
# se ve, en vez de fallar al arrancar, que no.
RUN if [ -f apps/erp-api/dist/src/main.js ]; then \
      mv apps/erp-api/dist/src apps/erp-api/.dist-plano && \
      rm -rf apps/erp-api/dist && \
      mv apps/erp-api/.dist-plano apps/erp-api/dist; \
    fi && \
    if [ ! -f apps/erp-api/dist/main.js ]; then \
      echo "ERROR: el build no produjo apps/erp-api/dist/main.js. Contenido:" && \
      ls -R apps/erp-api/dist 2>/dev/null | head -40 && \
      exit 1; \
    fi

# Production stage
FROM node:20-alpine AS production

# Install the lockfile-compatible pnpm version.
RUN npm install -g pnpm@9.15.4

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built libraries
COPY --from=base /app/libs/dtos/dist ./libs/dtos/dist
COPY --from=base /app/libs/dtos/package.json ./libs/dtos/
COPY --from=base /app/libs/crypto/dist ./libs/crypto/dist
COPY --from=base /app/libs/crypto/package.json ./libs/crypto/

# Copy built application
COPY --from=base /app/apps/erp-api/dist ./apps/erp-api/dist
COPY --from=base /app/apps/erp-api/package.json ./apps/erp-api/

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

USER nestjs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const port=process.env.PORT||'3002'; const http=require('http'); const req=http.get(`http://localhost:${port}/api/health/ready`, (res)=>process.exit(res.statusCode===200?0:1)); req.on('error', ()=>process.exit(1));"

# Start the application
# La etapa de build garantiza que este fichero existe, sea cual sea la raiz que
# haya deducido TypeScript.
CMD ["node", "apps/erp-api/dist/main.js"]
