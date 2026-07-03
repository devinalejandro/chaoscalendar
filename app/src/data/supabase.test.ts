import { describe, expect, it } from 'vitest'
import { getSupabaseConfig, isSupabaseConfigured } from './supabase'

describe('Supabase env boundary', () => {
  it('stays in local mode when credentials are missing', () => {
    expect(getSupabaseConfig({})).toBeNull()
    expect(isSupabaseConfigured({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false)
  })

  it('returns config only when both public credentials are present', () => {
    const env = {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
    }
    expect(getSupabaseConfig(env)).toEqual({ url: 'https://example.supabase.co', anonKey: 'anon' })
    expect(isSupabaseConfigured(env)).toBe(true)
  })
})
