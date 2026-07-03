import { isSupabaseConfigured } from '../../data/supabase'

export default function AuthStatus() {
  const configured = isSupabaseConfigured()
  return (
    <div className={`auth-status ${configured ? 'auth-status-live' : 'auth-status-local'}`} role="status">
      <span>{configured ? 'Cloud ready' : 'Saved on this device'}</span>
      <small>
        {configured
          ? 'Cloud login can attach here without changing the finance screens.'
          : 'Everything is stored safely here. Cloud backup is optional.'}
      </small>
    </div>
  )
}
