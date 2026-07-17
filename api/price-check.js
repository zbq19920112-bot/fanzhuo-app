// Vercel Serverless Function：食材比价
// GET /api/price-check?kw=トマト&market=jp
// 返回: { results: [{ platform, name, price, shop, url }] }（按价格升序）
//
// 目前支持：楽天市場（官方商品搜索API，免费）
//   需要环境变量 RAKUTEN_APP_ID（webservice.rakuten.co.jp → New App 即时发放）
//   可选 RAKUTEN_AFF_ID：返回的商品链接自动变为联盟链接（比价+返佣一体）
// 中国平台需各联盟API授权，暂返回 not_supported，前端降级为并排打开人工对比。

const ENDPOINT = process.env.RAKUTEN_SEARCH_ENDPOINT
  || 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  const kw = String(req.query.kw || '').slice(0, 40);
  const market = req.query.market || 'jp';
  if (!kw) return res.status(400).json({ error: 'no_keyword' });
  if (market !== 'jp') return res.status(200).json({ results: [], reason: 'market_not_supported' });

  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) return res.status(200).json({ results: [], reason: 'not_configured' });

  try {
    const aff = process.env.RAKUTEN_AFF_ID
      ? '&affiliateId=' + encodeURIComponent(process.env.RAKUTEN_AFF_ID) : '';
    const url = ENDPOINT
      + '?applicationId=' + encodeURIComponent(appId) + aff
      + '&keyword=' + encodeURIComponent(kw)
      + '&hits=10&sort=' + encodeURIComponent('+itemPrice')
      + '&formatVersion=2';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return res.status(200).json({ results: [], reason: 'provider_error_' + r.status });
    const j = await r.json();
    const raw = Array.isArray(j.Items) ? j.Items : [];
    const results = raw
      .map(x => x.Item || x) // 兼容 formatVersion 1/2
      .filter(it => it && Number(it.itemPrice) > 0)
      .map(it => ({
        platform: '楽天',
        name: String(it.itemName || '').slice(0, 60),
        price: Number(it.itemPrice),
        shop: String(it.shopName || '').slice(0, 30),
        url: it.affiliateUrl || it.itemUrl || '',
      }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(200).json({ results: [], reason: 'fetch_failed' });
  }
}
