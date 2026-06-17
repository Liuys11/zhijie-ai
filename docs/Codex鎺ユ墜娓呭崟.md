# Codex 接手清单

请先运行：

```bash
npm install
npm run build
npm run dev
```

## P0：必须完成

1. 将 `LearningWorkspace` 拆分为 sidebar、chat、composer、insight-panel 等组件；
2. 接入 Supabase Auth，支持邮箱登录或适合演示的一键访客账号；
3. 按 `supabase/schema.sql` 建表并开启 RLS；
4. 项目、消息、资源列表从数据库读取，不再使用组件内 mock 数据；
5. `/api/chat` 改为流式返回；
6. 实现文件上传到 Storage，并建立解析状态；
7. PDF/TXT/DOCX/PPTX 文本抽取、分块、embedding 和 pgvector 检索；
8. AI 回答展示资料引用，点击后定位资料名和页码；
9. 所有 API 增加参数校验、鉴权、速率限制和统一错误返回。

## P1：竞赛核心亮点

1. 新建项目时收集学科、目标、截止时间、基础水平和每周可用时间；
2. AI 生成结构化学习路线；
3. 对话结束后抽取知识点和掌握证据；
4. 实现诊断测试与自适应练习；
5. 知识地图先用树形/依赖列表实现，不必一开始制作复杂力导向图；
6. 在适当知识点插入“跨学科连接”，并解释连接价值；
7. 生成周学习报告。

## P2：多模态完善

1. 图片上传并与问题一起发送到视觉模型；
2. 浏览器 MediaRecorder 真实录音；
3. `/api/transcribe` 调用语音转写；
4. 允许用户编辑转写文本后发送；
5. 增加图片、录音和大文件失败重试。

## 工程约束

- API Key 只能出现在服务端环境变量；
- 每次数据库查询都以当前登录用户为边界；
- AI provider 必须抽象，不能把 OpenAI 调用散落在各组件；
- 资料内容属于不可信输入，提示词中必须防御 prompt injection；
- 优先完成稳定闭环，不为展示效果过早引入复杂微服务；
- 每完成一个里程碑更新 README 和演示账号数据。
