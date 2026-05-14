# Multi-stage build for production
FROM node:20-alpine AS build

RUN npm install -g pnpm@9.15.4
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY libs/ ./libs/
COPY apps/web/ ./apps/web/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter=@erp-suite/dtos build
RUN pnpm --filter=@erp-suite/crypto build
RUN pnpm --filter=@erp-suite/web build

FROM node:20-alpine AS production

RUN npm install -g pnpm@9.15.4
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY libs/ ./libs/
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/next.config.js ./apps/web/next.config.js
COPY apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next ./apps/web/.next

RUN pnpm install --prod --frozen-lockfile

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http'); const req=http.get('http://localhost:3001/dashboard/', (res)=>process.exit(res.statusCode < 500 ? 0 : 1)); req.on('error', ()=>process.exit(1));"

CMD ["pnpm", "--filter=@erp-suite/web", "exec", "next", "start", "-p", "3001"]
