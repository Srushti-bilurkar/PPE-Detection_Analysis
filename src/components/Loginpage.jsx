import { useState } from 'react'
import { useUser } from './UserContext'

export default function LoginPage() {
  const { users, login, passwords } = useUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPw, setShowPw]     = useState(false)

  const allUsers = [...(users?.admin || []), ...(users?.users || [])]

  function handleLogin() {
    setError('')
    const uname = username.trim().toLowerCase()
    const expectedPw = passwords?.[uname]
    if (!expectedPw)             { setError('Username not found.');  return }
    if (expectedPw !== password) { setError('Incorrect password.');  return }
    const userObj = allUsers.find(u => u.id === uname)
    if (!userObj) { setError('Account configuration error. Contact admin.'); return }
    setLoading(true)
    setTimeout(() => login(userObj), 600)
  }

  function handleKeyDown(e) { if (e.key === 'Enter') handleLogin() }

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.10)', border: '1px solid #475569',
    borderRadius: 8, padding: '10px 14px', color: '#f1f5f9', fontSize: 13,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }
  const labelStyle = {
    fontSize: 10, color: '#94a3b8', fontFamily: 'monospace',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
  }

  return (
    <div className="lp-wrap">
      <div className="lp-bg-grid" />
      <div className="lp-bg-glow1" />
      <div className="lp-bg-glow2" />

      <div className="lp-left">
        <div className="lp-brand">
          <div className="lp-brand-icon">🎯</div>
          <div>
            <div className="lp-brand-name">YOLOIntel</div>
            <div className="lp-brand-tag">Construction Safety · AI Platform</div>
          </div>
        </div>
        <div className="lp-hero-title">Real-time safety<br />for every <span>site</span>.</div>
        <div className="lp-hero-sub">
          AI-powered PPE compliance, zone monitoring, and instant alerts across all your construction locations.
        </div>
        <div className="lp-feature-list">
          <div className="lp-feature-item"><span className="lp-feature-icon">🦺</span><span className="lp-feature-text">Real-time PPE violation detection across all zones</span></div>
          <div className="lp-feature-item"><span className="lp-feature-icon">📡</span><span className="lp-feature-text">4 live cameras streaming AI inference at 30 FPS</span></div>
          <div className="lp-feature-item"><span className="lp-feature-icon">⚡</span><span className="lp-feature-text">Instant alerts to supervisors within 3 seconds</span></div>
          <div className="lp-feature-item"><span className="lp-feature-icon">🏗️</span><span className="lp-feature-text">Covering 4 active construction sites — Bangalore, Hyderabad, Chennai</span></div>
        </div>
        <div className="lp-mosaic">
          {[{ id: 'BLR-01' }, { id: 'HYD-04' }, { id: 'CHN-01' }].map(cam => (
            <div key={cam.id} className="lp-cam-tile">
              <div className="lp-cam-dot" />
              <div className="lp-cam-id">{cam.id}</div>
            </div>
          ))}
          <div className="lp-cam-tile lp-cam-tile-ai">
            <div className="lp-cam-ai-icon">🤖</div>
            <div className="lp-cam-id">AI ACTIVE</div>
          </div>
        </div>
      </div>

      <div className="lp-divider" />

      <div className="lp-right">
        <div className="lp-card">

          <div className="lp-card-head">
            <div className="lp-card-title">Sign in</div>
            <div className="lp-live-badge"><div className="lp-live-dot" />LIVE</div>
          </div>
          <div style={{ fontSize: 12, color: '#d9d9d9', marginBottom: 20 }}>Enter your credentials to access your assigned cameras.</div>

          {/* Username */}
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>Username</div>
            <input
              value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Enter username"
              autoComplete="username"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = '#334155'}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Password</div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                onKeyDown={handleKeyDown}
                placeholder="Enter password"
                autoComplete="current-password"
                style={{ ...inputStyle, padding: '10px 40px 10px 14px' }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = '#ebf3ff'}
              />
              <button
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', fontSize: 14, padding: 0,
                }}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(207, 0, 0, 0.42)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 6, padding: '8px 12px', color: '#f87171',
              fontSize: 12, marginBottom: 12,
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={!username || !password || loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8, border: 'none',
              background: (!username || !password || loading) ? '#1e3a5f' : '#3b82f6',
              color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: (!username || !password || loading) ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s', letterSpacing: '0.03em',
            }}
          >
            {loading ? '⏳ Signing in...' : 'Sign in →'}
          </button>

          <div style={{ marginTop: 24, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
            YOLOIntel · v2.4.1 · Hyderabad, IN
          </div>

        </div>
      </div>
    </div>
  )
}