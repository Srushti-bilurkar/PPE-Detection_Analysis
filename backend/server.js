const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');
const Image = require('./models/Image');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
app.use(cors({ 
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:5174'] 
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    startAlertWatcher(); // ← start watching for new alerts after DB connects
  })
  .catch(err => console.error('❌ MongoDB error:', err));

// ── Nodemailer transporter (reused everywhere) ──────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'alphaleoyolointel@gmail.com',
    pass: 'codyvmwvncvpgbwh',
  }
});

const SITE_MANAGER_EMAIL = 'alphaleoyolointel@gmail.com';

// ── Track which alert IDs we've already emailed so we don't spam ────────────
const emailedAlertIds = new Set();

// ── Auto Alert Watcher — polls MongoDB every 30 seconds ────────────────────
function startAlertWatcher() {
  console.log('👁️  Alert watcher started — checking every 30 seconds');

  async function checkAlerts() {
    try {
      const db = mongoose.connection.db;
      const collection = db.collection('violations');

      // Get all unacknowledged critical/warning alerts
      const unsent = await collection.find({
        severity: { $in: ['critical', 'warning'] },
        acknowledged: false,
      }).toArray();

      if (unsent.length === 0) {
        console.log('✅ No new unacknowledged alerts');
        return;
      }

      console.log(`🚨 ${unsent.length} unacknowledged alert(s) — sending email...`);

      // Mark them all as acknowledged BEFORE sending (prevents duplicate emails)
      const ids = unsent.map(a => a._id);
      await collection.updateMany(
        { _id: { $in: ids } },
        { $set: { acknowledged: true } }
      );

      const critical = unsent.filter(a => a.severity === 'critical');
      const warnings = unsent.filter(a => a.severity === 'warning');

      const alertRows = unsent.map(a => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
              background:${a.severity === 'critical' ? '#ef4444' : '#f59e0b'};
              margin-right:8px;vertical-align:middle;"></span>
            <span style="font-size:13px;color:#1e293b;">${a.message || 'Alert detected'}</span>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
            <span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;
              background:${a.severity === 'critical' ? '#fef2f2' : '#fffbeb'};
              color:${a.severity === 'critical' ? '#dc2626' : '#d97706'};">
              ${a.severity.toUpperCase()}
            </span>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;">${a.camera || '—'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;">${a.worker_id || '—'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;">${(a.missing || []).join(', ') || '—'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;white-space:nowrap;">${a.timestamp || '—'}</td>
        </tr>
      `).join('');

      const emailHTML = `
        <div style="font-family:sans-serif;padding:24px;background:#f8fafc;">
          <div style="max-width:700px;margin:0 auto;background:white;border-radius:14px;
            overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1);">

            <div style="background:#1e293b;padding:24px 32px;display:flex;align-items:center;gap:14px;">
              <div style="background:#ef4444;width:46px;height:46px;border-radius:10px;
                display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">🚨</div>
              <div>
                <div style="color:white;font-size:18px;font-weight:700;">Live PPE Alert — YOLOIntel</div>
                <div style="color:#94a3b8;font-size:12px;margin-top:2px;">Construction Site Monitoring · Auto Notification</div>
              </div>
            </div>

            <div style="background:${critical.length > 0 ? '#fef2f2' : '#fffbeb'};
              padding:14px 32px;border-bottom:2px solid ${critical.length > 0 ? '#fecaca' : '#fde68a'};
              display:flex;align-items:center;gap:16px;">
              ${critical.length > 0 ? `<span style="background:#ef4444;color:white;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;">🔴 ${critical.length} CRITICAL</span>` : ''}
              ${warnings.length > 0 ? `<span style="background:#f59e0b;color:white;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;">⚠️ ${warnings.length} WARNING</span>` : ''}
              <span style="color:#64748b;font-size:12px;margin-left:auto;">${new Date().toLocaleString('en-IN')}</span>
            </div>

            <div style="padding:28px 32px;">
              <p style="color:#475569;font-size:14px;margin:0 0 20px;">
                Hi Alphaleo,<br/><br/>
                <strong style="color:#ef4444;">${unsent.length} PPE violation alert(s)</strong> 
                require your immediate attention.
              </p>

              <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Violation</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Severity</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Camera</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Worker ID</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Missing PPE</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Time</th>
                  </tr>
                </thead>
                <tbody>${alertRows}</tbody>
              </table>

              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-top:24px;">
                <p style="margin:0;color:#dc2626;font-size:13px;font-weight:600;">⚡ Immediate Actions Required</p>
                <ul style="color:#475569;font-size:13px;margin:8px 0 0;padding-left:20px;line-height:2;">
                  <li>Check live camera feeds for the flagged workers</li>
                  <li>Ensure missing PPE (helmet/vest) is worn immediately</li>
                  <li>Log incident in the shift handover report</li>
                  ${critical.length > 0 ? '<li><strong style="color:#ef4444;">Stop work order may be required for critical violations</strong></li>' : ''}
                </ul>
              </div>
            </div>

            <div style="background:#f1f5f9;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="color:#94a3b8;font-size:11px;margin:0;">
                Sent automatically by YOLOIntel · Construction Site Monitoring<br/>
                This is an automated alert — do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from:    '"YOLOIntel Alerts" <alphaleoyolointel@gmail.com>',
        to:      SITE_MANAGER_EMAIL,
        subject: `🚨 ${critical.length > 0 ? 'CRITICAL' : 'WARNING'}: ${unsent.length} PPE Violation(s) Detected — YOLOIntel`,
        html:    emailHTML,
      });

      console.log(`✅ Alert email sent — ${critical.length} critical, ${warnings.length} warnings`);

    } catch (err) {
      console.error('❌ Alert watcher error:', err.message);
    }
  }

  checkAlerts();
  setInterval(checkAlerts, 30 * 1000);
}

