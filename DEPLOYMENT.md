# 知界 AI 部署说明

本阶段目标是上线一个可访问、可演示、可继续开发的网站。当前版本已启用 Supabase 邮箱密码登录，用户必须注册/登录后进入学习空间，项目和聊天记录会按账号保存。

## 1. 部署平台

推荐使用 Vercel：

1. 将项目推送到 GitHub。
2. 在 Vercel 中选择 Import Project。
3. Framework Preset 选择 Next.js。
4. Install Command 使用默认 npm 安装即可。
5. Build Command 使用 `npm run build`。
6. Output Directory 保持默认。

项目保留 `package-lock.json`，不要提交 `pnpm-lock.yaml` 或 pnpm workspace 配置，避免部署平台切换包管理器。

## 2. Supabase 配置

当前版本必须配置 Supabase 才能注册、登录和保存消息历史。

1. 在 Supabase 新建项目。
2. 进入 SQL Editor，执行 `supabase/schema.sql`。
3. 进入 Project Settings -> API，复制 Project URL 和 anon public key。
4. 在 Vercel Project Settings -> Environment Variables 中配置：

```env
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase anon public key
```

如果希望注册后不需要邮箱确认即可直接登录，可在 Supabase Authentication -> Providers -> Email 中关闭 Confirm email。课程竞赛现场演示建议关闭邮箱确认，减少等待邮件的风险。

## 3. 大模型配置

如需接入真实模型，在 Vercel Project Settings -> Environment Variables 中配置：

```env
AI_API_KEY=你的服务端APIKey
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

也可以换成其他 OpenAI-compatible Chat Completions 接口，例如：

```env
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

密钥只能放在服务端环境变量中，不要写入客户端组件、README 示例值或提交到 Git。

## 4. 上线验收

部署完成后检查：

- 首页可以打开。
- 未登录时显示注册/登录页，不能进入工作台。
- 注册或登录后自动进入学习空间。
- 不上传文件也能直接发送问题。
- 刷新页面后还能看到历史消息。
- `/api/chat` 返回 `200`。
- 未配置 `AI_API_KEY` 时返回演示回复。
- 配置 `AI_API_KEY` 后返回真实模型流式回复。
- 移动端宽度下侧边栏、聊天区和输入框可正常使用。

## 5. 下一阶段

登录和消息持久化完成后，再按优先级接入文件解析、embedding 检索和资料引用。
