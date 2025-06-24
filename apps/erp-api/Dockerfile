# Multi-stage build for production
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm

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
RUN pnpm run build --filter=@erp-suite/dtos --filter=@erp-suite/crypto

# Build the application
RUN pnpm run build --filter=@erp-suite/erp-api

# Production stage
FROM node:18-alpine AS production

# Install pnpm
RUN npm install -g pnpm

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

# Change ownership
RUN chown -R nestjs:nodejs /app
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "apps/erp-api/dist/main.js"] 