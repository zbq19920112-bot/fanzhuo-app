// ===== Supabase 配置 =====
// 在 Supabase 控制台 → Project Settings → API 里找到这两个值并填入。
// anon key 是设计上可公开的前端密钥（数据安全由数据库RLS策略保证）。
// 两个值留空时，应用以「本地演示模式」运行（数据只存本机，无登录）。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://bohvwjeamztabviglvos.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvaHZ3amVhbXp0YWJ2aWdsdm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTczNTEsImV4cCI6MjA5OTU5MzM1MX0.8NKlDaRyaIbJbppuQxA_K7T_L7y3-X6sVlQjvITHbZY',
};
