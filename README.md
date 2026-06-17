# 知界 AI｜项目制智能学习空间

这是为课程大作业/竞赛准备的首版 Web 原型。核心思路是：**每门课、每次竞赛或每个自主研究主题都建立独立学习项目**，项目内保存对话、资料、知识结构、学习路线与掌握进度。

## 已实现

- 多学习项目切换与新建项目
- 邮箱密码注册/登录
- 项目和聊天消息按账号持久化保存
- 不上传资料也能直接开始 AI 对话
- PDF、Office 文档、图片等资料入口与文件状态展示
- 语音输入交互状态
- 讲解、苏格拉底提问、考前复习、竞赛辅导四种学习模式
- 学习路线、掌握进度、项目资料侧栏
- 无 API Key 时自动进入演示模式
- 配置 OpenAI-compatible 大模型接口后调用流式 Chat Completions
- 桌面端与移动端响应式界面

> 当前上传文件只完成前端交互和资源列表，尚未把文件内容发送给模型。完整解析、RAG 知识库和语音转写列入下一阶段。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

浏览器打开 `http://localhost:3000`。

本地登录和消息历史需要配置 Supabase：

```env
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase anon public key
```

## 接入真实模型

编辑 `.env.local`：

```env
AI_API_KEY=你的服务端APIKey
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

模型接口使用 OpenAI-compatible Chat Completions 协议。你也可以换成通义千问兼容模式、硅基流动或 OpenAI：

```env
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

API Key 只能放在服务端环境变量中，不能写入浏览器代码或提交到 Git。不配置模型密钥时，聊天接口会自动使用内置演示回复；但当前版本仍需要 Supabase 登录配置，保证项目和消息历史能保存。

## 目录

```text
app/                    Next.js 页面与服务端 API
components/             学习工作台组件
lib/                    演示回复等业务逻辑
supabase/schema.sql     第二阶段数据库结构
_docs/                  无（项目文档实际位于 docs/）
docs/产品方案.md         产品定位、页面和流程
docs/技术方案.md         完整架构与实施阶段
docs/Codex接手清单.md    给 Codex 的具体开发任务
AGENTS.md               Codex 项目规则
```

## 推荐部署

- 前端与 API：Vercel 或支持 Node.js 的云服务器
- 登录、数据库、文件存储、向量检索：Supabase
- 大模型：通过服务端调用 DeepSeek、通义千问兼容模式、硅基流动或 OpenAI 等兼容接口

详细上线步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 当前版本定位

本版本不是最终生产系统，而是一个可运行、可演示、可继续开发的高保真 MVP。优先保证作品核心逻辑能够被评委快速理解：

1. 学习不是单次聊天，而是围绕项目持续积累；
2. 学生既可以直接提问，也可以通过文件、图片和语音交互；
3. AI 不只回答问题，还维护路线、诊断掌握程度并促进跨学科迁移。
