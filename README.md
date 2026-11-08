# opencode-freepi-auth (freepi-magpie-plugin)

Free AI coding models from **free-pi CLI** as an OpenCode / Magpie provider plugin.

Directly reuses your local `free-pi-cli` login state, provides dynamic model synchronization, displays real-time daily quota & allowance, marks all LLMs as **Free**, and simulates official `free-pi-cli` headers for safe, anti-ban operation.

---

## Features

- **Zero-config Local Auth Reuse**: Automatically detects and reads `~/.free-pi/agent/credentials.json`. No need to re-login or paste keys.
- **Quota & Allowance Display**: Shows daily remaining credits, dollar value, bonus wallet, and reset countdown in Magpie UI.
- **Dynamic 30+ Free LLMs**: Real-time discovery of all available free models:
  - `claude-sonnet-5.5`, `claude-haiku-5.5`
  - `deepseek-v4.1-flash`, `deepseek-v4-flash`, `deepseek-v4-pro`
  - `gpt-6.1-terra`, `gpt-6.1-sol`, `gpt-6-luna`, `gpt-oss-120b-speed`
  - `kimi-k3.1-pro`, `glm-5.3-flash`, `gemini-4-argon`, etc.
- **Free LLM Status**: All models configured with `free: true` and 0-cost metrics.
- **1:1 CLI Simulation (Anti-Ban)**: Injects `x-client-version`, `x-session-id`, and `x-freepi-tool-errors` into every upstream completion request.

---

## Installation & Usage

### 1. In Magpie

Ensure you have run `free-pi-cli` at least once in your terminal to sign in:

```bash
# Add this plugin to Magpie
magpie plugin add xiaosheng1126/freepi-magpie-plugin

# Sign in using your local free-pi CLI credentials
magpie plugin login free-pi
```

Check quota and models:

```bash
# Check quota / allowance
magpie quota free-pi

# List all models
magpie models
```

### 2. Calling via API

Once registered in Magpie, you can call it via Magpie's local gateway (`127.0.0.1:3425`) using standard OpenAI client format:

```bash
curl http://127.0.0.1:3425/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer magpie" \
  -d '{
    "model": "free-pi/deepseek-v4.1-flash",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## License

MIT
