// Unit test for opencode-freepi-auth plugin
import { FreePiAuthPlugin } from "./index.mjs";

async function run() {
  console.log("--- Testing FreePiAuthPlugin Initialization ---");
  const plugin = await FreePiAuthPlugin();

  const cfg = {};
  await plugin.config(cfg);
  console.log("Provider registered in config:", Object.keys(cfg.provider));
  console.log("Bootstrap models count:", Object.keys(cfg.provider["free-pi"].models).length);

  console.log("\n--- Testing Authorize (CLI Sign-in) ---");
  const method = plugin.auth.methods.find((m) => m.label.includes("free-pi CLI"));
  const authRes = await method.authorize();
  console.log("Authorize status:", authRes.type);
  console.log("Authorize metadata:", authRes.metadata);

  if (authRes.type !== "success") {
    throw new Error(`Authorize failed: ${authRes.error}`);
  }

  console.log("\n--- Testing Live Models Discovery ---");
  const models = await plugin.provider.models(cfg.provider["free-pi"], { auth: { key: authRes.key } });
  const modelKeys = Object.keys(models);
  console.log("Live models count:", modelKeys.length);
  console.log("Sample models:", modelKeys.slice(0, 5));
  console.log("Cost of first model (free verification):", models[modelKeys[0]].cost);
  console.log("Free flag of first model:", models[modelKeys[0]].free);

  console.log("\n--- Testing Usage & Quota Query ---");
  const usage = await plugin.auth.usage(() => ({ key: authRes.key }));
  console.log("Usage plan:", usage.plan);
  console.log("Usage user:", usage.user);
  console.log("Usage windows:", JSON.stringify(usage.windows, null, 2));

  console.log("\n--- Testing Simulated Loader & Chat Completion ---");
  const loader = await plugin.auth.loader(() => ({ key: authRes.key }));
  console.log("Loader baseURL:", loader.baseURL);

  const res = await loader.fetch(`${loader.baseURL}/chat/completions`, {
    method: "POST",
    body: JSON.stringify({
      model: "deepseek-v4.1-flash",
      messages: [{ role: "user", content: "Reply with the word SUCCESS only." }],
      max_tokens: 10
    })
  });

  console.log("Completion response status:", res.status);
  const json = await res.json();
  console.log("Completion result content:", json.choices?.[0]?.message?.content);

  console.log("\n>>> ALL PLUGIN CHECKS PASSED SUCCESSFULLY! <<<");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
