const express  = require('express');
const jwt      = require('jsonwebtoken');
const supabase = require('./supabaseClient');
const { requireAuth } = require('./auth');

const router = express.Router();

const MAX_NAME_LEN   = 60;
const MAX_PROMPT_LEN = 4000;

// Scenarios have no file-based fallback anymore — same hard-require pattern
// auth.js uses for the same reason (both are fully Supabase-backed now).
router.use((req, res, next) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase не настроен' });
  next();
});

// Like requireAuth, but never rejects — returns the userId if a valid Bearer
// token is present, otherwise null. Lets GET /scenarios show a signed-in
// user's own scenarios alongside the built-ins, without requiring login just
// to list scenarios at all (guests/logged-out see built-ins only).
function optionalAuth(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET).sub; } catch { return null; }
}

const toApi = row => ({ id: row.id, name: row.scenario_name, builtIn: row.built_in, slug: row.slug });

router.get('/', async (req, res) => {
  const userId = optionalAuth(req);
  let query = supabase.from('scenarios').select('id, scenario_name, built_in, slug');
  query = userId ? query.or(`built_in.eq.true,owner_id.eq.${userId}`) : query.eq('built_in', true);
  const { data, error } = await query;
  if (error) { console.error('[scenarios] list error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  res.json(data.map(toApi));
});

router.get('/:id', async (req, res) => {
  const userId = optionalAuth(req);
  const { data: entry, error } = await supabase
    .from('scenarios').select('id, scenario_name, scenario_prompt, built_in, owner_id, slug')
    .eq('id', req.params.id).maybeSingle();
  if (error) { console.error('[scenarios] get error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (!entry || (!entry.built_in && entry.owner_id !== userId)) {
    return res.status(404).json({ error: 'Сценарий не найден' });
  }
  res.json({ ...toApi(entry), prompt: entry.scenario_prompt });
});

router.post('/', requireAuth, async (req, res) => {
  const { name, prompt } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LEN) {
    return res.status(400).json({ error: `Название обязательно (до ${MAX_NAME_LEN} симв.)` });
  }
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LEN) {
    return res.status(400).json({ error: `Промпт обязателен (до ${MAX_PROMPT_LEN} симв.)` });
  }

  const { data, error } = await supabase.from('scenarios').insert({
    scenario_name: name.trim(), scenario_prompt: prompt.trim(),
    built_in: false, owner_id: req.userId,
  }).select('id, scenario_name, built_in, slug').single();
  if (error) { console.error('[scenarios] create error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  res.status(201).json(toApi(data));
});

router.put('/:id', requireAuth, async (req, res) => {
  const { name, prompt } = req.body;
  const { data: entry, error: lookupErr } = await supabase
    .from('scenarios').select('id, built_in, owner_id').eq('id', req.params.id).maybeSingle();
  if (lookupErr) { console.error('[scenarios] edit lookup error:', lookupErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (!entry) return res.status(404).json({ error: 'Сценарий не найден' });
  if (!entry.built_in && entry.owner_id !== req.userId) return res.status(403).json({ error: 'Нет доступа к этому сценарию' });

  const updates = {};
  if (prompt !== undefined) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LEN) {
      return res.status(400).json({ error: `Промпт обязателен (до ${MAX_PROMPT_LEN} симв.)` });
    }
    updates.scenario_prompt = prompt.trim();
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: `Название не должно быть пустым (до ${MAX_NAME_LEN} симв.)` });
    }
    updates.scenario_name = name.trim();
  }

  const { data, error } = await supabase.from('scenarios').update(updates)
    .eq('id', req.params.id).select('id, scenario_name, built_in, slug').single();
  if (error) { console.error('[scenarios] edit error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  res.json(toApi(data));
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: entry, error: lookupErr } = await supabase
    .from('scenarios').select('id, built_in, owner_id').eq('id', req.params.id).maybeSingle();
  if (lookupErr) { console.error('[scenarios] delete lookup error:', lookupErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (!entry) return res.status(404).json({ error: 'Сценарий не найден' });
  if (entry.built_in) return res.status(403).json({ error: 'Встроенный сценарий нельзя удалить' });
  if (entry.owner_id !== req.userId) return res.status(403).json({ error: 'Нет доступа к этому сценарию' });

  const { error } = await supabase.from('scenarios').delete().eq('id', req.params.id);
  if (error) { console.error('[scenarios] delete error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  res.status(204).end();
});

// Used when the user has no scenario selected at all (scenarioId is
// null/empty) — a fixed, generic prompt rather than the old "Контекст: не
// указан" filler text.
const NO_SCENARIO_PROMPT = `Ты профессиональный переводчик, специализирующийся на {fromLang} и корейском языках.
Контекст: базовый перевод
Стиль: вежливый официальный.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.`;

// Used by /translate (server.js) to build the system prompt. Returns the
// stored scenario_prompt with {fromLang}/{toLang} substituted; if scenarioId
// is set but isn't a registered scenario, falls back to treating it as
// free-text context (backward-compat for the old file-based version's
// unregistered/custom context strings); if scenarioId is falsy (no scenario
// selected), uses the fixed NO_SCENARIO_PROMPT above.
async function getSystemPrompt(scenarioId, fromLang, toLang) {
  if (scenarioId) {
    const { data: entry } = await supabase
      .from('scenarios').select('scenario_prompt').eq('id', scenarioId).maybeSingle();
    if (entry) {
      return entry.scenario_prompt
        .replace(/\{fromLang\}/g, fromLang)
        .replace(/\{toLang\}/g,   toLang);
    }
    return `Ты профессиональный переводчик. Контекст: ${scenarioId}. Переведи текст с ${fromLang} языка на ${toLang} язык. Верни только перевод, без пояснений.`;
  }
  return NO_SCENARIO_PROMPT
    .replace(/\{fromLang\}/g, fromLang)
    .replace(/\{toLang\}/g,   toLang);
}

router.getSystemPrompt = getSystemPrompt;
module.exports = router;
