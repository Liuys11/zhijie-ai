import type { Message, Project } from "./types";

export const initialProjects: Project[] = [
  { id: "ml", name: "机器学习竞赛", subject: "计算机 × 数学", emoji: "🧠", progress: 62 },
  { id: "power", name: "电力系统基础", subject: "电气工程", emoji: "⚡", progress: 38 },
  { id: "english", name: "大学英语听力", subject: "语言学习", emoji: "🎧", progress: 71 }
];

export const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是知界 AI。这个空间会围绕“机器学习竞赛”保存你的问题、资料、学习计划和掌握进度。你可以直接提问，也可以上传 PDF、图片或录音，不上传资料也完全可以开始学习。",
    time: "刚刚"
  }
];

export const learningModes = ["讲解模式", "苏格拉底提问", "考前复习", "竞赛辅导"];

export const suggestionPrompts = [
  "帮我制定这个项目的学习路线",
  "先测试一下我目前的基础",
  "解释监督学习和无监督学习的区别"
];
