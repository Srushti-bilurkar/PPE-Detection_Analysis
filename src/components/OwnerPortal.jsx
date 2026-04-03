export default function OwnerPortal() {
  /* ── EV metric cards ─────────────────────────────────────── */
  const evCards = [
    { label: 'OVERALL COMPLETE',  value: '38%',    valueColor: 'var(--blue-vivid)', sub: 'vs. 41% planned'      },
    { label: 'SCHEDULE STATUS',   value: 'AMBER',   valueColor: 'var(--amber)',      sub: '+6 days variance'     },
    { label: 'MILESTONES MET',    value: '5/8',     valueColor: 'var(--green-safe)', sub: 'All on time or early' },
    { label: 'WORKERS ON-SITE',   value: '247',     valueColor: 'var(--cyan)',       sub: 'Today · Peak shift'   },
    { label: 'FORECAST COMPLETE', value: "Nov '25", valueColor: 'var(--amber)',      sub: "Was Oct '25"          },
  ]

  /* ── photo evidence cards ────────────────────────────────── */
  const photos = [
    {
      bg: 'linear-gradient(135deg,#0d1828,#152438)', emoji: '⛏️',
      verified: 'HUMAN VERIFIED ✓',
      label: 'Foundation Complete',
      meta:  'Feb 02 · Tower A & B',
    },
    {
      bg: 'linear-gradient(135deg,#0f1c30,#182840)', emoji: '🪨',
      verified: 'HUMAN VERIFIED ✓',
      label: 'Slab Pour — Tower A',
      meta:  'Feb 10 · L1 Complete',
    },
    {
      bg: 'linear-gradient(135deg,#121e32,#1a2d48)', emoji: '🔩',
      verified: 'AI ESTIMATED',
      label: 'Steel Erection — A (88%)',
      meta:  'Feb 17 · In progress',
    },
  ]

  /* ── schedule health rows ────────────────────────────────── */
  const scheduleRows = [
    { label: 'Tower A Steel',  chip: 'green', tag: '+1d AHEAD',  border: true  },
    { label: 'Tower B Steel',  chip: 'amber', tag: '-4d BEHIND', border: true  },
    { label: 'MEP Rough-In A', chip: 'blue',  tag: '-1d ON TRACK', border: true },
    { label: 'Drywall L1-3',   chip: 'red',   tag: '-8d AT RISK', border: false },
  ]

  return (
    <div className="screen active" id="screen-owner-portal">

      {/* ── header ──────────────────────────────────────────── */}
      <div className="owner-header">
        <div className="owner-project">PROJECT · PRESTIGE TOWERS — PHASE 1</div>
        <div className="owner-title">Executive Progress Dashboard</div>
        <div className="owner-meta">
          As of Feb 18, 2025 · Data verified by: Raj Singh, Safety Officer ·{' '}
          <span style={{ color: 'var(--blue-vivid)' }}>AI-Assisted Monitoring Active</span>
        </div>
      </div>

      {/* ── EV cards ────────────────────────────────────────── */}
      <div className="ev-cards mb-16">
        {evCards.map(c => (
          <div key={c.label} className="ev-card">
            <div className="ev-label">{c.label}</div>
            <div className="ev-value" style={{ color: c.valueColor }}>{c.value}</div>
            <div className="ev-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 60/40 grid ──────────────────────────────────────── */}
      <div className="grid-60-40">

        {/* left — photo evidence ──────────────────────────── */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">📸 Milestone Photo Evidence</div>
            <div className="panel-subtitle">AI + Human Verified</div>
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
          </div>
        </div>

        {/* right — schedule health + safety index ──────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* schedule health */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Schedule Health</div>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {scheduleRows.map(r => (
                  <div
                    key={r.label}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: r.border ? '1px solid var(--border)' : undefined,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{r.label}</span>
                    <span className={`chip ${r.chip}`}>{r.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* safety index */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Safety Index</div>
            </div>
            <div className="panel-body" style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 46,
                fontWeight: 800, color: 'var(--green-safe)',
              }}>
                A−
              </div>
              <div className="text-xs text-muted" style={{ margin: '4px 0 10px' }}>
                91% PPE compliance · 7 open alerts
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                0 lost-time incidents this month
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
