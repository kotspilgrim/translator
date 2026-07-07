const express  = require('express');
const jwt      = require('jsonwebtoken');
const OpenAI   = require('openai');
const supabase = require('./supabaseClient');
const { requireAuth } = require('./auth');

const router = express.Router();
const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_NAME_LEN   = 60;
const MAX_PROMPT_LEN = 4000;
const MAX_PINNED     = 3;
const MAX_GENERATE_PER_DAY = 3;

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

// Pins are per-user (users_scenarios_mapping, migration 001) — registered
// before GET /:id so "pinned" is never swallowed as a scenario id.
router.get('/pinned', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('users_scenarios_mapping').select('scenario_id').eq('user_id', req.userId);
  if (error) { console.error('[scenarios] pinned list error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  res.json(data.map(r => r.scenario_id));
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

// Daily quota (migration 20260707072236) — lives on the user's row so it
// survives cancelling the create-scenario sheet and app restarts, unlike the
// scenario itself, which doesn't have an id yet at this point to key a
// per-scenario counter on. Date is a plain UTC "YYYY-MM-DD" string; simple
// and fine for a personal 2-user app rather than per-user local midnight.
async function getGenerateStatus(userId) {
  const { data: user, error } = await supabase
    .from('users').select('prompt_generate_count, prompt_generate_date').eq('id', userId).maybeSingle();
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const count = (user && user.prompt_generate_date === today) ? user.prompt_generate_count : 0;
  return { count, today };
}

// Lets the create-scenario sheet show the remaining count (and disable the
// button) as soon as it opens, without needing a failed attempt first.
router.get('/generate-prompt/status', requireAuth, async (req, res) => {
  try {
    const { count } = await getGenerateStatus(req.userId);
    res.json({ remaining: Math.max(0, MAX_GENERATE_PER_DAY - count) });
  } catch (error) {
    console.error('[scenarios] generate-status error:', error.message);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

// Generates a scenario_prompt from just a name, for the "Сгенерировать"
// button in the create-scenario sheet — uses the same 4-line template as the
// built-in scenarios (see NO_SCENARIO_PROMPT below for the no-scenario
// variant).
router.post('/generate-prompt', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Введите название сценария' });
  }
  if (name.length > MAX_NAME_LEN) {
    return res.status(400).json({ error: `Название слишком длинное (до ${MAX_NAME_LEN} симв.)` });
  }

  let status;
  try {
    status = await getGenerateStatus(req.userId);
  } catch (error) {
    console.error('[scenarios] generate-prompt status error:', error.message);
    return res.status(500).json({ error: 'Ошибка базы данных' });
  }
  if (status.count >= MAX_GENERATE_PER_DAY) {
    return res.status(429).json({ error: 'limit_reached', remaining: 0 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: `Ты помогаешь составлять системные промпты для переводчика РУССКИЙ⇄КОРЕЙСКИЙ по названию сценария общения (например: "В аэропорту", "Разговор с врачом").
Сгенерируй промпт СТРОГО в этом формате, ровно 4 строки, без вступлений и пояснений до/после:
Ты профессиональный переводчик, специализирующийся на {fromLang} и корейском языках.
Контекст: <краткое описание ситуации на основе названия сценария>
Стиль: <подходящий стиль общения для этой ситуации>
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.

Литералы {fromLang} и {toLang} должны остаться БУКВАЛЬНО как плейсхолдеры в фигурных скобках — не заменяй их названием конкретного языка.

Если название сценария бессмысленное, случайный набор символов/цифр или никак не описывает ситуацию общения между людьми — не придумывай ничего и верни ровно одну строку без пояснений: NO_LOGIC`,
        },
        { role: 'user', content: `Название сценария: "${name.trim()}"` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';

    // Counts against the daily quota once the request has actually reached
    // OpenAI (a real attempt/cost) — regardless of whether it came back as a
    // usable prompt or a NO_LOGIC rejection.
    const newCount = status.count + 1;
    const { error: updateErr } = await supabase.from('users').update({
      prompt_generate_count: newCount, prompt_generate_date: status.today,
    }).eq('id', req.userId);
    if (updateErr) console.error('[scenarios] generate-count update error:', updateErr.message);
    const remaining = Math.max(0, MAX_GENERATE_PER_DAY - newCount);

    if (!raw || raw === 'NO_LOGIC' || raw.startsWith('NO_LOGIC')) {
      return res.status(422).json({ error: 'no_logic', remaining });
    }
    res.json({ prompt: raw, remaining });
  } catch (error) {
    console.error('[scenarios] generate-prompt error:', error.message);
    res.status(500).json({ error: 'Не удалось сгенерировать промпт' });
  }
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

// scenario_id has `on delete cascade` (migration 001) — deleting a scenario
// (above) automatically drops any mapping rows pinning it, so pins can never
// go stale pointing at a scenario that no longer exists.
router.post('/:id/pin', requireAuth, async (req, res) => {
  const { count, error: countErr } = await supabase
    .from('users_scenarios_mapping').select('scenario_id', { count: 'exact', head: true }).eq('user_id', req.userId);
  if (countErr) { console.error('[scenarios] pin count error:', countErr.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  if (count >= MAX_PINNED) return res.status(400).json({ error: `Можно закрепить не более ${MAX_PINNED}` });

  const { error } = await supabase
    .from('users_scenarios_mapping')
    .upsert({ user_id: req.userId, scenario_id: req.params.id }, { onConflict: 'user_id,scenario_id' });
  if (error) { console.error('[scenarios] pin error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
  res.status(204).end();
});

router.delete('/:id/pin', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('users_scenarios_mapping').delete().eq('user_id', req.userId).eq('scenario_id', req.params.id);
  if (error) { console.error('[scenarios] unpin error:', error.message); return res.status(500).json({ error: 'Ошибка базы данных' }); }
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
