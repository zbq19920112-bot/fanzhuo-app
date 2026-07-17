// ===== Supabase 配置 =====
// 在 Supabase 控制台 → Project Settings → API 里找到这两个值并填入。
// anon key 是设计上可公开的前端密钥（数据安全由数据库RLS策略保证）。
// 两个值留空时，应用以「本地演示模式」运行（数据只存本机，无登录）。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://bohvwjeamztabviglvos.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaHZ3amVhbXp0YWJ2aWdsdm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTczNTEsImV4cCI6MjA5OTU5MzM1MX0.8NKlDaRyaIbJbppuQxA_K7T_L7y3-X6sVlQjvITHbZY',
};

// ===== 联盟返佣配置（CPS） =====
// 留空时购物跳转为普通搜索链接（功能可用、无佣金）；
// 在各联盟注册拿到ID后填入，链接自动带佣金参数，无需改代码。
window.AFFILIATE_CONFIG = {
  AMAZON_JP_TAG: '',      // Amazonアソシエイト のトラッキングID（例 fanzhuo-22）
  RAKUTEN_AFF_ID: '',     // 楽天アフィリエイトID（例 abc123.def456.ghi789）
  // 需要走 A8.net / もしも / 京东联盟 / 多多进宝 等中转链接时，
  // 按平台id覆盖完整URL模板：{kw}=编码后的关键词，{url}=编码后的原链接
  // 例：CUSTOM_TEMPLATES: { taobao: 'https://s.click.taobao.com/xxxx?kw={kw}' }
  CUSTOM_TEMPLATES: {},
};
