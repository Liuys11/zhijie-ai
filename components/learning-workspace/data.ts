import type { Message, Project } from "./types";

export const initialProjects: Project[] = [
  { id: "ml", name: "知界 AI 竞赛作品", subject: "软件设计竞赛 × 智能学习", emoji: "🧠", progress: 72 },
  { id: "power", name: "电力系统期末复习", subject: "电气工程课程", emoji: "⚡", progress: 38 },
  { id: "english", name: "大学英语听力提升", subject: "语言学习项目", emoji: "🎧", progress: 71 }
];

export const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是知界 AI。这个演示空间围绕大学生软件设计竞赛作品展开，会把项目目标、对话、资料、学习路线和掌握进度放在同一个学习项目里。当前已接入科大讯飞星火 Spark-X2-Flash；你可以直接提问，不上传资料也能开始学习。",
    time: "刚刚"
  }
];

export const learningModes = ["讲解模式", "苏格拉底提问", "考前复习", "竞赛辅导"];

export const suggestionPrompts = [
  "用评委能听懂的话介绍知界 AI",
  "帮我梳理这个作品的核心创新点",
  "生成一段 1 分钟竞赛答辩开场白"
];
