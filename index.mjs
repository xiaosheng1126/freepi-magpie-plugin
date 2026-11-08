// free-pi CLI AI models as a Magpie / OpenCode provider plugin.
//
// Automatically reuses the local login state from `~/.free-pi/agent/credentials.json`,
// fetches live models dynamically from https://api.freepi.ai/client-version,
// parses credits multiplier (only 0-rate models show as 免费, others show Nx 积分 like WorkBuddy),
// displays real-time daily quota & allowance via https://api.freepi.ai/me,
// and simulates official free-pi CLI headers (x-client-version, stable x-session-id, x-freepi-tool-errors).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ID = "free-pi";
const BASE = "https://api.freepi.ai/v1";
const API_ROOT = "https://api.freepi.ai";

// Default fallback models in case network is down during initial registration
const BOOTSTRAP_MODELS = [
  { id: "particle", name: "Particle · 🔥 Free Unlimited: limited time" },
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash · 🔥 Free Unlimited: limited time" },
  { id: "glm-5.3-flash", name: "GLM 5.3 Flash · 🔥 Free Unlimited: limited time" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash · 🔥 Free Unlimited: limited time" },
  { id: "claude-haiku-5.5", name: "Claude Haiku 5.5 · ~2.0x usage" },
  { id: "claude-sonnet-5.5", name: "Claude Sonnet 5.5 · unavailable", unavailable: true },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro · ~18x usage" },
  { id: "gpt-6.1-terra", name: "GPT-6.1 Terra · ~20x usage" },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol · unavailable", unavailable: true },
  { id: "gpt-6-luna", name: "GPT-6 Luna · ~2.0x usage" },
  { id: "kimi-k3.1-pro", name: "Kimi K3.1 Pro · ~41x usage" },
  { id: "solar-pro-4", name: "Solar Pro 4 · ~0.6x usage" }
];

function getCredentialsPath() {
  return join(homedir(), ".free-pi", "agent", "credentials.json");
}

function getSessionIdPath() {
  return join(homedir(), ".free-pi", "agent", "magpie-session-id");
}

function getStableSessionId() {
  const p = getSessionIdPath();
  if (existsSync(p)) {
    try {
      const s = readFileSync(p, "utf8").trim();
      if (s) return s;
    } catch {}
  }
  const id = randomUUID();
  try {
    writeFileSync(p, id, "utf8");
  } catch {}
  return id;
}

function readToken() {
  const p = getCredentialsPath();
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return typeof raw?.token === "string" && raw.token.trim() ? raw.token.trim() : null;
  } catch {
    return null;
  }
}

function getCliVersion() {
  const possiblePaths = [
    join(homedir(), ".local", "lib", "node_modules", "free-pi-cli", "package.json"),
    "/usr/local/lib/node_modules/free-pi-cli/package.json"
  ];
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8"));
        if (pkg.version) return pkg.version;
      } catch {}
    }
  }
  return "0.6.14"; // Default known stable version
}

