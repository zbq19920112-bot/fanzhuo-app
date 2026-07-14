// Vercel Serverless Function：服务端抓取菜谱页面（解决浏览器CORS限制）
// GET /api/fetch-recipe?url=https://...
// 返回 { text: "页面纯文本" }

const BLOCKED_HOSTS = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1)/i;
const MAX_BYTES = 500 * 1024;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600');
  const url = req.query.url;
  if (!url || !/^https?:\/\/.+/i.test(url)) {
    return res.status(400).json({ error: 'bad_url' });
  }
  let host;
  try { host = new URL(url).hostname; } catch { return res.status(400).json({ error: 'bad_url' }); }
  // 基础SSRF防护：拒绝内网地址与IP字面量
  if (BLOCKED_HOSTS.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return res.status(400).json({ error: 'blocked_host' });
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FanzhuoBot/1.0; recipe-import)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,ja,en;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!r.ok) return res.status(502).json({ error: 'fetch_failed', status: r.status });
    const buf = Buffer.from(await r.arrayBuffer());
    const raw = buf.slice(0, MAX_BYTES).toString('utf8');
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h\d|tr|dd|dt|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
      .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
      .slice(0, 12000);
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed' });
  }
}
