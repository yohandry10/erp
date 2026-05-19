# Multi-stage build for production
FROM node:20-alpine AS base

RUN npm install -g pnpm@9.15.4

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY libs/ ./libs/
COPY apps/worker/ ./apps/worker/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter=@erp-suite/dtos build
RUN pnpm --filter=@erp-suite/crypto build
RUN pnpm --filter=@erp-suite/worker build

FROM node:20-alpine AS production

RUN npm install -g pnpm@9.15.4

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=base /app/libs/dtos/dist ./libs/dtos/dist
COPY --from=base /app/libs/dtos/package.json ./libs/dtos/
COPY --from=base /app/libs/crypto/dist ./libs/crypto/dist
COPY --from=base /app/libs/crypto/package.json ./libs/crypto/
COPY --from=base /app/apps/worker/dist ./apps/worker/dist
COPY --from=base /app/apps/worker/package.json ./apps/worker/

RUN pnpm install --prod --frozen-lockfile

RUN addgroup -g 1001 -S nodejs
RUN adduser -S worker -u 1001
USER worker

EXPOSE 3050

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const port=process.env.WORKER_PORT||'3050'; const http=require('http'); const req=http.get(`http://localhost:${port}/health`, (res)=>process.exit(res.statusCode===200?0:1)); req.on('error', ()=>process.exit(1));"

CMD ["node", "apps/worker/dist/index.js"]
