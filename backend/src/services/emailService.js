/**
 * Email alerts via Resend (free tier: 10k emails/month)
 * Set RESEND_API_KEY in Railway env vars
 * Set ALERT_EMAIL to the recipient address
 */
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const FROM_EMAIL  = process.env.FROM_EMAIL  || 'DemandAI <alerts@demandai.app>';
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY || !to) {
    console.log(`[Email skipped] ${subject}`);
    return { skipped: true };
  }
  try {
    const { Resend } = require('resend');
    const resend = new Resend(RESEND_KEY);
    const result = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
    console.log(`[Email sent] ${subject} → ${to}`);
    return result;
  } catch (err) {
    console.error(`[Email failed] ${err.message}`);
    return { error: err.message };
  }
}

function emailTemplate(title, body, color = '#6366f1') {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#080c14;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1));border:1px solid rgba(99,102,241,0.25);border-radius:16px;padding:28px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;">⚡</div>
        <span style="font-size:16px;font-weight:800;color:#f1f5f9;">DemandAI</span>
      </div>
      <div style="width:100%;height:3px;background:${color};border-radius:2px;margin-bottom:20px;"></div>
      <h1 style="font-size:20px;font-weight:800;color:#f1f5f9;margin:0 0 12px;">${title}</h1>
      <div style="font-size:14px;color:#94a3b8;line-height:1.6;">${body}</div>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#475569;">
        Sent by DemandAI · ${new Date().toLocaleString()}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Alert functions ──────────────────────────────────────────────

async function sendLowStockAlert(products) {
  if (!products?.length) return;
  const rows = products.map(p =>
    `<div style="padding:10px 14px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;margin-bottom:8px;">
      <strong style="color:#f87171;">${p.name}</strong>
      <span style="color:#94a3b8;margin-left:8px;">${p.category}</span>
      <span style="float:right;color:#ef4444;font-weight:700;">${p.stock} units left</span>
    </div>`
  ).join('');

  return sendEmail(
    ALERT_EMAIL,
    `⚠️ Low Stock Alert — ${products.length} product(s) need reorder`,
    emailTemplate(
      `${products.length} Product${products.length > 1 ? 's' : ''} Running Low`,
      `The following products are critically low on stock and require immediate reorder:<br><br>${rows}<br>
      <a href="${process.env.FRONTEND_URL || 'https://demand-prediction-system-using-mach.vercel.app'}/inventory" 
         style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:10px;text-decoration:none;font-weight:700;margin-top:8px;">
        View Inventory →
      </a>`,
      '#ef4444'
    )
  );
}

async function sendDriftAlert(psi, alerts) {
  return sendEmail(
    ALERT_EMAIL,
    `🤖 Model Drift Detected — PSI: ${psi}`,
    emailTemplate(
      'Model Drift Detected',
      `Your demand prediction model has detected significant drift:<br><br>
      <div style="padding:14px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;margin-bottom:12px;">
        <strong style="color:#fbbf24;">PSI Score: ${psi}</strong> (threshold: 0.2)
      </div>
      ${alerts.map(a => `<p style="color:#94a3b8;">• ${a}</p>`).join('')}
      <br>
      <a href="${process.env.FRONTEND_URL || 'https://demand-prediction-system-using-mach.vercel.app'}/analytics"
         style="display:inline-block;padding:10px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">
        View Analytics →
      </a>`,
      '#f59e0b'
    )
  );
}

async function sendRetrainComplete(metrics) {
  return sendEmail(
    ALERT_EMAIL,
    `✅ Model Retrained Successfully`,
    emailTemplate(
      'Model Retrained',
      `Your demand prediction model has been successfully retrained with the latest data:<br><br>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:16px 0;">
        ${[
          { label: 'MAE', value: metrics?.mae ?? '—' },
          { label: 'R²',  value: metrics?.r2  ?? '—' },
          { label: 'MAPE', value: metrics?.mape ? `${metrics.mape}%` : '—' },
        ].map(m => `
          <div style="padding:12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:10px;text-align:center;">
            <div style="font-size:20px;font-weight:800;color:#6366f1;">${m.value}</div>
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">${m.label}</div>
          </div>`).join('')}
      </div>`,
      '#10b981'
    )
  );
}

module.exports = { sendLowStockAlert, sendDriftAlert, sendRetrainComplete };
