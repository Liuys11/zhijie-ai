import type { RefObject } from "react";

export type Project = {
  id: string;
  name: string;
  subject: string;
  emoji: string;
  progress: number;
  conversationId?: string;
};

export type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  time: string;
};

export type Resource = {
  id: string;
  name: string;
  type: string;
  size: string;
};

export type WorkspaceSection = "总览" | "学习对话" | "资料库" | "知识地图";

export type FileInputRef = RefObject<HTMLInputElement | null>;
