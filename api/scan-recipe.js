// Vercel Serverless Function：菜谱截图识别（小红书/Instagram 截图 → 结构化菜谱）
// POST /api/scan-recipe  body: { images:["data:image/jpeg;base64,..."] }
// 返回: { recipe: { name, ingredients:[{name,qty,unit}], steps:[...] } }
// 复用与 /api/scan-fridge 相同的 API key（ANTHROPIC_API_KEY 或 GEMINI_API_KEY）

const MAX_IMAGES = 3;
const MAX_B64_LEN = 2_000_000;

const PROMPT = `图片是一篇菜谱（可能来自小红书/Instagram截图，中文/日文/英文均可能）。请提取菜谱内容，严格按以下JSON输出，不要输出其他文字：
{"recipe":{"name":"菜名(简体中文)","ingredients":[{"name":"食材名(简体中文常用名)","qty":数量,"unit":"单位"}],"steps":["步骤1","步骤2"]}}
规则：
- unit 从这里选：个/根/块/勺/杯/条/片/罐/瓣/张/颗/盒/袋/把/瓶/份/g/ml；"适量"类给 qty:1, unit:"份"
- steps 用简体中文改写为简洁的一句话步骤，保持原顺序
- 图里没有的信息不要编造；无法识别时输出 {"recipe":null}`;

function stripB64(s) {
  const m = String(s).match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
  return m ? { mime: 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]), data: m[2] } : { mime: 'image/jpeg', data: String(s) };
}

function parseRecipe(text) {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const r = j.recipe;
    if (!r || !r.name) return null;
    return {
      name: String(r.name).slice(0, 20),
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : []).slice(0, 30).map(i => ({
        name: String(i.name || '').slice(0, 15),
        qty: Math.max(0.1, Math.min(999, Number(i.qty) || 1)),
        unit: String(i.unit || '份').slice(0, 6),
      })).filter(i => i.name),
      steps: (Array.isArray(r.steps) ? r.steps : []).slice(0, 15).map(s => String(s).slice(0, 80)).filter(Boolean),
    };
  } catch (e) { return null; }
}

async function callClaude(images, key) {
  const model = process.env.SCAN_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
  const content = images.map(img => {
    const { mime, data } = stripB64(img);
    return { type: 'image', source: { type: 'base64', media_type: mime, data } };
  });
  content.push({ type: 'text', text: PROMPT });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error('claude ' + r.status);
  const j = await r.json();
  return parseRecipe((j.content || []).map(c => c.text || '').join(''));
}

async function callGemini(images, key) {
  const model = process.env.SCAN_GEMINI_MODEL || 'gemini-flash-latest';
  const parts = images.map(img => {
    const { mime, data } = stripB64(img);
    return { inline_data: { mime_type: mime, data } };
  });
  parts.push({ text: PROMPT });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!r.ok) throw new Error('gemini ' + r.status);
  const j = await r.json();
  const text = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
  return parseRecipe(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { images } = req.body || {};
  if (!Array.isArray(images) || !images.length) return res.status(400).json({ error: 'no_images' });
  if (images.length > MAX_IMAGES) return res.status(400).json({ error: 'too_many_images' });
  if (images.some(i => String(i).length > MAX_B64_LEN)) return res.status(400).json({ error: 'image_too_large' });
  const aKey = process.env.ANTHROPIC_API_KEY, gKey = process.env.GEMINI_API_KEY;
  if (!aKey && !gKey) return res.status(500).json({ error: 'no_api_key_configured' });
  try {
    const recipe = aKey ? await callClaude(images, aKey) : await callGemini(images, gKey);
    if (!recipe) return res.status(422).json({ error: 'not_a_recipe' });
    return res.status(200).json({ recipe });
  } catch (e) {
    return res.status(502).json({ error: 'scan_failed', detail: String(e.message || e).slice(0, 200) });
  }
}
