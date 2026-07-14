# 🍚 两口子的饭桌 — 部署指南

夫妻/情侣共用的三餐规划应用：周菜单、冰箱库存、自动购物清单、菜品评分推荐、自建菜谱导入，中/日双语，云端实时同步。

## 项目结构

```
fanzhuo-app/
├── index.html          # 应用本体（单页应用）
├── config.js           # Supabase 密钥配置（部署前填写）
├── schema.sql          # 数据库结构（在 Supabase 执行一次）
├── api/
│   └── fetch-recipe.js # Vercel serverless：服务端抓取菜谱页面
└── README.md
```

## 部署步骤（约15分钟）

### 第1步：Supabase 建库

1. 登录 [supabase.com](https://supabase.com) → New Project（区域选 Tokyo 或离你们最近的）
2. 左侧菜单 **SQL Editor** → New query → 把 `schema.sql` 全文粘贴进去 → **Run**
3. 左侧菜单 **Authentication → Sign In / Up**：确认 Email 开启（默认开启）。
4. **Project Settings → API**：复制 `Project URL` 和 `anon public` key

### 第2步：填配置

打开 `config.js`，填入刚才复制的两个值：

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
};
```

anon key 是设计上可公开的前端密钥，数据安全由数据库 RLS 策略保证（每对情侣只能读写自己组的数据）。

### 第3步：部署到 Vercel

方式A（推荐，自动更新）：把 `fanzhuo-app` 文件夹推到 GitHub 仓库 → [vercel.com](https://vercel.com) → Add New Project → 导入该仓库 → Framework 选 **Other** → Deploy。

方式B（命令行）：在 `fanzhuo-app` 目录下运行 `npx vercel --prod`。

### 第4步：回填域名

部署完成后拿到域名（如 `fanzhuo.vercel.app`），回到 Supabase：
**Authentication → URL Configuration → Site URL** 填 `https://fanzhuo.vercel.app`（魔法链接跳转需要）。

### 第5步：两人开始用

1. 你打开网站 → 点顶部状态栏 → 输邮箱收登录链接 → 登录后「创建我们的小家」，得到6位邀请码
2. 把网址和邀请码发给TA → TA登录后输入邀请码「加入」
3. 顶部显示 🟢 云同步中，完成。手机浏览器菜单里选「添加到主屏幕」可当App用

## 说明

- **本地演示模式**：config.js 留空时应用仍可运行，数据只存本机，适合先预览界面。
- **数据模型**：评分按人存行、冰箱按食材存行、菜单按天/餐存行——两人同时改不同数据互不覆盖。
- **实时同步**：基于 Supabase Realtime（PostgreSQL 逻辑复制），对方改动约1秒内到达。
- **菜谱URL导入**：部署到 Vercel 后走 `/api/fetch-recipe` 服务端抓取，不受浏览器CORS限制；本地模式则降级为「复制粘贴文本导入」。
- **免费额度**：Supabase 免费档（500MB库/5万月活）+ Vercel Hobby 档，两人使用完全免费。

## 商品化后续路线（建议顺序）

1. PWA（manifest + service worker）：安装到主屏、离线查看
2. 菜谱导入接LLM API：贴任意URL自动结构化为食材+步骤
3. 冰箱拍照识别（视觉模型API）
4. 多人组（家庭>2人）、周菜单模板、营养统计
5. 上架应用商店（Capacitor 套壳）
