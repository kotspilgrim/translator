const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Always log server-side — harmless on a self-hosted box, and keeps the
// existing local-dev flow (reading the code off the console) working even
// once Resend is configured. Without RESEND_API_KEY this is the only effect,
// same as before this module existed.
async function sendVerificationCode(to, code) {
  console.log(`[auth] verification code for ${to}: ${code}`);
  if (!resend) return;

  try {
    // The Resend SDK does NOT throw on API-level failures (bad from-address,
    // unverified domain, over quota, etc.) — it resolves normally with
    // { data: null, error: {...} }. Catching only exceptions would silently
    // treat those as success, so check `error` explicitly too.
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: 'Код подтверждения',
      html: `<p>Ваш код подтверждения: <b>${code}</b></p><p>Код действителен 10 минут.</p>`,
      text: `Ваш код подтверждения: ${code}\nКод действителен 10 минут.`,
    });
    if (error) console.error('[auth] Resend send error:', error.message || error);
  } catch (err) {
    // Don't fail the signup/resend request over a transient email-provider
    // error — the code is already saved in the DB, and /auth/resend-code
    // exists precisely so the user can ask for another attempt.
    console.error('[auth] Resend send error:', err.message);
  }
}

module.exports = { sendVerificationCode };
