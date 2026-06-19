import type { RefObject } from "react";

export type Project = {
  id: string;
  name: string;
  subject: string;
  emoji: string;
  progress: number;
  conversationId?: string;
};

export type LearningStepStatus = "todo" | "doing" | "done";

export type LearningStep = {
  id: string;
  title: string;
  status: LearningStepStatus;
  sortOrder: number;
};

export type ProjectStats = {
  done: number;
  doing: number;
  todo: number;
  resources: number;
  recentStudyAt: string;
};

export type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  parts?: MessagePart[];
  time: string;
};

export type MessagePart =
  | {
      type: "text" | "markdown";
      content: string;
    }
  | {
      type: "mermaid";
      content: string;
      title?: string;
    }
  | {
      type: "chart";
      title?: string;
      option: ChartOption;
    }
  | {
      type: "image";
      url?: string;
      storagePath?: string;
      prompt: string;
      status: "generating" | "completed" | "failed";
      error?: string;
      taskId?: string;
      taskStatus?: string;
      provider?: string;
    }
  | {
      type: "video";
      url?: string;
      title: string;
      status: "queued" | "generating" | "completed" | "failed";
      progressLabel?: string;
      script?: string;
      error?: string;
      taskId?: string;
      taskStatus?: string;
      provider?: string;
      duration?: "30s" | "60s" | "90s";
      difficulty?: "入门" | "基础" | "进阶";
      style?: "知识讲解" | "考前复习" | "概念科普" | "案例分析";
      audioUrl?: string;
      subtitleUrl?: string;
      subtitleFormat?: "vtt";
      subtitleStatus?: "generated" | "missing-script" | "failed";
      subtitleMessage?: string;
    }
  | {
      type: "generation_status";
      label: string;
      status: "pending" | "running" | "completed" | "failed";
    }
  | {
      type: "error";
      message: string;
    };

export type ChartOption = {
  title?: { text?: string };
  tooltip?: Record<string, unknown>;
  legend?: Record<string, unknown>;
  xAxis?: Record<string, unknown> | Array<Record<string, unknown>>;
  yAxis?: Record<string, unknown> | Array<Record<string, unknown>>;
  series?: Array<Record<string, unknown>>;
  dataset?: Record<string, unknown> | Array<Record<string, unknown>>;
};

export type Resource = {
  id: string;
  name: string;
  type: string;
  size: string;
  storagePath?: string;
  category?: ResourceCategory;
  status?: string;
  createdAt?: string;
  mimeType?: string;
};

export type ResourceCategory =
  | "uploaded"
  | "explanation"
  | "exercise"
  | "mindmap"
  | "reading"
  | "code";

export type KnowledgeStatus = "mastered" | "learning" | "todo" | "weak";

export type KnowledgeNode = {
  id: string;
  title: string;
  description: string;
  masteryScore: number;
  confidence: number;
  evidenceCount: number;
  status: KnowledgeStatus;
  lastReviewedAt: string;
  nextReviewedAt: string;
};

export type KnowledgeEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: string;
};

export type UserProfile = {
  nickname: string;
  avatarUrl: string;
  avatarPath: string;
};

export type WorkspaceSection = "总览" | "学习对话" | "资料库" | "知识地图";

export type FileInputRef = RefObject<HTMLInputElement | null>;
