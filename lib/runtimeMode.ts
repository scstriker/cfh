export type DeployTarget = "local" | "cloud";

const DEPLOY_TARGET: DeployTarget =
  process.env.NEXT_PUBLIC_DEPLOY_TARGET === "cloud" ? "cloud" : "local";

export function getDeployTarget(): DeployTarget {
  return DEPLOY_TARGET;
}

export function isCloudDeployTarget() {
  return DEPLOY_TARGET === "cloud";
}

export function requiresUserGeminiApiKey() {
  return DEPLOY_TARGET === "local";
}

export function getGeminiTransport() {
  return DEPLOY_TARGET === "cloud" ? "proxy" : "direct";
}

export function getGeminiProxyEndpoint() {
  return "/api/gemini/generate";
}

