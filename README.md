# Claude Code Router

[![Docker Build](https://img.shields.io/docker/cloud/build/musistudio/claude-code-router)](https://hub.docker.com/r/musistudio/claude-code-router)
[![GitHub release](https://img.shields.io/github/v/release/musistudio/claude-code-router)](https://github.com/musistudio/claude-code-router/releases)
[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?&logo=discord&logoColor=white)](https://discord.gg/rdftVMaUcS)
[![License](https://img.shields.io/github/license/musistudio/claude-code-router)](https://github.com/musistudio/claude-code-router/blob/main/LICENSE)

A powerful API gateway that transforms OpenAI-compatible endpoints into Anthropic format, enabling you to use any LLM provider with Claude Code and other Anthropic-compatible clients.

## 🎯 What It Does

Claude Code Router acts as a **format converter** and **smart router** between:

- **Input**: Anthropic/Claude Code API format (`/v1/messages`)
- **Output**: OpenAI-compatible API format (`/v1/chat/completions`)

This allows you to:
- Use **DeepSeek, Qwen, Kimi, GLM, Gemini, OpenRouter** and other providers with Claude Code
- Deploy as a **standalone API gateway** via Docker Compose
- Route requests to different models based on context (thinking, long-context, background tasks)
- Transform request/response formats automatically with built-in transformers

## 🚀 Quick Start with Docker Compose

### 1. Create Configuration File

Create `config.json`:

```json
{
  "APIKEY": "your-gateway-api-key",
  "LOG": true,
  "LOG_LEVEL": "info",
  "API_TIMEOUT_MS": 600000,
  "NON_INTERACTIVE_MODE": true,
  "HOST": "0.0.0.0",
  "Providers": [{
    "name": "deepseek",
    "api_base_url": "https://api.deepseek.com/v1/chat/completions",
    "api_key": "your-deepseek-api-key",
    "models": ["deepseek-chat", "deepseek-reasoner"],
    "transformer": {
      "use": ["OpenAI"],
      "deepseek-reasoner": {
        "use": ["reasoning", "forcereasoning"]
      }
    }
  }],
  "Router": {
    "default": "deepseek,deepseek-chat",
    "think": "deepseek,deepseek-reasoner",
    "longContext": "deepseek,deepseek-chat",
    "longContextThreshold": 60000
  }
}
```

### 2. Create docker-compose.yml

```yaml
services:
  claude-code-router:
    image: musistudio/claude-code-router:latest
    container_name: claude-code-router
    restart: unless-stopped
    ports:
      - "3456:3456"
    volumes:
      - ./config.json:/root/.claude-code-router/config.json:ro
      - ccr-logs:/root/.claude-code-router/logs
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3456/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  ccr-logs:
```

### 3. Start the Service

```bash
docker compose up -d
```

### 4. Use with Claude Code

Set environment variables:

```bash
export ANTHROPIC_BASE_URL=http://localhost:3456
export ANTHROPIC_API_KEY=your-gateway-api-key
```

Then run Claude Code normally:

```bash
claude
```

## 📋 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/messages` | Anthropic-format chat completions |
| `POST /v1/chat/completions` | OpenAI-format chat completions |
| `GET /v1/models` | List available models |
| `GET /health` | Health check |

## 🔧 Configuration Guide

### Provider Configuration

Each provider requires:

| Field | Description |
|-------|-------------|
| `name` | Unique provider identifier |
| `api_base_url` | Full API endpoint URL |
| `api_key` | Your API key |
| `models` | List of available model names |
| `transformer` | Request/response transformers |

### Router Configuration

| Field | Description | Default |
|-------|-------------|---------|
| `default` | Default model for all requests | Required |
| `think` | Model for reasoning tasks | Optional |
| `background` | Model for background tasks | Optional |
| `longContext` | Model for long contexts | Optional |
| `longContextThreshold` | Token threshold for long context | 60000 |
| `webSearch` | Model for web search tasks | Optional |

### Built-in Transformers

| Transformer | Description |
|-------------|-------------|
| `OpenAI` | Standard OpenAI format (passthrough) |
| `Anthropic` | Direct Anthropic API connection |
| `deepseek` | DeepSeek API compatibility |
| `gemini` | Google Gemini API compatibility |
| `openrouter` | OpenRouter API compatibility |
| `reasoning` | Process `reasoning_content` from thinking models |
| `forcereasoning` | Force thinking mode with prompt injection |
| `streamoptions` | Add `stream_options.include_usage` for token stats |
| `maxtoken` | Set max tokens limit |
| `tooluse` | Optimize tool calling |

## 💡 Usage Examples

### Using with Different Providers

**DeepSeek with Thinking Mode:**

```json
{
  "name": "deepseek",
  "api_base_url": "https://api.deepseek.com/v1/chat/completions",
  "api_key": "sk-xxx",
  "models": ["deepseek-chat", "deepseek-reasoner"],
  "transformer": {
    "use": ["OpenAI", "streamoptions"],
    "deepseek-reasoner": {
      "use": ["reasoning", "forcereasoning"]
    }
  }
}
```

**OpenRouter:**

```json
{
  "name": "openrouter",
  "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
  "api_key": "sk-or-xxx",
  "models": ["anthropic/claude-sonnet-4", "google/gemini-2.5-pro"],
  "transformer": {
    "use": ["openrouter"]
  }
}
```

**Local Ollama:**

```json
{
  "name": "ollama",
  "api_base_url": "http://localhost:11434/v1/chat/completions",
  "api_key": "ollama",
  "models": ["qwen2.5-coder:latest", "deepseek-r1:latest"]
}
```

### Making Requests

**Anthropic Format (Claude Code compatible):**

```bash
curl http://localhost:3456/v1/messages \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**OpenAI Format:**

```bash
curl http://localhost:3456/v1/chat/completions \
  -H "Authorization: Bearer your-gateway-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek,deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

> **Note**: For OpenAI format, use `provider,model` syntax to specify the provider.

### Listing Models

```bash
curl http://localhost:3456/v1/models \
  -H "Authorization: Bearer your-gateway-api-key"
```

Response:

```json
{
  "object": "list",
  "data": [
    {"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"},
    {"id": "deepseek-reasoner", "object": "model", "owned_by": "deepseek"}
  ]
}
```

## 🔄 How Format Conversion Works

### Request Flow

```
Claude Code                    Claude Code Router                    Provider
    │                               │                                    │
    │  POST /v1/messages            │                                    │
    │  (Anthropic format)           │                                    │
    ├──────────────────────────────>│                                    │
    │                               │  Transform to OpenAI format         │
    │                               │  - Convert message structure        │
    │                               │  - Map tool definitions             │
    │                               │  - Apply transformers               │
    │                               ├───────────────────────────────────>│
    │                               │  POST /v1/chat/completions         │
    │                               │  (OpenAI format)                   │
    │                               │                                    │
    │                               │<───────────────────────────────────┤
    │                               │  Stream response (OpenAI format)   │
    │                               │                                    │
    │                               │  Transform to Anthropic format     │
    │                               │  - Convert content blocks          │
    │                               │  - Map tool calls                  │
    │                               │  - Extract reasoning_content       │
    │<──────────────────────────────┤                                    │
    │  Stream response              │                                    │
    │  (Anthropic format)           │                                    │
```

### Key Transformations

| Anthropic | OpenAI |
|-----------|--------|
| `content: "text"` | `content: "text"` |
| `content: [{type: "text", text: "..."}]` | `content: "..."` |
| `content: [{type: "image", source: {...}}]` | `content: [{type: "image_url", image_url: {...}}]` |
| `tool_use` blocks | `tool_calls` array |
| `tool_result` blocks | `role: "tool"` messages |
| `thinking` blocks | `reasoning_content` (DeepSeek) |

## 🐳 Docker Deployment Options

### Using Pre-built Image

```yaml
services:
  claude-code-router:
    image: musistudio/claude-code-router:latest
    ports:
      - "3456:3456"
    volumes:
      - ./config.json:/root/.claude-code-router/config.json:ro
```

### Build from Source

```yaml
services:
  claude-code-router:
    build: https://github.com/musistudio/claude-code-router.git
    ports:
      - "3456:3456"
    volumes:
      - ./config.json:/root/.claude-code-router/config.json:ro
```

### Build from Fork

```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache git
RUN git clone https://github.com/YOUR-USERNAME/claude-code-router.git . && \
    corepack enable && \
    pnpm install && \
    pnpm build && \
    pnpm store prune && \
    rm -rf /root/.local/share/pnpm/store
RUN mkdir -p /root/.claude-code-router
EXPOSE 3456
ENV NODE_ENV=production
ENV HOST=0.0.0.0
CMD ["sh", "-c", "node dist/cli.js start && tail -f /dev/null"]
```

## 🔒 Security Notes

1. **API Key Protection**: Always set a strong `APIKEY` in production
2. **Host Binding**: Use `HOST: 0.0.0.0` only behind a reverse proxy or firewall
3. **Volume Permissions**: Config file is mounted as read-only (`:ro`)
4. **Log Rotation**: Logs are stored in a Docker volume for management

## 🛠️ Management Commands

```bash
# View logs
docker compose logs -f

# Restart service
docker compose restart

# Stop service
docker compose down

# Rebuild and restart
docker compose up -d --build

# Health check
curl http://localhost:3456/health
```

## 📖 Full Documentation

For advanced features like:
- Custom routers
- Plugin development
- GitHub Actions integration
- CLI model management
- UI mode

See the [full documentation](https://github.com/musistudio/claude-code-router#readme).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ❤️ Sponsors

This project is sponsored by [Z.ai](https://z.ai/subscribe?ic=8JVLJQFSKB) - GLM CODING PLAN, a subscription service designed for AI coding starting at $10/month.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/F1F31GN2GM)
