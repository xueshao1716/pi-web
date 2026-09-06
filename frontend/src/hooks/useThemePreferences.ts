import { useEffect, useState } from 'react'
import { ThemeApi } from '../api'
import { restoreThemePreferences } from '../theme/apply'

// Hydrate before either client mounts its controls; reading preferences must never save them.
export function useThemePreferences(authed: boolean) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!authed) { setReady(false); return }
    let alive = true
    ThemeApi.get().then(preferences => {
      if (alive && preferences) restoreThemePreferences(preferences)
    }).catch(() => {}).finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [authed])
  return ready
}
