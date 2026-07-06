const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const supabase = require('./supabaseClient');
const { sendVerificationCode } = require('./email');

const router = express.Router();

const CODE_TTL_MS        = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS  = 5;
const JWT_EXPIRES_IN     = '30d';
const EMAIL_RE           = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the 4-item checklist in the design (A2/A3): length, case mix,
// digit, special char. Frontend runs the same rules for live feedback, but
// the backend is the actual gate — never trust the client for this.
function checkPasswordRules(password) {
  const pw = typeof password === 'string' ? password : '';
  return {
    minLength:  pw.length >= 8,
    upperLower: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    digit:      /\d/.test(pw),
    special:    /[^A-Za-z0-9]/.test(pw),
  };
}
const passwordIsValid = rules => rules.minLength && rules.upperLower && rules.digit && rules.special;

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const issueToken = user =>
  jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// Auth is not optional the way Supabase-backed translation logging is —
// every route here needs it, so fail loudly up front instead of per-route.
router.use((req, res, next) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase не настроен' });
  next();
});

router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Введите корректный email' });
  }
  const rules = checkPasswordRules(password);
  if (!passwordIsValid(rules)) {
    return res.status(400).json({ error: 'Пароль не соответствует требованиям', rules });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { data: existing, error: lookupErr } = await supabase
    .from('users').select('id, email_verified').eq('email', normalizedEmail).maybeSingle();
  if (lookupErr) { console.error('[auth] signup lookup error:', lookupErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }

  if (existing && existing.email_verified) {
    return res.status(409).json({ error: 'Этот email уже зарегистрирован, войдите' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const code          = generateCode();
  const expiresAt      = new Date(Date.now() + CODE_TTL_MS).toISOString();

  await sendVerificationCode(normalizedEmail, code);

  if (existing) {
    // Unverified signup left mid-flow — resume it rather than dead-ending.
    const { error: updateErr } = await supabase.from('users').update({
      password_hash: passwordHash, name: name || null,
      verification_code: code, verification_code_expires_at: expiresAt, verification_attempts: 0,
    }).eq('id', existing.id);
    if (updateErr) { console.error('[auth] signup resume error:', updateErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
    return res.status(200).json({ userId: existing.id });
  }

  const { data: created, error: insertErr } = await supabase.from('users').insert({
    email: normalizedEmail, password_hash: passwordHash, name: name || null,
    verification_code: code, verification_code_expires_at: expiresAt, verification_attempts: 0,
  }).select('id').single();
  if (insertErr) { console.error('[auth] signup insert error:', insertErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }

  res.status(201).json({ userId: created.id });
});

router.post('/verify-email', async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || typeof code !== 'string') {
    return res.status(400).json({ error: 'Отсутствуют поля: userId, code' });
  }

  const { data: user, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) { console.error('[auth] verify-email lookup error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.email_verified) return res.status(400).json({ error: 'Email уже подтверждён' });

  if (user.verification_attempts >= MAX_CODE_ATTEMPTS) {
    return res.status(429).json({ error: 'Превышено число попыток, запросите новый код' });
  }
  if (!user.verification_code_expires_at || new Date(user.verification_code_expires_at) < new Date()) {
    return res.status(400).json({ error: 'Код истёк, запросите новый' });
  }
  if (user.verification_code !== code) {
    const attempts = user.verification_attempts + 1;
    await supabase.from('users').update({ verification_attempts: attempts }).eq('id', userId);
    return res.status(400).json({
      error: 'Неверный код',
      attemptsRemaining: Math.max(0, MAX_CODE_ATTEMPTS - attempts),
    });
  }

  const { error: updateErr } = await supabase.from('users').update({
    email_verified: true, verification_code: null, verification_code_expires_at: null, verification_attempts: 0,
  }).eq('id', userId);
  if (updateErr) { console.error('[auth] verify-email update error:', updateErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }

  const token = issueToken(user);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

router.post('/resend-code', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Отсутствует поле: userId' });

  const { data: user, error } = await supabase
    .from('users').select('id, email, email_verified').eq('id', userId).maybeSingle();
  if (error) { console.error('[auth] resend-code lookup error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.email_verified) return res.status(400).json({ error: 'Email уже подтверждён' });

  const code     = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const { error: updateErr } = await supabase.from('users').update({
    verification_code: code, verification_code_expires_at: expiresAt, verification_attempts: 0,
  }).eq('id', userId);
  if (updateErr) { console.error('[auth] resend-code update error:', updateErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }

  await sendVerificationCode(user.email, code);
  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Отсутствуют поля: email, password' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { data: user, error } = await supabase
    .from('users').select('*').eq('email', normalizedEmail).maybeSingle();
  if (error) { console.error('[auth] login lookup error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) return res.status(401).json({ error: 'Неверный email или пароль' });
  if (!user.is_active) return res.status(403).json({ error: 'Аккаунт деактивирован' });
  if (!user.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', userId: user.id });
  }

  const token = issueToken(user);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).sub;
    next();
  } catch {
    res.status(401).json({ error: 'Недействительный токен' });
  }
}

router.get('/me', requireAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users').select('id, email, name, is_active').eq('id', req.userId).maybeSingle();
  if (error) { console.error('[auth] me lookup error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (!user || !user.is_active) return res.status(401).json({ error: 'Не авторизован' });
  res.json({ user });
});

router.requireAuth = requireAuth;
module.exports = router;
