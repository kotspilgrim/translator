require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const OpenAI       = require('openai');
const fs           = require('fs');
const path         = require('path');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = 3000;

app.use(helmet());
app.use(cors({ origin: false }));
app.use(express.json({ limit: '32kb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов, попробуйте позже' },
});
app.use('/translate', limiter);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// Map scenario display name → prompt file (without .txt)
// To edit a prompt: open backend/prompts/<filename>.txt
const SCENARIO_FILES = {
  'Незнакомец на улице': 'stranger-on-street',
  'В магазине':          'v-magazine',
  'В ресторане':         'v-restorane',
  'В банке':             'v-banke',
  'В больнице':          'v-bolnitse',
  'В отеле':             'v-otele',
  'В транспорте':        'v-transporte',
};

function getSystemPrompt(scenario, fromLang, toLang) {
  const file = SCENARIO_FILES[scenario];
  if (file) {
    const filePath = path.join(__dirname, 'prompts', `${file}.txt`);
    try {
      const template = fs.readFileSync(filePath, 'utf8').trim();
      return template
        .replace(/\{fromLang\}/g, fromLang)
        .replace(/\{toLang\}/g,   toLang);
    } catch (e) {
      console.warn(`Prompt file not found: ${filePath}`);
    }
  }
  // Fallback for custom scenarios
  return `Ты профессиональный переводчик. Контекст: ${scenario || 'не указан'}. Переведи текст с ${fromLang} языка на ${toLang} язык. Верни только перевод, без пояснений.`;
}

const ALLOWED_LANGS = ['русский', 'корейский'];
const MAX_TEXT_LEN  = 1000;

app.post('/translate', async (req, res) => {
  const { text, fromLang, toLang, context } = req.body;

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

  const systemPrompt = getSystemPrompt(context, fromLang, toLang);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: text },
      ],
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
