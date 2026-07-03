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

// Scenarios registry: backend/scenarios.json maps { id, name, file, builtIn }.
// Each entry's prompt lives in backend/prompts/<file>. Built-in scenarios ship
// pre-seeded; custom ones are created/edited/deleted via the /scenarios API.
const REGISTRY_PATH = path.join(__dirname, 'scenarios.json');
const PROMPTS_DIR   = path.join(__dirname, 'prompts');
const MAX_NAME_LEN   = 60;
const MAX_PROMPT_LEN = 4000;

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveRegistry(list) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(list, null, 2));
}

const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};

function slugify(name) {
  const translit = name.toLowerCase().split('').map(ch => TRANSLIT[ch] ?? ch).join('');
  const slug = translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || 'scenario';
}

function uniqueId(base, registry) {
  let id = base, n = 2;
  while (registry.some(s => s.id === id)) id = `${base}-${n++}`;
  return id;
}

function getSystemPrompt(scenarioId, fromLang, toLang) {
  const entry = loadRegistry().find(s => s.id === scenarioId);
  if (entry) {
    try {
      const template = fs.readFileSync(path.join(PROMPTS_DIR, entry.file), 'utf8').trim();
      return template
        .replace(/\{fromLang\}/g, fromLang)
        .replace(/\{toLang\}/g,   toLang);
    } catch (e) {
      console.warn(`Prompt file not found: ${entry.file}`);
    }
  }
  // Fallback: treat the raw value as free-text context (unregistered/custom)
  return `Ты профессиональный переводчик. Контекст: ${scenarioId || 'не указан'}. Переведи текст с ${fromLang} языка на ${toLang} язык. Верни только перевод, без пояснений.`;
}

app.use('/scenarios', limiter);
app.use('/health', limiter);

app.get('/scenarios', (req, res) => {
  res.json(loadRegistry().map(({ id, name, builtIn }) => ({ id, name, builtIn })));
});

app.get('/scenarios/:id', (req, res) => {
  const entry = loadRegistry().find(s => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Сценарий не найден' });
  let prompt = '';
  try { prompt = fs.readFileSync(path.join(PROMPTS_DIR, entry.file), 'utf8'); } catch {}
  res.json({ id: entry.id, name: entry.name, builtIn: entry.builtIn, prompt });
});

app.post('/scenarios', (req, res) => {
  const { name, prompt } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LEN) {
    return res.status(400).json({ error: `Название обязательно (до ${MAX_NAME_LEN} симв.)` });
  }
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LEN) {
    return res.status(400).json({ error: `Промпт обязателен (до ${MAX_PROMPT_LEN} симв.)` });
  }

  const registry = loadRegistry();
  const id   = uniqueId(slugify(name.trim()), registry);
  const file = `${id}.txt`;
  fs.writeFileSync(path.join(PROMPTS_DIR, file), prompt.trim() + '\n', 'utf8');

  const entry = { id, name: name.trim(), file, builtIn: false };
  registry.push(entry);
  saveRegistry(registry);
  res.status(201).json({ id: entry.id, name: entry.name, builtIn: false });
});

app.put('/scenarios/:id', (req, res) => {
  const { name, prompt } = req.body;
  const registry = loadRegistry();
  const entry = registry.find(s => s.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Сценарий не найден' });

  if (prompt !== undefined) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LEN) {
      return res.status(400).json({ error: `Промпт обязателен (до ${MAX_PROMPT_LEN} симв.)` });
    }
    fs.writeFileSync(path.join(PROMPTS_DIR, entry.file), prompt.trim() + '\n', 'utf8');
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: `Название не должно быть пустым (до ${MAX_NAME_LEN} симв.)` });
    }
    entry.name = name.trim();
  }
  saveRegistry(registry);
  res.json({ id: entry.id, name: entry.name, builtIn: entry.builtIn });
});

app.delete('/scenarios/:id', (req, res) => {
  const registry = loadRegistry();
  const idx = registry.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Сценарий не найден' });
  if (registry[idx].builtIn) return res.status(403).json({ error: 'Встроенный сценарий нельзя удалить' });

  const [removed] = registry.splice(idx, 1);
  saveRegistry(registry);
  try { fs.unlinkSync(path.join(PROMPTS_DIR, removed.file)); } catch {}
  res.status(204).end();
});

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
