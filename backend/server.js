require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const OpenAI       = require('openai');
const supabase     = require('./supabaseClient');
const authRouter   = require('./auth');
const scenariosRouter = require('./scenarios');

const app  = express();
// Railway (and most PaaS hosts) inject their own PORT at runtime — the
// hardcoded fallback keeps `npm start` working unchanged for local dev.
const PORT = process.env.PORT || 3000;

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

  const messages = [{ role: 'system', content: systemPrompt }];
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

    if (supabase) {
      supabase.from('translations').insert({
        original_text:   text,
        translated_text: translation,
        from_lang:       fromLang,
        to_lang:         toLang,
        scenario:        context || null,
      }).then(({ error: dbErr }) => {
        if (dbErr) console.warn('Supabase insert error:', dbErr.message);
      });
    }

    res.json({ translation });
  } catch (error) {
    console.error('OpenAI error:', error.message);
    res.status(500).json({ error: 'Ошибка перевода' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Translator backend запущен на http://0.0.0.0:${PORT}`);
});
