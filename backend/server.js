require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const OpenAI       = require('openai');
const supabase     = require('./supabaseClient');
const authRouter   = require('./auth');
const scenariosRouter = require('./scenarios');
const { encryptText } = require('./crypto');

// Same never-rejects pattern as scenarios.js's optionalAuth — /translate
// itself stays open to guests, this only attributes the DB log row to a
// user when a valid token happens to be present.
function optionalAuth(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET).sub; } catch { return null; }
}

const app  = express();
// Railway (and most PaaS hosts) inject their own PORT at runtime — the
// hardcoded fallback keeps `npm start` working unchanged for local dev.
const PORT = process.env.PORT || 3000;
// Railway sits in front of the app as a single reverse-proxy hop, setting
// X-Forwarded-For on every request. Without this, express-rate-limit can't
// tell real client IPs apart (everyone looks like the proxy) and logs an
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning on every request.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: false }));
// Raised from 32kb: a /translate body can now carry up to 8 history turns
// (original + translated, each up to MAX_TEXT_LEN) alongside the new text —
// worst case (multi-byte Cyrillic/Korean UTF-8) that's close to 32kb on its
// own before the request's own text and JSON overhead.
app.use(express.json({ limit: '64kb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте позже' },
});
app.use('/translate', limiter);

// Brute-forcing a password or a 6-digit code is a different threat profile
// than translation traffic, so /auth gets its own, stricter limit.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте позже' },
});
app.use('/auth', authLimiter, authRouter);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Scenario CRUD lives in backend/scenarios.js (Supabase-backed — see that
// file). getSystemPrompt() is exported off the router for /translate below,
// same pattern auth.js uses to export requireAuth.
app.use('/scenarios', limiter, scenariosRouter);
app.use('/health', limiter);

app.get('/health', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY не настроен' });
  }
  try {
    await openai.models.retrieve('gpt-4o');
    res.json({ ok: true });
  } catch (error) {
    res.status(502).json({ ok: false, error: 'Нет связи с OpenAI' });
  }
});

// Second bubble is always Korean; the first can be any of these (see the
// frontend's source-language selector, frontend/i18n.js's LANG_RU_NAME).
const ALLOWED_LANGS = [
  'русский', 'корейский', 'английский', 'японский', 'китайский',
  'узбекский', 'казахский', 'киргизский', 'монгольский',
];
const MAX_TEXT_LEN     = 1000;
// Appended to the scenario's own system prompt (same message, not a separate
// one — tested empirically: GPT-4o reliably follows this only when it's part
// of the single system message alongside the scenario prompt; as a second,
// separate system-role message it was consistently ignored and fell back to
// literal, nonsensical word-for-word translation of the idiom).
// One example per direction — an earlier single-example (RU idiom → KO only)
// version translated a KO→RU idiom completely literally, so the rule reads
// as direction-specific here on purpose, with an example each way.
function idiomInstruction(fromLang, toLang) {
  return `Фразеологизмы, идиомы, пословицы и устойчивые выражения нельзя переводить дословно ни в одном направлении (это касается перевода как с ${fromLang} на ${toLang}, так и наоборот) — подбирай существующий эквивалент в языке перевода, а если точного эквивалента нет, передай смысл выражения обычными словами. Например: русское "когда рак на горе свистнет" (значение — "никогда") на корейский переводится через смысловой эквивалент "해가 서쪽에서 뜨면" ("когда солнце взойдёт на западе"), а не дословно про рака и гору; и наоборот, корейское "새 발의 피" (буквально "кровь из птичьей лапки", значение — "ничтожно малое количество") на русский переводится как "капля в море", а не буквальным описанием птичьей лапки.`;
}
// Mirrors the frontend's MAX_CONTEXT_TURNS/session-gap logic (App.js) — the
// client is trusted to pick the right turns (same-scenario, <2h idle gaps),
// but length/shape are re-validated here since request bodies aren't trusted
// as-is (a client bug or a hand-crafted request could send anything).
const MAX_HISTORY_TURNS = 8;

// Drops anything malformed and caps size, but does not re-derive the 2h
// session/scenario logic — that's the frontend's job (it has the full
// history with timestamps; the backend only ever sees whatever slice it's
// sent for this one request).
function sanitizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .filter(h => h && typeof h.original === 'string' && typeof h.translated === 'string'
      && (h.direction === 'ru-ko' || h.direction === 'ko-ru'))
    .slice(-MAX_HISTORY_TURNS)
    .map(h => ({
      original:   h.original.slice(0, MAX_TEXT_LEN),
      translated: h.translated.slice(0, MAX_TEXT_LEN),
    }));
}

