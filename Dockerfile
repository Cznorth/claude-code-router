FROM node:20-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Clone and build
RUN git clone https://github.com/Cznorth/claude-code-router.git . && \
    corepack enable && \
    pnpm install && \
    pnpm build && \
    pnpm store prune && \
    rm -rf /root/.local/share/pnpm/store

# Create config directory
RUN mkdir -p /root/.claude-code-router

# Expose port
EXPOSE 3456

# Environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# Start server
CMD ["sh", "-c", "node dist/cli.js start && tail -f /dev/null"]