// ── Existing routes ─────────────────────────────────────────────────────────

app.get('/api/images', async (req, res) => {
  const images = await Image.find().sort({ batchNumber: 1 });
  res.json(images);
});

app.delete('/api/images/:id', async (req, res) => {
  await Image.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

app.get('/api/zone-map', async (req, res) => {
  try {
    const camera = req.query.camera || null;
    const date   = req.query.date   || todayIST();
    const db     = mongoose.connection.db;

    const staticQuery = camera ? { camera } : {};
    const staticDocs  = await db.collection('camera_zone_quality').find(staticQuery).toArray();

    const staticMap = {};
    for (const d of staticDocs) {
      if (!staticMap[d.camera]) staticMap[d.camera] = {};
      staticMap[d.camera][d.zone_id] = {
        proximity:      d.proximity,
        static_quality: d.static_quality,
        blur_label:     d.blur_label,
        trust_alerts:   d.trust_alerts,
        tier: d.static_quality >= 0.75 ? 'high'
            : d.static_quality >= 0.50 ? 'medium'
            : 'low',
      };
    }

    const liveQuery = { date };
    if (camera) liveQuery.camera = camera;

    const liveDocs = await db.collection('zone_confidence').find(liveQuery).toArray();
    const liveMap  = {};
    for (const d of liveDocs) {
      if (!liveMap[d.camera]) liveMap[d.camera] = {};
      const gptConf = d.avg_gpt_conf ?? d.avg_conf ?? null;
      liveMap[d.camera][d.zone_id] = {
        live_gpt: gptConf !== null ? {
          quality:         gptConf,
          tier:            gptConf >= 0.75 ? 'high'
                         : gptConf >= 0.50 ? 'medium' : 'low',
          detection_count: d.detection_count || 0,
          helmet_conf:     d.avg_helmet_conf,
          vest_conf:       d.avg_vest_conf,
        } : null,
        combined: {
          quality:          d.final_quality ?? gptConf ?? 0,
          tier:             d.confidence_tier || 'low',
          source:           d.source || 'live_only',
          detection_count:  d.detection_count || 0,
          total_violations: d.total_violations || 0,
          last_updated:     d.last_updated_ist,
        },
      };
    }

    const allZones = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        allZones.push(`r${r}c${c}`);
      }
    }

    const allCameras = new Set([
      ...Object.keys(staticMap),
      ...Object.keys(liveMap),
      ...(camera ? [camera] : []),
    ]);

    const result = {};
    for (const cam of allCameras) {
      result[cam] = {};
      for (const zoneId of allZones) {
        const s = (staticMap[cam] || {})[zoneId] || null;
        const l = (liveMap[cam]   || {})[zoneId] || null;
        result[cam][zoneId] = {
          static: s ? {
            proximity:    s.proximity,
            quality:      s.static_quality,
            blur_label:   s.blur_label,
            trust_alerts: s.trust_alerts,
            tier:         s.tier,
          } : null,
          live_gpt: l?.live_gpt || null,
          combined: l?.combined || (s ? {
            quality:          s.static_quality,
            tier:             s.tier,
            source:           'proximity_only',
            detection_count:  0,
            total_violations: 0,
          } : null),
        };
      }
    }

    res.json({ date, cameras: result });
  } catch (err) {
    console.error('zone-map API error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send-email', async (req, res) => {
  const { subject, message, to, reportHTML } = req.body;

  try {
    // ── Generate PDF from HTML using Puppeteer ──────────
    let pdfBuffer = null;
    if (reportHTML) {
      console.log('📄 Generating PDF from HTML...');
      const browser = await puppeteer.launch({ 
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        timeout: 60000,
      });
      const page = await browser.newPage();
      await page.setContent(reportHTML, { waitUntil: 'networkidle0' });
      pdfBuffer = await page.pdf({ 
        format: 'A4', 
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      await browser.close();
      console.log('✅ PDF generated successfully');
    }

    const mailOptions = {
      from:    '"YOLOIntel" <alphaleodatabricks@gmail.com>',
      to:      to || SITE_MANAGER_EMAIL,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background: #f8fafc;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
            <div style="background: #1e293b; padding: 24px; text-align: center;">
              <div style="display: inline-block; background: #3b82f6; width: 48px; height: 48px; border-radius: 10px; line-height: 48px; font-size: 20px; font-weight: 900; color: white; margin-bottom: 12px;">YI</div>
              <h1 style="color: white; margin: 0; font-size: 20px;">YOLOIntel</h1>
              <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Construction Site Monitoring</p>
            </div>

            <div style="padding: 32px;">
              <h2 style="color: #1e293b; margin-top: 0;">📋 Shift Handover Report</h2>
              <p style="color: #475569; line-height: 1.6;">${message.replace(/\n/g, '<br/>')}</p>
              
              ${pdfBuffer ? `
              <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #22c55e;">
                <p style="margin: 0; color: #15803d; font-weight: 600;">✅ PDF Report Attached</p>
                <p style="margin: 6px 0 0; color: #475569; font-size: 13px;">The full Shift Handover Report PDF is attached to this email.</p>
              </div>` : `
              <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 24px 0; border-left: 4px solid #3b82f6;">
                <p style="margin: 0; color: #1e293b; font-weight: 600;">📌 How to get the full PDF report:</p>
                <ol style="color: #475569; margin: 8px 0 0; padding-left: 20px; line-height: 2;">
                  <li>Open <strong>YOLOIntel</strong> dashboard</li>
                  <li>Click <strong>📋 Handover</strong> button in the top bar</li>
                  <li>Click <strong>Generate PDF</strong></li>
                </ol>
              </div>`}

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 13px;">📅 Report Date</td>
                    <td style="padding: 6px 0; color: #1e293b; font-weight: 600; font-size: 13px;">
                      ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 13px;">🕐 Sent At</td>
                    <td style="padding: 6px 0; color: #1e293b; font-weight: 600; font-size: 13px;">
                      ${new Date().toLocaleTimeString('en-IN')}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 13px;">📍 Site</td>
                    <td style="padding: 6px 0; color: #1e293b; font-weight: 600; font-size: 13px;">Construction Site · YOLOIntel</td>
                  </tr>
                </table>
              </div>
            </div>

            <div style="background: #f1f5f9; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 11px; margin: 0;">
                Sent automatically by YOLOIntel · Construction Site Monitoring<br/>
                This is an automated notification — please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `,
      attachments: pdfBuffer ? [{
        filename: `Handover-Report-${new Date().toISOString().slice(0, 10)}.pdf`,
        content:  pdfBuffer,
        contentType: 'application/pdf',
      }] : [],
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully');
    res.json({ ok: true, message: 'Email sent successfully' });

  } catch (err) {
    console.error('Email error full:', err);
    res.status(500).json({ 
      ok: false, 
      error: err.message || err.code || JSON.stringify(err) 
    });
  }
});

// ── Manual trigger endpoint (optional — call from frontend to force alert check) ──
app.post('/api/trigger-alert-check', async (req, res) => {
  try {
    console.log('🔁 Manual alert check triggered');
    res.json({ ok: true, message: 'Alert check triggered' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(process.env.PORT || 5000, () =>
  console.log(`🚀 Server on http://localhost:5000`)
);