async function fetchMe(token, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${API_ROOT}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-client-version": getCliVersion()
    },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error("free-pi sign-in expired (401/403)"), { status: res.status, invalidToken: true });
  }
  if (!res.ok) {
    throw new Error(`free-pi /me returned HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchLiveModels(token, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(`${API_ROOT}/client-version`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-client-version": getCliVersion()
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (Array.isArray(body?.models) && body.models.length > 0) {
      return body.models;
    }
  } catch {
    // Return null on network error, caller keeps fallback
  }
  return null;
}

function parseModelPricing(rawName, unavailable) {
  if (unavailable || /unavailable/i.test(rawName)) {
    return { isFree: false, rate: 0, tag: "不可用" };
  }
  // Free models explicitly say "Free Unlimited" in name
  const isFree = /free\s+unlimited/i.test(rawName);
  if (isFree) {
    return { isFree: true, rate: 0, tag: "免费" };
  }
  // Otherwise parse the multiplier e.g. "~20x usage" -> 20
  const rateMatch = rawName.match(/~([0-9.]+)x/i);
  const rate = rateMatch ? parseFloat(rateMatch[1]) : 1;
  return { isFree: false, rate, tag: `${rate}x 积分` };
}

function toMagpieModel(m) {
  const id = m.id;
  const rawName = m.name || id;
  const baseName = rawName.split(" · ")[0].trim();
  const pricing = parseModelPricing(rawName, m.unavailable);
  const displayName = `${baseName} · ${pricing.tag}`;

  return {
    id,
    name: displayName,
    free: pricing.isFree,
    rate: pricing.rate,
    limit: { context: 131072, output: 8192 },
    reasoning: true,
    tool_call: true,
    cost: pricing.isFree ? { input: 0, output: 0, cache_read: 0, cache_write: 0 } : undefined,
    capabilities: {
      reasoning: true,
      toolcall: true,
      input: { text: true },
      output: { text: true }
    }
  };
}

export const FreePiAuthPlugin = async ({ client } = {}) => {
  return {
    config: async (cfg) => {
      cfg.provider ??= {};
      cfg.provider[ID] ??= {
        name: "free-pi",
        npm: "@ai-sdk/openai-compatible",
        api: BASE,
        models: Object.fromEntries(BOOTSTRAP_MODELS.map((m) => [m.id, toMagpieModel(m)]))
      };
    },

    provider: {
      id: ID,
      async models(provider, { auth } = {}) {
        const token = auth?.key || readToken();
        if (!token) return provider.models;
        const live = await fetchLiveModels(token);
        if (live && live.length > 0) {
          return Object.fromEntries(live.map((m) => [m.id, toMagpieModel(m)]));
        }
        return provider.models;
      }
    },

    auth: {
      provider: ID,
      methods: [
        {
          type: "oauth",
          label: "free-pi CLI's sign-in (自动复用本地登录态)",
          async authorize() {
            const token = readToken();
            if (!token) {
              return {
                type: "failed",
                error: "未找到 free-pi 本地登录态。请先在终端运行一次 `free-pi-cli` 完成登录。"
              };
            }
            try {
              const me = await fetchMe(token);
              const handle = me.handle || me.user_id || "free-pi user";
              return {
                type: "success",
                key: token,
                metadata: {
                  handle,
                  uid: me.user_id,
                  tier: me.tier,
                  source: "free-pi-cli"
                },
                async callback() {
                  return {
                    type: "success",
                    key: token,
                    metadata: { handle, uid: me.user_id, tier: me.tier }
                  };
                }
              };
            } catch (err) {
              return {
                type: "failed",
                error: `free-pi 凭据验证失败: ${err.message}`
              };
            }
          }
        },
        {
          type: "api",
          label: "free-pi JWT Token (手动填入)",
          placeholder: "eyJhbGciOi..."
        }
      ],

      async usage(getAuth) {
        const auth = await getAuth();
        const token = auth?.key || readToken();
        if (!token) {
          return { error: "not signed in", windows: [] };
        }

        try {
          const me = await fetchMe(token);
          const allowance = me.allowance_credits || 15000;
          const remaining = me.remaining_credits_today ?? allowance;
          const used = Math.max(0, Math.min(100, Math.round(((allowance - remaining) / allowance) * 100)));
          const dollars = typeof me.remaining_usd_today === "number" ? ` ($${me.remaining_usd_today.toFixed(2)} 可用)` : "";

          const windows = [
            {
              name: "每日免费额度 (Daily Allowance)",
              used,
              display: `${remaining.toLocaleString()} / ${allowance.toLocaleString()} credits${dollars}`,
              resetsAt: me.refill_at
            }
          ];

          if (typeof me.bonus_credits === "number" && me.bonus_credits > 0) {
            windows.push({
              name: "奖励钱包 (Bonus Wallet)",
              used: 0,
              display: `${me.bonus_credits.toLocaleString()} credits`
            });
          }

          return {
            plan: `Free Allowance (${me.tier || "Standard"})`,
            user: me.handle || "free-pi user",
            windows,
            signIn: "renewed"
          };
        } catch (err) {
          if (err.invalidToken) {
            return {
              error: "free-pi 凭据已失效，请在终端运行 `free-pi-cli` 重新登录",
              signIn: "expired",
              windows: []
            };
          }
          return {
            error: `读取额度失败: ${err.message}`,
            windows: []
          };
        }
      },

      async loader(getAuth) {
        const auth = await getAuth();
        const token = auth?.key || readToken();
        if (!token) return {};

        const cliVersion = getCliVersion();
        const stableSessionId = getStableSessionId();

        return {
          baseURL: BASE,
          apiKey: token,
          // Custom simulated fetch replicating official free-pi CLI headers & session auto-recovery
          async fetch(input, init = {}) {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));

            headers.set("Authorization", `Bearer ${token}`);
            headers.set("Content-Type", "application/json");
            headers.set("x-client-version", cliVersion);
            if (!headers.has("x-session-id")) {
              headers.set("x-session-id", stableSessionId);
            }
            headers.set("x-freepi-tool-errors", "v1:");

            let res = await globalThis.fetch(url, {
              ...init,
              headers
            });

            // Auto-heal concurrent_session (409) if an earlier session crashed
            if (res.status === 409) {
              try {
                const resetRes = await globalThis.fetch(`${API_ROOT}/session/reset`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (resetRes.ok) {
                  res = await globalThis.fetch(url, {
                    ...init,
                    headers
                  });
                }
              } catch {}
            }

            return res;
          }
        };
      }
    }
  };
};

export default FreePiAuthPlugin;
export { FreePiAuthPlugin as FreePiPlugin };
