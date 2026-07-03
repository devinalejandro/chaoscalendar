import { isSupabaseConfigured } from '../../data/supabase'

export default function AuthStatus() {
  const configured = isSupabaseConfigured()
  return (
    <div className={`auth-status ${configured ? 'auth-status-live' : 'auth-status-local'}`} role="status">
      <span>{configured ? 'Supabase ready' : 'Local draft mode'}</span>
      <small>
        {configured
          ? 'Production auth can attach here without changing the finance screens.'
          : 'Data stays in this browser until Supabase keys are added.'}
      </small>
    </div>
  )
}
