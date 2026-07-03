export interface SupabaseConfig {
  url: string
  anonKey: string
}

type SupabaseEnv = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export function getSupabaseConfig(env: SupabaseEnv = import.meta.env as SupabaseEnv): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function isSupabaseConfigured(env: SupabaseEnv = import.meta.env as SupabaseEnv): boolean {
  return getSupabaseConfig(env) !== null
}
