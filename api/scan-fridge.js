// Vercel Serverless Function：拍照识别冰箱库存
// POST /api/scan-fridge  body: { images:["data:image/jpeg;base64,..."], zone:"冷藏" }
// 返回: { items:[{ name, qty, unit, category, confidence }] }
//
// 需要在 Vercel 项目 Settings → Environment Variables 配置其一：
//   ANTHROPIC_API_KEY  （Claude，推荐商品化用）
//   GEMINI_API_KEY     （Google Gemini，个人测试免费额度）
// 可选：SCAN_CLAUDE_MODEL（默认 claude-haiku-4-5-20251001）、SCAN_GEMINI_MODEL（默认 gemini-2.5-flash）

const MAX_IMAGES = 4;
const MAX_B64_LEN = 2_000_000; // 单张约1.5MB上限（前端已压缩到1024px）

const PROMPT = `你是冰箱食材识别助手。请识别图片中所有可辨认的食材/食品，严格按以下JSON格式输出，不要输出任何其他文字：
{"items":[{"name":"食材名","qty":数量,"unit":"单位","category":"分类","confidence":0到1的小数}]}
规则：
- name 用简体中文常用名（例：番茄、鸡蛋、牛奶、豆腐、鸡腿肉）
- unit 只能从这里选：个/根/块/勺/杯/条/片/罐/瓣/张/颗/盒/袋/把/瓶/份/g/ml
- category 只能从这里选：蔬菜/水果/肉类/海鲜/蛋奶/豆制品/主食/调料/其他
- qty 尽量估计可见数量；按包装卖的（牛奶/豆腐等）数包装数
- 看不清或不确定的：confidence 给低值(<0.7)；完全无法辨认但确实是食物的：name 用 "???"
- 不是食物的物品不要输出`;

function stripB64(s) {
  const m = String(s).match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
  return m ? { mime: 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]), data: m[2] } : { mime: 'image/jpeg', data: String(s) };
}

function parseItems(text) {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return [];
    const j = JSON.parse(m[0]);
    if (!Array.isArray(j.items)) return [];
    return j.items
      .filter(it => it && it.name)
      .slice(0, 40)
      .map(it => ({
        name: String(it.name).slice(0, 20),
        qty: Math.max(0.1, Math.min(99, Number(it.qty) || 1)),
        unit: String(it.unit || '份').slice(0, 6),
        category: String(it.category || '其他').slice(0, 6),
        confidence: Math.max(0, Math.min(1, Number(it.confidence != null ? it.confidence : 0.9))),
      }));
  } catch (e) { return []; }
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
    body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error('claude ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return parseItems((j.content || []).map(c => c.text || '').join(''));
}

async function callGemini(images, key) {
  const model = process.env.SCAN_GEMINI_MODEL || 'gemini-flash-latest'; // 别名永远指向最新Flash，避免型号停用
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
  if (!r.ok) throw new Error('gemini ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  const text = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
  return parseItems(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { images } = req.body || {};
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: 'no_images' });
  if (images.length > MAX_IMAGES) return res.status(400).json({ error: 'too_many_images' });
  if (images.some(i => String(i).length > MAX_B64_LEN)) return res.status(400).json({ error: 'image_too_large' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!anthropicKey && !geminiKey) return res.status(500).json({ error: 'no_api_key_configured' });

  try {
    const items = anthropicKey ? await callClaude(images, anthropicKey) : await callGemini(images, geminiKey);
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(502).json({ error: 'scan_failed', detail: String(e.message || e).slice(0, 200) });
  }
}
