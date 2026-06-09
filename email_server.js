import express    from 'express'
import nodemailer from 'nodemailer'
import cors       from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const GMAIL_USER = 'alphaleoyolointel@gmail.com'
const GMAIL_PASS = 'codyvmwvncvpgbwh'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_PASS },
})

// ─── Helper: derive PPE missing text ────────────────────────────────────────
function getPPEMissing(violation = '') {
  const v = violation.toLowerCase()
  const noHelmet = v.includes('helmet') || v.includes('hard hat') || v.includes('no_helmet')
  const noVest   = v.includes('vest')   || v.includes('jacket')   || v.includes('no_vest')

  if (noHelmet && noVest) return { label: 'Helmet & Safety Vest', color: '#dc2626' }
  if (noHelmet)           return { label: 'Helmet',               color: '#ea580c' }
  if (noVest)             return { label: 'Safety Vest',          color: '#d97706' }
  return                         { label: 'PPE (Unknown)',         color: '#7c3aed' }
}

// ─── Helper: severity badge style ───────────────────────────────────────────
function severityStyle(severity = 'WARNING') {
  const s = severity.toUpperCase()
  if (s === 'CRITICAL') return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
  if (s === 'WARNING')  return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }
  return                       { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' }
}

// ─── HTML email builder ──────────────────────────────────────────────────────
function buildEmailHTML({ location, alerts, reportDate }) {
  const hasCritical = alerts.some(a => a.severity?.toUpperCase() === 'CRITICAL')
  const headerColor = hasCritical ? '#dc2626' : '#d97706'
  const headerBg    = hasCritical ? '#7f1d1d' : '#431407'

  const alertRows = alerts.map((a, i) => {
    const ppe = getPPEMissing(a.violation || a.violationType || '')
    const sev = severityStyle(a.severity)
    return `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'}">
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px;color:#374151">${a.worker || '—'}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${a.camera || '—'}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
        <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${ppe.color}22;color:${ppe.color};border:1px solid ${ppe.color}55">
          ⚠ Missing: ${ppe.label}
        </span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb">
        <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${sev.bg};color:${sev.text};border:1px solid ${sev.border}">
          ${(a.severity || 'WARNING').toUpperCase()}
        </span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${a.time || reportDate}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Safety Violation Alert – ${location}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%">

        <!-- Header -->
        <tr>
          <td style="background:${headerBg};border-radius:12px 12px 0 0;padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;color:${headerColor};text-transform:uppercase">YOLOIntel Monitoring System</p>
                  <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff">🚨 Safety Violation Alert</h1>
                  <p style="margin:8px 0 0;font-size:16px;color:#d1d5db">📍 Location: <strong style="color:#ffffff">${location}</strong></p>
                </td>
                <td align="right" valign="top">
                  <span style="display:inline-block;padding:6px 14px;background:${headerColor};border-radius:6px;font-size:13px;font-weight:700;color:#ffffff">
                    ${alerts.length} Violation${alerts.length !== 1 ? 's' : ''}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Summary bar -->
        <tr>
          <td style="background:#1f2937;padding:14px 32px">
            <p style="margin:0;font-size:13px;color:#9ca3af">
              Report generated: <strong style="color:#f9fafb">${reportDate}</strong>
              &nbsp;|&nbsp; Please review the Safety Dashboard immediately.
            </p>
          </td>
        </tr>

        <!-- Alert table -->
        <tr>
          <td style="background:#ffffff;padding:24px 32px">
            <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px">
              Violation Details
            </h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Worker ID</th>
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Camera</th>
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">PPE Missing</th>
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Severity</th>
                  <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb">Time</th>
                </tr>
              </thead>
              <tbody>${alertRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Action button -->
        <tr>
          <td style="background:#ffffff;padding:0 32px 28px">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#dc2626;border-radius:8px">
                  <a href="#" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">
                    🔍 Open Safety Dashboard →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="background:#ffffff;padding:0 32px"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0"/></td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#ffffff;border-radius:0 0 12px 12px;padding:20px 32px">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
              This is an automated alert from the <strong>YOLOIntel Safety Monitoring System</strong>.<br/>
              Please do not reply to this email. For support, contact your site safety officer.<br/><br/>
              <strong style="color:#6b7280">Thank you for keeping your site safe. 🙏</strong>
            </p>
          </td>
        </tr>

        <!-- Bottom strip -->
        <tr>
          <td style="padding:16px 0;text-align:center">
            <p style="margin:0;font-size:11px;color:#9ca3af">© ${new Date().getFullYear()} YOLOIntel · Automated Safety Intelligence</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Route: send one email (legacy / simple) ─────────────────────────────────
app.post('/api/send-email', async (req, res) => {
  const { to, subject, message, reportHTML } = req.body
  if (!to || !subject || !message) {
    return res.status(400).json({ ok: false, error: 'Missing to/subject/message' })
  }
  try {
    await transporter.sendMail({
      from: `"YOLOIntel Safety System" <${GMAIL_USER}>`,
      to,
      subject,
      text: message,
      ...(reportHTML ? {
        attachments: [{
          filename:    `YOLOIntel_Report_${new Date().toISOString().split('T')[0]}.html`,
          content:     reportHTML,
          contentType: 'text/html',
        }]
      } : {}),
    })
    console.log(`[EmailServer] ✅ Sent to ${to}: ${subject}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[EmailServer] ❌ Failed:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ─── Route: send grouped-by-location emails ──────────────────────────────────
//
//  POST /api/send-violation-alerts
//  Body: {
//    to: "recipient@example.com",          // or array of recipients
//    reportDate: "9/6/2026, 11:40:15 am",
//    alerts: [
//      {
//        location:    "Bangalore",
//        worker:      "Img365-P1",
//        camera:      "Pier_Cap_Cam_16389",
//        severity:    "CRITICAL",           // "CRITICAL" | "WARNING" | "INFO"
//        violation:   "no_helmet",          // free text: "no_helmet", "no_vest", "no_helmet no_vest", etc.
//        time:        "9/6/2026, 11:40:15 am"
//      },
//      ...
//    ]
//  }
//
app.post('/api/send-violation-alerts', async (req, res) => {
  const { to, alerts, reportDate } = req.body

  if (!to || !Array.isArray(alerts) || alerts.length === 0) {
    return res.status(400).json({ ok: false, error: 'Missing to or alerts[]' })
  }

  const date = reportDate || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

  // Group alerts by location
  const byLocation = {}
  for (const alert of alerts) {
    const loc = alert.location || 'Unknown Location'
    if (!byLocation[loc]) byLocation[loc] = []
    byLocation[loc].push(alert)
  }

  const results = []

  for (const [location, locationAlerts] of Object.entries(byLocation)) {
    const hasCritical = locationAlerts.some(a => a.severity?.toUpperCase() === 'CRITICAL')
    const subject = `${hasCritical ? '🚨 [CRITICAL]' : '⚠️ [WARNING]'} PPE Violation – ${location} – ${date}`

    const html = buildEmailHTML({ location, alerts: locationAlerts, reportDate: date })

    // Plain-text fallback
    const plainLines = locationAlerts.map(a => {
      const ppe = getPPEMissing(a.violation || a.violationType || '')
      return `• Worker: ${a.worker || '—'} | Camera: ${a.camera || '—'} | Missing: ${ppe.label} | Severity: ${(a.severity || 'WARNING').toUpperCase()} | Time: ${a.time || date}`
    })
    const plain = [
      `Safety Violation Alert – ${location}`,
      `Date: ${date}`,
      ``,
      `Violations detected at ${location}:`,
      ...plainLines,
      ``,
      `Please review the Safety Dashboard immediately.`,
      ``,
      `Thank you,`,
      `YOLOIntel Safety Monitoring System`,
    ].join('\n')

    try {
      await transporter.sendMail({
        from: `"YOLOIntel Safety System" <${GMAIL_USER}>`,
        to,
        subject,
        text: plain,
        html,
      })
      console.log(`[EmailServer] ✅ Sent alert for "${location}" to ${to}`)
      results.push({ location, ok: true })
    } catch (err) {
      console.error(`[EmailServer] ❌ Failed for "${location}":`, err.message)
      results.push({ location, ok: false, error: err.message })
    }
  }

  const allOk = results.every(r => r.ok)
  res.status(allOk ? 200 : 207).json({ ok: allOk, results })
})

app.listen(5000, () => {
  console.log('[EmailServer] 🚀 Running on http://localhost:5000')
})
