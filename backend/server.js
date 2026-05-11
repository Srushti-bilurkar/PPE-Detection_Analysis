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
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

app.get('/api/images', async (req, res) => {
  const images = await Image.find().sort({ batchNumber: 1 });
  res.json(images);
});

app.delete('/api/images/:id', async (req, res) => {
  await Image.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.post('/api/send-email', async (req, res) => {
  const { subject, message, to, reportHTML } = req.body;

  try {
    // ── Generate PDF from HTML using Puppeteer ──────────
    let pdfBuffer = null;
    if (reportHTML) {
      console.log('📄 Generating PDF from HTML...');
      const browser = await puppeteer.launch({ 
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
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

    // ── Send Email ──────────────────────────────────────
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'alphaleodatabricks@gmail.com',
        pass: 'oolskzpmfwbshtaw',
      }
    });

    const mailOptions = {
      from:    '"YOLOIntel" <alphaleodatabricks@gmail.com>',
      to:      to || 'alphaleodatabricks@gmail.com',
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
                <p style="margin: 6px 0 0; color: #475569; font-size: 13px;">
                  The full Shift Handover Report PDF is attached to this email.
                </p>
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
                    <td style="padding: 6px 0; color: #1e293b; font-weight: 600; font-size: 13px;">
                      Construction Site · YOLOIntel
                    </td>
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

app.listen(process.env.PORT || 5000, () =>
  console.log(`🚀 Server on http://localhost:5000`)
);