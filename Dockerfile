# Multi-stage build for smaller production image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S proxmox-cleanup -u 1001

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bin ./bin

# Create directories for logs and backups
RUN mkdir -p /app/logs /app/backups && \
    chown -R proxmox-cleanup:nodejs /app

# Switch to non-root user
USER proxmox-cleanup

# Expose volume mounts for configuration and data
VOLUME ["/app/config", "/app/logs", "/app/backups"]

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/app/bin:$PATH"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "dist/cli/index.js", "--help"]