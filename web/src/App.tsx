import { useEffect, useState } from 'react'

// Phase 1 placeholder: confirms the web app, the API and MongoDB are all reachable.
// Phase 2 replaces it with sign-in and the permission-driven app shell.

type Check = 'checking' | 'up' | 'down'

async function probe(path: string): Promise<Check> {
  try {
    const res = await fetch(path, { credentials: 'same-origin' })
    return res.ok ? 'up' : 'down'
  } catch {
    return 'down'
  }
}

export function App() {
  const [api, setApi] = useState<Check>('checking')
  const [db, setDb] = useState<Check>('checking')

  useEffect(() => {
    void probe('/api/v1/health').then(setApi)
    void probe('/api/v1/ready').then(setDb)
  }, [])

  const rows: [string, string, Check][] = [
    ['web', 'Web app (Vite)', 'up'],
    ['api', 'API (Express)', api],
    ['db', 'Database (MongoDB)', db],
  ]

  return (
    <main className="status">
      <div className="brand">
        <span className="mark">CSM</span>
        <div>
          <h1>CSM Playground Bank</h1>
          <p>Phase 1 is running. Sign-in and the app screens arrive in phase 2.</p>
        </div>
      </div>
      <ul data-testid="system-status">
        {rows.map(([key, label, state]) => (
          <li key={key} id={`status-${key}`} data-testid={`status-${key}`} data-state={state}>
            <span>{label}</span>
            <span className={`pill ${state}`}>
              {state === 'checking' ? 'Checking…' : state === 'up' ? 'Up' : 'Down'}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        API endpoints: <code>/api/v1/health</code>, <code>/api/v1/ready</code>, <code>/api/v1/auth/csrf</code>
      </p>
    </main>
  )
}
