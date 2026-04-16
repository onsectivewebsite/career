const nodemailer = require('nodemailer');

function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.MAIL_FROM_ADDRESS,
      pass: process.env.MAIL_FROM_PASSWORD
    }
  });
}

const transporter = makeTransport();

// Verify on boot but do not crash the app if it fails — log and continue
transporter.verify().then(
  () => console.log('[mailer] SMTP ready:', process.env.MAIL_FROM_ADDRESS),
  (err) => console.warn('[mailer] SMTP verify failed:', err.message)
);

function fromHeader() {
  const name = process.env.MAIL_FROM_NAME || 'Onsective Careers';
  const address = process.env.MAIL_FROM_ADDRESS;
  return `"${name}" <${address}>`;
}

async function sendMail({ to, subject, html, text, replyTo }) {
  if (!to) return;
  try {
    await transporter.sendMail({
      from: fromHeader(),
      replyTo: replyTo || process.env.MAIL_CAREERS_ADDRESS || process.env.MAIL_INFO_ADDRESS,
      to,
      subject,
      html,
      text: text || (html ? html.replace(/<[^>]+>/g, ' ') : subject)
    });
  } catch (err) {
    console.error('[mailer] sendMail error:', err.message);
  }
}

function wrap(body) {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f6f7fb;padding:24px;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="padding:18px 24px;background:#0b1220;color:#fff;font-weight:600;font-size:16px;letter-spacing:.2px">Onsective</div>
      <div style="padding:24px;font-size:15px;line-height:1.55">${body}</div>
      <div style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb">
        You received this email from Onsective Inc. For questions, reply to this message or contact
        <a href="mailto:${process.env.MAIL_CAREERS_ADDRESS}" style="color:#2563eb">${process.env.MAIL_CAREERS_ADDRESS}</a>.
      </div>
    </div>
  </body></html>`;
}

const templates = {
  applicationReceived({ name, jobTitle, appUrl }) {
    return wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for applying for <strong>${escapeHtml(jobTitle)}</strong> at Onsective. We received your application and our team will review it shortly.</p>
      <p>You can track the status of your application in your candidate dashboard:</p>
      <p><a href="${appUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">View my applications</a></p>
      <p>— The Onsective Careers Team</p>
    `);
  },
  applicationStatus({ name, jobTitle, status, note, appUrl }) {
    return wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your application for <strong>${escapeHtml(jobTitle)}</strong> has been updated to <strong>${escapeHtml(status)}</strong>.</p>
      ${note ? `<p><em>Note from the team:</em><br>${escapeHtml(note).replace(/\n/g, '<br>')}</p>` : ''}
      <p><a href="${appUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">View details</a></p>
      <p>— The Onsective Careers Team</p>
    `);
  },
  referralInvite({ candidateName, referrerName, jobTitle, jobUrl }) {
    return wrap(`
      <p>Hi ${escapeHtml(candidateName)},</p>
      <p><strong>${escapeHtml(referrerName)}</strong> from Onsective thought you'd be a strong fit for our <strong>${escapeHtml(jobTitle)}</strong> role and referred you directly.</p>
      <p>If you'd like to take a look and apply, your referral is already on file — just use the link below so it's credited correctly.</p>
      <p><a href="${jobUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">See the role &amp; apply</a></p>
      <p>Good luck!<br>— The Onsective Careers Team</p>
    `);
  },
  referralConfirmation({ referrerName, candidateName, jobTitle }) {
    return wrap(`
      <p>Hi ${escapeHtml(referrerName)},</p>
      <p>Thanks for referring <strong>${escapeHtml(candidateName)}</strong> for the <strong>${escapeHtml(jobTitle)}</strong> role.</p>
      <p>We have recorded your referral. You will be notified as the candidate's application progresses.</p>
      <p>— The Onsective Careers Team</p>
    `);
  },
  adminNewApplication({ jobTitle, candidateName, candidateEmail, adminUrl }) {
    return wrap(`
      <p>A new application was submitted.</p>
      <ul>
        <li><strong>Role:</strong> ${escapeHtml(jobTitle)}</li>
        <li><strong>Candidate:</strong> ${escapeHtml(candidateName)} (${escapeHtml(candidateEmail)})</li>
      </ul>
      <p><a href="${adminUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">Review in dashboard</a></p>
    `);
  },
  passwordReset({ name, url }) {
    return wrap(`
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received a request to reset your password. This link will expire in 1 hour.</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">Reset password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `);
  }
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { sendMail, templates };
