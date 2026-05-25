export default function Milestones() {
  /* ── milestone data — matches original HTML cards ─────────── */
  const items = [
    { icon: '🏗️', name: 'Site Clearance',        status: 'complete',    progress: 100, date: 'Verified Jan 15 · 2 photos' },
    { icon: '⛏️', name: 'Foundation / Piling',    status: 'complete',    progress: 100, date: 'Verified Feb 02 · 4 photos' },
    { icon: '🪨', name: 'Slab Pour — Tower A',    status: 'complete',    progress: 100, date: 'Verified Feb 10 · 6 photos' },
    { icon: '🔩', name: 'Structural Steel — A',   status: 'in-progress', progress: 88,  date: 'Est. complete Feb 22'        },
    { icon: '⚡', name: 'Structural Steel — B',   status: 'at-risk',     progress: 64,  date: 'Est. complete Mar 04 (+6d)'  },
    { icon: '🔧', name: 'MEP Rough-In — A',       status: 'in-progress', progress: 52,  date: 'Est. complete Mar 10'        },
    { icon: '🧱', name: 'Drywall Hang L1-3',      status: 'pending',     progress: 0,   date: 'Starts Mar 15 (planned)'    },
    { icon: '🏠', name: 'Exterior Roofing',        status: 'pending',     progress: 0,   date: 'Starts Apr 20 (planned)',   notStarted: true },
  ]

  /* ── status label — matches original dot/symbol convention ── */
  const statusLabel = (s, notStarted) => {
    if (s === 'complete')    return '● COMPLETE'
    if (s === 'in-progress') return '◐ IN PROGRESS'
    if (s === 'at-risk')     return '⚠ AT RISK'
    return notStarted ? '○ NOT STARTED' : '○ PENDING'
  }

  /* ── photo evidence data ────────────────────────────────────── */
  const photos = [
    {
      bg: 'linear-gradient(135deg,#0d1828,#152438)', emoji: '🪨',
      verified: 'AI VERIFIED ✓',
      label: 'Before Pour — Rebar Set',
      meta:  'CAM-A03 · Feb 08 06:42 · Conf: 96%',
    },
    {
      bg: 'linear-gradient(135deg,#121e32,#1a2d48)', emoji: '🏗️',
      verified: 'AI VERIFIED ✓',
      label: 'Pour in Progress',
      meta:  'CAM-A03 · Feb 09 09:15 · Conf: 91%',
    },
    {
      bg: 'linear-gradient(135deg,#0f1c30,#182840)', emoji: '✅',
      verified: 'HUMAN VERIFIED ✓',
      label: 'Pour Complete — Cured',
      meta:  'CAM-A03 · Feb 10 07:00 · Verified by R.Singh',
    },
  ]

  return (
    <div className="screen active" id="screen-milestones">

      {/* ── milestone cards grid ───────────────────────────────── */}
      <div className="milestone-grid mb-20">
        {items.map(m => (
          <div key={m.name} className={`milestone-card ${m.status}`}>
            <div className="milestone-icon">{m.icon}</div>
            <div className="milestone-name">{m.name}</div>
            <div className="milestone-status">{statusLabel(m.status, m.notStarted)}</div>
            <div className="milestone-progress">
              <div
                className="milestone-progress-fill"
                style={m.progress > 0 ? { width: `${m.progress}%` } : undefined}
              />
            </div>
            <div className="milestone-date">{m.date}</div>
          </div>
        ))}
      </div>

      {/* ── photo evidence panel ───────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">📸 Milestone Photo Evidence — Slab Pour Tower A</div>
          <div className="panel-subtitle">3 verified captures · Feb 8–10</div>
        </div>

        <div className="panel-body">
          <div className="photo-gallery">
            {photos.map(p => (
              <div key={p.label} className="photo-card">
                <div className="photo-thumb">
                  <div className="photo-placeholder" style={{ background: p.bg }}>
                    {p.emoji}
                  </div>
                  <div className="photo-verified">{p.verified}</div>
                </div>
                <div className="photo-info">
                  <div className="photo-milestone">{p.label}</div>
                  <div className="photo-meta">{p.meta}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── pending verification notice ─────────────────────── */}
          <div style={{
            marginTop: 14, padding: 12,
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ⚠ Pending Verification:{' '}
              <strong style={{ color: 'var(--amber)' }}>
                Structural Steel B – AI confidence 84%
              </strong>
              {' '}— requires engineer sign-off
            </div>
            <button
              className="topbar-btn primary"
              style={{ padding: '6px 14px', fontSize: 11, marginLeft: 'auto' }}
            >
              Review &amp; Verify
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