app.post('/translate', async (req, res) => {
  const { text, fromLang, toLang, context, history } = req.body;

  if (!text || !fromLang || !toLang) {
    return res.status(400).json({ error: 'Отсутствуют поля: text, fromLang, toLang' });
  }
  if (!ALLOWED_LANGS.includes(fromLang) || !ALLOWED_LANGS.includes(toLang)) {
    return res.status(400).json({ error: 'Недопустимое значение языка' });
  }
  if (typeof text !== 'string' || text.length > MAX_TEXT_LEN) {
    return res.status(400).json({ error: `Текст не должен превышать ${MAX_TEXT_LEN} символов` });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY не настроен' });
  }

  const systemPrompt   = await scenariosRouter.getSystemPrompt(context, fromLang, toLang);
  const contextHistory = sanitizeHistory(history);
  if (history !== undefined) {
    console.log(`[translate] context turns received=${Array.isArray(history) ? history.length : 'n/a'} used=${contextHistory.length}`);
  }

  const messages = [
    { role: 'system', content: `${systemPrompt}\n\n${idiomInstruction(fromLang, toLang)}` },
  ];
  if (contextHistory.length) {
    const transcript = contextHistory
      .map((h, i) => `${i + 1}. ${h.original} → ${h.translated}`)
      .join('\n');
    messages.push({
      role: 'system',
      content: `Недавние реплики этого же разговора — используй их, чтобы понять, к кому/чему относятся подлежащие, дополнения и местоимения, опущенные в новой реплике (в корейском это обычная норма), и корректно выбрать род/число/явную отсылку в переводе там, где целевой язык не допускает такого опущения (например, род глагола прошедшего времени в русском). Не переводи и не пересказывай сами эти реплики — они только справочный контекст для новой:\n${transcript}`,
    });
  }
  messages.push({ role: 'user', content: text });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
    });

    const translation = completion.choices[0]?.message?.content?.trim() || '';

    // Logging is skipped (not fallen back to plaintext) when the encryption
    // key isn't configured — same "optional side effect, degrade by skipping"
    // pattern as Supabase/Resend elsewhere, but here silently writing
    // plaintext would defeat the point of encrypting it at all.
    if (supabase && process.env.TRANSLATIONS_ENC_KEY) {
      supabase.from('translations').insert({
        original_text:   encryptText(text),
        translated_text: encryptText(translation),
        from_lang:       fromLang,
        to_lang:         toLang,
        scenario:        context || null,
        user_id:         optionalAuth(req),
      }).then(({ error: dbErr }) => {
        if (dbErr) console.warn('Supabase insert error:', dbErr.message);
      });
    } else if (supabase) {
      console.warn('[translate] TRANSLATIONS_ENC_KEY не настроен — запись в translations пропущена');
    }

    res.json({ translation });
  } catch (error) {
    console.error('OpenAI error:', error.message);
    res.status(500).json({ error: 'Ошибка перевода' });
  }
});

// ── Supabase keep-alive ──────────────────────────────────────────────────
// Supabase's free tier pauses (and eventually deletes) a project after
// about a week of no API activity. This app's real traffic is low/bursty
// (personal 2-user app), so a quiet week is entirely plausible — this is a
// trivial, harmless query run on a timer purely to register activity and
// keep the project alive, independent of whether anyone actually opens the
// app. No-op if Supabase isn't configured, same as everywhere else that
// treats it as optional.
const SUPABASE_KEEPALIVE_MS = 24 * 60 * 60 * 1000; // once a day — comfortably under the ~7-day pause window
if (supabase) {
  const pingSupabaseKeepAlive = () => {
    supabase.from('scenarios').select('id').limit(1)
      .then(({ error }) => { if (error) console.error('Supabase keep-alive query failed:', error.message); })
      .catch(err => console.error('Supabase keep-alive query failed:', err.message));
  };
  pingSupabaseKeepAlive();
  setInterval(pingSupabaseKeepAlive, SUPABASE_KEEPALIVE_MS);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Translator backend запущен на http://0.0.0.0:${PORT}`);
});
