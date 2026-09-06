import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export interface CloudConfig {
  url: string;
  key: string;
}
export function readCloudConfig(
  env: Record<string, unknown>,
): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return typeof url === "string" && typeof key === "string" && url && key
    ? { url, key }
    : null;
}
let client: SupabaseClient | null = null;
export function getCloudClient(): SupabaseClient | null {
  const config = readCloudConfig(import.meta.env);
  if (!config) return null;
  client ??= createClient(config.url, config.key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}
