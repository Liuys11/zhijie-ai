# 知界 AI 部署说明

本阶段目标是先上线一个可访问、可演示、可继续开发的网站。未配置模型密钥时，聊天接口会自动使用演示回复，因此部署后无需上传文件、无需配置数据库也能开始学习。

## 1. 部署平台

推荐使用 Vercel：

1. 将项目推送到 GitHub。
2. 在 Vercel 中选择 Import Project。
3. Framework Preset 选择 Next.js。
4. Install Command 使用默认 npm 安装即可。
5. Build Command 使用 `npm run build`。
6. Output Directory 保持默认。

项目保留 `package-lock.json`，不要提交 `pnpm-lock.yaml` 或 pnpm workspace 配置，避免部署平台切换包管理器。

## 2. 环境变量

最小可演示部署不需要任何环境变量。

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

## 3. 上线验收

部署完成后检查：

- 首页可以打开。
- 不上传文件也能直接发送问题。
- `/api/chat` 返回 `200`。
- 未配置 `AI_API_KEY` 时返回演示回复。
- 配置 `AI_API_KEY` 后返回真实模型流式回复。
- 移动端宽度下侧边栏、聊天区和输入框可正常使用。

## 4. 下一阶段

演示版上线后，再按优先级接入 Supabase Auth、项目/消息/资源持久化、文件解析、embedding 检索和资料引用。
