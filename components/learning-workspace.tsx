"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatPanel } from "./learning-workspace/chat-panel";
import { initialMessages, learningModes, suggestionPrompts } from "./learning-workspace/data";
import { InsightPanel } from "./learning-workspace/insight-panel";
import { NewProjectModal } from "./learning-workspace/new-project-modal";
import { ProfileModal } from "./learning-workspace/profile-modal";
import { KnowledgeMap, ProjectOverview, ResourceLibrary } from "./learning-workspace/project-modules";
import type { Assessment, KnowledgeEdge, KnowledgeNode, LearningStep, Message, Project, ProjectStats, Resource, UserProfile, WorkspaceSection } from "./learning-workspace/types";
import { nowLabel } from "./learning-workspace/utils";
import { WorkspaceHeader } from "./learning-workspace/workspace-header";
import { WorkspaceSidebar } from "./learning-workspace/workspace-sidebar";
import { deleteAvatarFile, deleteProjectFile, getAvatarPublicUrl, uploadAvatarFile, uploadProjectFile, type AuthSession } from "@/lib/supabase-browser";

type LearningWorkspaceProps = {
  session: AuthSession;
  onSignOut: () => void;
};

type ApiProjectsResponse = {
  projects?: Project[];
  error?: string;
};

type ApiMessagesResponse = {
  conversationId?: string;
  messages?: Message[];
  error?: string;
};

type ApiProfileResponse = {
  profile?: UserProfile;
  error?: string;
};

type ApiProjectDetailsResponse = {
  progress?: number;
  goal?: string;
  weeklyMinutes?: number;
  steps?: LearningStep[];
  resources?: Resource[];
  stats?: ProjectStats;
  knowledgeNodes?: KnowledgeNode[];
  knowledgeEdges?: KnowledgeEdge[];
  error?: string;
};

type ApiAssessmentResponse = {
  assessment?: Assessment | null;
  error?: string;
};

type ApiImageGenerationResponse = {
  conversationId?: string;
  message?: Message;
  status?: "processing" | "completed";
  taskId?: string;
  error?: string;
};

type ApiImageStatusResponse = {
  message?: Message;
  status?: "waiting" | "processing" | "completed" | "failed";
  taskStatus?: string;
  error?: string;
};


const allowedAvatarTypes = ["image/jpeg", "image/png", "image/webp"];
const maxAvatarSize = 5 * 1024 * 1024;
const defaultProjectStats: ProjectStats = {
  done: 0,
  doing: 0,
  todo: 0,
  resources: 0,
  recentStudyAt: ""
};

const imagePollIntervalMs = 3000;
const imagePollMaxCount = 40;
const imageAutoPollMaxMs = 10 * 60 * 1000;

function getImageTaskFromMessage(message: Message) {
  const imagePart = message.parts?.find((part) => part.type === "image" && part.taskId && part.status === "generating");
  if (!imagePart || imagePart.type !== "image" || !imagePart.taskId) return null;

  return {
    taskId: imagePart.taskId,
    prompt: imagePart.prompt,
    taskStatus: imagePart.taskStatus,
    startedAt: imagePart.startedAt,
    lastCheckedAt: imagePart.lastCheckedAt,
    elapsedMs: imagePart.elapsedMs || 0,
    pollCount: imagePart.pollCount || 0,
    autoStopped: imagePart.autoStopped || false
  };
}


function hasCompletedImage(message: Message) {
  return Boolean(message.parts?.some((part) => part.type === "image" && part.status === "completed" && part.url));
}

function getImageTaskElapsedMs(task: ReturnType<typeof getImageTaskFromMessage>) {
  if (!task?.startedAt) return Number.POSITIVE_INFINITY;
  const startedMs = Date.parse(task.startedAt);
  if (!Number.isFinite(startedMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - startedMs);
}

function shouldAutoPollImageTask(task: ReturnType<typeof getImageTaskFromMessage>) {
  if (!task) return false;
  if (task.autoStopped) return false;
  if (task.taskStatus === "3" || task.taskStatus === "4") return false;
  return getImageTaskElapsedMs(task) < imageAutoPollMaxMs;
}

function markImageAutoStopped(message: Message, autoStopped: boolean) {
  return {
    ...message,
    parts: message.parts?.map((part) =>
      part.type === "image"
        ? {
            ...part,
            autoStopped
          }
        : part
    )
  };
}

function replaceMessageKeepingCompletedImage(current: Message[], nextMessage: Message) {
  return current.map((message) => {
    if (message.id !== nextMessage.id) return message;
    if (hasCompletedImage(message) && !hasCompletedImage(nextMessage)) return message;
    return nextMessage;
  });
}

function maskTaskId(taskId?: string) {
  if (!taskId) return "";
  if (taskId.length <= 8) return "***";
  return `${taskId.slice(0, 4)}...${taskId.slice(-4)}`;
}

function formatElapsedTime(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}\u79d2`;
  return `${minutes}\u5206${String(seconds).padStart(2, "0")}\u79d2`;
}

const sectionToSlug: Record<WorkspaceSection, string> = {
  "总览": "overview",
  "学习对话": "chat",
  "资料库": "resources",
  "知识地图": "knowledge-map"
};

const slugToSection: Record<string, WorkspaceSection> = {
  overview: "总览",
  chat: "学习对话",
  resources: "资料库",
  "knowledge-map": "知识地图"
};

function getRouteState() {
  if (typeof window === "undefined") return { projectId: "", section: "学习对话" as WorkspaceSection };
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/([^/]+)/);
  return {
    projectId: match?.[1] || "",
    section: slugToSection[match?.[2] || ""] || ("学习对话" as WorkspaceSection)
  };
}

function updateWorkspaceRoute(projectId: string, section: WorkspaceSection, replace = false) {
  if (typeof window === "undefined" || !projectId) return;
  const nextPath = `/projects/${projectId}/${sectionToSlug[section]}`;
  if (window.location.pathname === nextPath) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", nextPath);
}

function isImageGenerationRequest(message: string) {
  return /(生成|画|绘制|做|创建).*(图片|插图|配图|封面|场景图|概念图|示意图|海报)|重新生成图片|继续修改.*图片/.test(message);
}

function isVideoGenerationRequest(message: string) {
  return /(生成|做|创建|制作).*(视频|短视频|微课|教学视频)|视频讲解|做成教学视频|重新生成教学视频|修改教学视频/.test(message);
}

function cleanImagePrompt(message: string) {
  return message
    .replace(/^重新生成图片[:：]?/, "")
    .replace(/^生成一张教学插图[:：]?/, "")
    .replace(/^请在这张图片描述基础上继续修改[:：]?/, "")
    .trim() || message.trim();
}


function profileFromEmail(email?: string): UserProfile {
  return {
    nickname: email?.split("@")[0] || "学习者",
    avatarUrl: "",
    avatarPath: ""
  };
}

function getAvatarExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function getSafeStorageName(name: string) {
  const cleaned = name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || `file-${Date.now()}`;
}

function getFriendlyProfileError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  console.error(error);

  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(message)) {
    return "网络连接失败，个人资料没有保存成功。请检查网络或稍后重试。";
  }

  if (/bucket|storage|row-level security|policy|permission|403|401/i.test(message)) {
    return "头像上传权限不足，请确认 Supabase 已创建 avatars bucket 并执行 Storage 权限 SQL。";
  }

  if (/profiles|column|relation|schema/i.test(message)) {
    return "个人资料表尚未配置，请先在 Supabase 执行 profile-migration.sql。";
  }

  return message || "个人资料保存失败，请稍后重试。";
}

export function LearningWorkspace({ session, onSignOut }: LearningWorkspaceProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [resources, setResources] = useState<Resource[]>([]);
  const [learningSteps, setLearningSteps] = useState<LearningStep[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);
  const [knowledgeEdges, setKnowledgeEdges] = useState<KnowledgeEdge[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStats>(defaultProjectStats);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState(learningModes[0]);
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectGoal, setNewProjectGoal] = useState("");
  const [newProjectBaseline, setNewProjectBaseline] = useState("");
  const [newProjectWeeklyMinutes, setNewProjectWeeklyMinutes] = useState(180);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("学习对话");
  const [profile, setProfile] = useState<UserProfile>(() => profileFromEmail(session.user.email));
  const [draftProfile, setDraftProfile] = useState<UserProfile>(() => profileFromEmail(session.user.email));
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<"idle" | "success" | "error">("idle");
  const [profileMessage, setProfileMessage] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [insightError, setInsightError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [routeEditorOpen, setRouteEditorOpen] = useState(false);
  const [savingSteps, setSavingSteps] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState("");
  const [uploadingResource, setUploadingResource] = useState(false);
  const [deletingResourceId, setDeletingResourceId] = useState("");
  const [checkingImageMessageIds, setCheckingImageMessageIds] = useState<Set<string>>(() => new Set());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagePollingTasksRef = useRef<Set<string>>(new Set());
  const imagePollingTimersRef = useRef<Map<string, number>>(new Map());

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || projects[0],
    [activeProjectId, projects]
  );

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${session.access_token}`
    }),
    [session.access_token]
  );

  useEffect(() => {
    const timers = imagePollingTimersRef.current;
    const inFlightTasks = imagePollingTasksRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      inFlightTasks.clear();
    };
  }, [activeProjectId]);

  const loadMessages = useCallback(async (project: Project) => {
    const response = await fetch(`/api/projects/${project.id}/messages`, {
      headers: authHeaders
    });
    const data = (await response.json()) as ApiMessagesResponse;
    if (response.status === 401) {
      onSignOut();
      return;
    }
    if (!response.ok) throw new Error(data.error || "消息记录加载失败");

    const conversationId = data.conversationId;
    setProjects((current) => current.map((item) => (item.id === project.id ? { ...item, conversationId } : item)));
    shouldStickToBottomRef.current = true;
    setMessages(data.messages?.length ? data.messages : initialMessages);
  }, [authHeaders, onSignOut]);

  const loadProjectDetails = useCallback(async (project: Project) => {
    const response = await fetch(`/api/projects/${project.id}/details`, {
      headers: authHeaders
    });
    const data = (await response.json()) as ApiProjectDetailsResponse;
    if (response.status === 401) {
      onSignOut();
      return;
    }
    if (!response.ok) throw new Error(data.error || "项目详情加载失败");

    setLearningSteps(data.steps || []);
    setResources(data.resources || []);
    setKnowledgeNodes(data.knowledgeNodes || []);
    setKnowledgeEdges(data.knowledgeEdges || []);
    setProjectStats(data.stats || defaultProjectStats);
    if (typeof data.progress === "number") {
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? {
                ...item,
                progress: data.progress as number,
                goal: data.goal ?? item.goal,
                weeklyMinutes: data.weeklyMinutes ?? item.weeklyMinutes
              }
            : item
        )
      );
    }
  }, [authHeaders, onSignOut]);

  const loadAssessment = useCallback(async (project: Project) => {
    const response = await fetch(`/api/projects/${project.id}/assessments`, {
      headers: authHeaders
    });
    const data = (await response.json()) as ApiAssessmentResponse;
    if (response.status === 401) {
      onSignOut();
      return;
    }
    if (!response.ok) {
      setAssessment(null);
      setAssessmentError(data.error || "测评记录加载失败");
      return;
    }
    setAssessment(data.assessment || null);
    setAssessmentError("");
  }, [authHeaders, onSignOut]);

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      setIsBootstrapping(true);
      setWorkspaceError("");

      try {
        const response = await fetch("/api/projects", {
          headers: authHeaders
        });
        const data = (await response.json()) as ApiProjectsResponse;
        if (response.status === 401) {
          onSignOut();
          return;
        }
        if (!response.ok || !data.projects?.length) throw new Error(data.error || "项目加载失败");
        if (cancelled) return;

        const routeState = getRouteState();
        const requestedProject = routeState.projectId ? data.projects.find((project) => project.id === routeState.projectId) : undefined;
        if (routeState.projectId && !requestedProject) {
          throw new Error("项目不存在或无权访问，请先选择自己的学习项目。");
        }
        const initialProject = requestedProject || data.projects[0];

        setProjects(data.projects);
        setActiveProjectId(initialProject.id);
        setActiveSection(routeState.section);
        updateWorkspaceRoute(initialProject.id, routeState.section, true);
        await loadMessages(initialProject);
        await loadProjectDetails(initialProject);
        await loadAssessment(initialProject);
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "工作台加载失败，请稍后重试。");
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [authHeaders, loadMessages, loadProjectDetails, loadAssessment, onSignOut]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/profile", {
          headers: authHeaders
        });
        const data = (await response.json()) as ApiProfileResponse;
        if (response.status === 401) {
          onSignOut();
          return;
        }
        if (!response.ok || !data.profile) throw new Error(data.error || "个人资料加载失败");
        if (cancelled) return;
        setProfile(data.profile);
        setDraftProfile(data.profile);
      } catch {
        if (!cancelled) {
          const fallbackProfile = profileFromEmail(session.user.email);
          setProfile(fallbackProfile);
          setDraftProfile(fallbackProfile);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [authHeaders, onSignOut, session.user.email]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);



  useEffect(() => {
    return () => {
      if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
    };
  }, [previewAvatarUrl]);

  const trackMessageScroll = () => {
    const messageList = messagesRef.current;
    if (!messageList) return;

    const distanceToBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 96;
  };

  const registerMessageRef = (messageId: string, node: HTMLElement | null) => {
    messageRefs.current[messageId] = node;
  };

  const jumpToMessage = (messageId: string) => {
    const messageNode = messageRefs.current[messageId];
    if (!messageNode) return;

    shouldStickToBottomRef.current = false;
    messageNode.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(""), 1800);
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    event.target.value = "";

    const run = async () => {
      if (!activeProject) return;
      setUploadingResource(true);
      setInsightError("");

      try {
        for (const file of files) {
          const storagePath = `${session.user.id}/${activeProject.id}/${Date.now()}-${getSafeStorageName(file.name)}`;
          try {
            await uploadProjectFile(session.access_token, storagePath, file);

            const response = await fetch(`/api/projects/${activeProject.id}/documents`, {
              method: "POST",
              headers: {
                ...authHeaders,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                name: file.name,
                storagePath,
                mimeType: file.type,
                sizeBytes: file.size
              })
            });
            const data = (await response.json()) as { resource?: Resource; error?: string };
            if (response.status === 401) {
              onSignOut();
              return;
            }
            if (!response.ok || !data.resource) throw new Error(data.error || "资料保存失败");

            setResources((current) => [data.resource as Resource, ...current]);
            setProjectStats((current) => ({ ...current, resources: current.resources + 1, recentStudyAt: new Date().toISOString() }));
          } catch (error) {
            void deleteProjectFile(session.access_token, storagePath).catch((deleteError) => console.warn("资料上传回滚删除失败", deleteError));
            throw error;
          }
        }
      } catch (error) {
        console.error(error);
        setInsightError(error instanceof Error ? error.message : "资料上传失败，请稍后重试。");
      } finally {
        setUploadingResource(false);
      }
    };

    void run();
  };

  const getFriendlyErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : "";

    if (/Failed to fetch|Load failed|NetworkError|fetch/i.test(message)) {
      return "网络连接不稳定，消息没有成功发送。请检查网络后再试一次。";
    }

    if (/stream|reader|body/i.test(message)) {
      return "模型回复过程中连接中断了，请稍后重试，或把问题拆短一点再发送。";
    }

    return message || "模型服务暂时不可用，请稍后再试。";
  };

  const setImageMessageChecking = (messageId: string, checking: boolean) => {
    setCheckingImageMessageIds((current) => {
      const next = new Set(current);
      if (checking) {
        next.add(messageId);
      } else {
        next.delete(messageId);
      }
      return next;
    });
  };

  const startImageStatusPolling = useCallback(
    (message: Message, initialPollCount = 1, options: { manual?: boolean } = {}) => {
      if (!activeProject) return;

      const task = getImageTaskFromMessage(message);
      console.log("[image-continue-query]", {
        hasTaskId: Boolean(task?.taskId),
        taskId: maskTaskId(task?.taskId),
        messageId: message.id,
        manual: Boolean(options.manual)
      });

      if (!task) {
        if (options.manual) {
          const messageText = "未找到该图片任务编号，无法继续查询。";
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id
                ? {
                    ...item,
                    content: messageText,
                    parts: item.parts?.map((part) =>
                      part.type === "image"
                        ? {
                            ...part,
                            status: "generating",
                            error: messageText
                          }
                        : part
                    )
                  }
                : item
            )
          );
        }
        return;
      }

      if (!options.manual && !shouldAutoPollImageTask(task)) {
        const elapsedMs = getImageTaskElapsedMs(task);
        console.info("[image-auto-poll-stop]", {
          messageId: message.id,
          taskId: maskTaskId(task.taskId),
          elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : null,
          taskStatus: task.taskStatus
        });
        if (task.taskStatus !== "3" && task.taskStatus !== "4") {
          const messageText = `图片任务已保留，可稍后手动继续查询原任务。已等待 ${Number.isFinite(elapsedMs) ? formatElapsedTime(elapsedMs) : "较长时间"}`;
          setMessages((current) =>
            current.map((item) => {
              if (item.id !== message.id || hasCompletedImage(item)) return item;
              return {
                ...item,
                content: messageText,
                parts: item.parts?.map((part) =>
                  part.type === "image"
                    ? {
                        ...part,
                        error: messageText,
                        autoStopped: true,
                        elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : part.elapsedMs
                      }
                    : part
                )
              };
            })
          );
        }
        return;
      }

      const pollingKey = `${message.id}:${task.taskId}`;

      const poll = async (currentMessage: Message, pollCount: number) => {
        const currentTask = getImageTaskFromMessage(currentMessage);
        if (!currentTask) {
          imagePollingTasksRef.current.delete(pollingKey);
          setImageMessageChecking(currentMessage.id, false);
          return;
        }

        if (imagePollingTasksRef.current.has(pollingKey)) return;
        imagePollingTasksRef.current.add(pollingKey);
        setImageMessageChecking(currentMessage.id, true);

        try {
          const response = await fetch("/api/generate/image/status", {
            method: "POST",
            headers: {
              ...authHeaders,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              projectId: activeProject.id,
              messageId: currentMessage.id,
              taskId: currentTask.taskId,
              prompt: currentTask.prompt,
              pollCount
            })
          });
          const data = (await response.json()) as ApiImageStatusResponse;
          if (response.status === 401) {
            onSignOut();
            return;
          }
          if (!response.ok || !data.message) throw new Error(data.error || "图片任务查询失败");

          const responseMessage =
            options.manual && data.status !== "completed"
              ? markImageAutoStopped(data.message as Message, true)
              : (data.message as Message);
          setMessages((current) => replaceMessageKeepingCompletedImage(current, responseMessage));

          const nextTask = getImageTaskFromMessage(responseMessage);
          const shouldContinue =
            !options.manual &&
            data.status !== "completed" &&
            pollCount < imagePollMaxCount &&
            shouldAutoPollImageTask(nextTask);
          if (shouldContinue) {
            const existingTimer = imagePollingTimersRef.current.get(pollingKey);
            if (existingTimer) window.clearTimeout(existingTimer);
            const timer = window.setTimeout(() => {
              imagePollingTimersRef.current.delete(pollingKey);
              void poll(data.message as Message, pollCount + 1);
            }, imagePollIntervalMs);
            imagePollingTimersRef.current.set(pollingKey, timer);
            return;
          }
        } catch (error) {
          const messageText = getFriendlyErrorMessage(error) || "图片任务查询失败，请稍后重试。";
          setMessages((current) =>
            current.map((item) => {
              if (item.id !== currentMessage.id || hasCompletedImage(item)) return item;
              return {
                ...item,
                content: messageText,
                parts: item.parts?.map((part) =>
                  part.type === "image"
                    ? {
                        ...part,
                        status: "generating",
                        error: messageText
                      }
                    : part
                )
              };
            })
          );
        } finally {
          imagePollingTasksRef.current.delete(pollingKey);
          setImageMessageChecking(currentMessage.id, false);
        }
      };

      void poll(message, initialPollCount);
    },
    [activeProject, authHeaders, onSignOut]
  );


  useEffect(() => {
    if (!activeProject) return;

    messages.forEach((message) => {
      if (getImageTaskFromMessage(message)) {
        startImageStatusPolling(message);
      }
    });
  }, [activeProject, messages, startImageStatusPolling]);

  const sendMessage = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || isLoading) return;
    if (!activeProject) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      time: nowLabel()
    };

    const history = messages.map(({ role, content }) => ({ role, content }));
    const currentStep = learningSteps.find((step) => step.status === "doing")?.title || learningSteps[0]?.title || "";
    shouldStickToBottomRef.current = true;
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);

    const assistantMessageId = crypto.randomUUID();

    try {


      if (isImageGenerationRequest(messageText)) {
        const response = await fetch("/api/generate/image", {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: cleanImagePrompt(messageText),
            projectId: activeProject.id,
            conversationId: activeProject.conversationId,
            projectName: activeProject.name
          })
        });
        const data = (await response.json()) as ApiImageGenerationResponse;
        if (response.status === 401) {
          onSignOut();
          return;
        }
        if (!response.ok || !data.message) throw new Error(data.error || "图片生成失败");

        if (data.conversationId) {
          setProjects((current) =>
            current.map((project) => (project.id === activeProject.id ? { ...project, conversationId: data.conversationId } : project))
          );
        }

        const imageMessage = data.message as Message;
        setMessages((current) => [...current, imageMessage]);
        if (data.status === "processing") {
          startImageStatusPolling(imageMessage);
        }
        return;
      }

      const chatMessageText =
        isVideoGenerationRequest(messageText)
          ? `用户请求生成视频：${messageText}\n\n当前版本不支持生成视频。请不要创建视频任务，不要输出分镜脚本或制作流程，直接用文字讲解用户真正想学习的主题，并在回答开头用小括号备注“当前版本不支持生成视频”。`
          : messageText;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: chatMessageText,
          projectId: activeProject.id,
          conversationId: activeProject.conversationId,
          projectName: activeProject.name,
          projectGoal: activeProject.goal || "",
          currentStep,
          mode,
          history,
          steps: learningSteps.map(({ title, status }) => ({ title, status })),
          resources: resources.map(({ name, type }) => ({ name, type }))
        })
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        if (response.status === 401) onSignOut();
        throw new Error(data.error || "请求失败");
      }

      if (!response.body) throw new Error("浏览器不支持流式响应，请刷新后再试。");
      const conversationId = response.headers.get("X-Zhijie-Conversation") || activeProject.conversationId;
      if (conversationId) {
        setProjects((current) => current.map((project) => (project.id === activeProject.id ? { ...project, conversationId } : project)));
      }

      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          time: response.headers.get("X-Zhijie-Demo") === "true" ? "演示模式" : "生成中"
        }
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, content: fullText } : message))
        );
      }

      fullText += decoder.decode();
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: fullText || "我暂时没有生成有效回复，请再试一次。",
                time: response.headers.get("X-Zhijie-Demo") === "true" ? "演示模式" : nowLabel()
              }
            : message
        )
      );
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: getFriendlyErrorMessage(error),
          time: "发送失败"
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage();
  };

  const createProject = (event: FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    const run = async () => {
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            goal: newProjectGoal.trim(),
            baseline: newProjectBaseline.trim(),
            weeklyMinutes: newProjectWeeklyMinutes
          })
        });
        const data = (await response.json()) as { project?: Project; error?: string };
        if (!response.ok || !data.project) throw new Error(data.error || "项目创建失败");

        setProjects((current) => [data.project as Project, ...current]);
        setActiveProjectId(data.project.id);
        updateWorkspaceRoute(data.project.id, activeSection);
        await loadProjectDetails(data.project);
        await loadAssessment(data.project);
        shouldStickToBottomRef.current = true;
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `“${name}”项目已经创建。你可以直接提出第一个问题，也可以补充学习目标、时间安排或已有资料，我会据此生成专属学习路线。`,
            time: "刚刚"
          }
        ]);
        setNewProjectName("");
        setNewProjectGoal("");
        setNewProjectBaseline("");
        setNewProjectWeeklyMinutes(180);
        setNewProjectOpen(false);
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : "项目创建失败，请稍后重试。");
      }
    };

    void run();
  };

  const changeProject = (projectId: string) => {
    setActiveProjectId(projectId);
    const project = projects.find((item) => item.id === projectId);
    updateWorkspaceRoute(projectId, activeSection);
    if (project) {
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "正在加载这个项目的历史消息...",
          time: "加载中"
        }
      ]);
      void loadMessages(project).catch((error) => {
        setWorkspaceError(error instanceof Error ? error.message : "消息记录加载失败。");
      });
      void loadProjectDetails(project).catch((error) => {
        setInsightError(error instanceof Error ? error.message : "项目详情加载失败。");
      });
      void loadAssessment(project);
    }
    setMobileNavOpen(false);
  };

  const changeSection = (section: WorkspaceSection) => {
    setActiveSection(section);
    if (activeProject) updateWorkspaceRoute(activeProject.id, section);
    setMobileNavOpen(false);
  };

  const reloadProjects = async () => {
    const response = await fetch("/api/projects", {
      headers: authHeaders
    });
    const data = (await response.json()) as ApiProjectsResponse;
    if (response.status === 401) {
      onSignOut();
      return;
    }
    if (!response.ok || !data.projects?.length) throw new Error(data.error || "项目重新加载失败");

    setProjects(data.projects);
    setActiveProjectId(data.projects[0].id);
    updateWorkspaceRoute(data.projects[0].id, activeSection, true);
    await loadMessages(data.projects[0]);
    await loadProjectDetails(data.projects[0]);
    await loadAssessment(data.projects[0]);
  };

  const deleteProject = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project || deletingProjectId) return;

    const confirmed = window.confirm(`确定删除“${project.name}”吗？该项目内的对话、消息和资料都会一起删除。`);
    if (!confirmed) return;

    setDeletingProjectId(projectId);
    setWorkspaceError("");

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: authHeaders
      });
      const data = (await response.json()) as { error?: string };
      if (response.status === 401) {
        onSignOut();
        return;
      }
      if (!response.ok) throw new Error(data.error || "项目删除失败");

      const remainingProjects = projects.filter((item) => item.id !== projectId);
      setProjects(remainingProjects);

      if (activeProjectId !== projectId) return;

      if (remainingProjects[0]) {
        setActiveProjectId(remainingProjects[0].id);
        updateWorkspaceRoute(remainingProjects[0].id, activeSection, true);
        await loadMessages(remainingProjects[0]);
        await loadProjectDetails(remainingProjects[0]);
        await loadAssessment(remainingProjects[0]);
      } else {
        await reloadProjects();
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "项目删除失败，请稍后重试。");
    } finally {
      setDeletingProjectId("");
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!activeProject || deletingMessageId || isLoading) return;

    const confirmed = window.confirm("确定删除这条消息吗？删除后无法恢复。");
    if (!confirmed) return;

    setDeletingMessageId(messageId);
    setWorkspaceError("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/messages/${messageId}`, {
        method: "DELETE",
        headers: authHeaders
      });
      const data = (await response.json()) as { error?: string };
      if (response.status === 401) {
        onSignOut();
        return;
      }
      if (!response.ok) throw new Error(data.error || "消息删除失败");

      setMessages((current) => current.filter((message) => message.id !== messageId));
      if (highlightedMessageId === messageId) setHighlightedMessageId("");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "消息删除失败，请稍后重试。");
    } finally {
      setDeletingMessageId("");
    }
  };

  const saveLearningSteps = async (steps: LearningStep[]) => {
    if (!activeProject || savingSteps) return;
    setSavingSteps(true);
    setInsightError("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/steps`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ steps })
      });
      const data = (await response.json()) as { steps?: LearningStep[]; progress?: number; error?: string };
      if (response.status === 401) {
        onSignOut();
        return;
      }
      if (!response.ok || !data.steps || typeof data.progress !== "number") throw new Error(data.error || "学习路线保存失败");

      setLearningSteps(data.steps);
      setProjects((current) => current.map((project) => (project.id === activeProject.id ? { ...project, progress: data.progress as number } : project)));
      setProjectStats((current) => ({
        ...current,
        done: data.steps?.filter((step) => step.status === "done").length || 0,
        doing: data.steps?.filter((step) => step.status === "doing").length || 0,
        todo: data.steps?.filter((step) => step.status === "todo").length || 0,
        recentStudyAt: new Date().toISOString()
      }));
      setRouteEditorOpen(false);
    } catch (error) {
      console.error(error);
      setInsightError(error instanceof Error ? error.message : "学习路线保存失败，请稍后重试。");
    } finally {
      setSavingSteps(false);
    }
  };

  const generateAssessment = async () => {
    if (!activeProject || assessmentLoading) return;
    setAssessmentLoading(true);
    setAssessmentError("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/assessments`, {
        method: "POST",
        headers: authHeaders
      });
      const data = (await response.json()) as ApiAssessmentResponse;
      if (response.status === 401) {
        onSignOut();
        return;
      }
      if (!response.ok || !data.assessment) throw new Error(data.error || "测评生成失败");
      setAssessment(data.assessment);
    } catch (error) {
      setAssessmentError(error instanceof Error ? error.message : "测评生成失败，请稍后重试。");
    } finally {
      setAssessmentLoading(false);
    }
  };

  const submitAssessment = async (answers: Array<{ itemId: string; answer: string }>) => {
    if (!activeProject || !assessment || assessmentLoading) return;
    setAssessmentLoading(true);
    setAssessmentError("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/assessments/${assessment.id}/submit`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ answers })
      });
      const data = (await response.json()) as ApiAssessmentResponse;
      if (response.status === 401) {
        onSignOut();
        return;
      }
      if (!response.ok || !data.assessment) throw new Error(data.error || "测评提交失败");
      setAssessment(data.assessment);
      await loadProjectDetails(activeProject);
    } catch (error) {
      setAssessmentError(error instanceof Error ? error.message : "测评提交失败，请稍后重试。");
    } finally {
      setAssessmentLoading(false);
    }
  };

  const deleteResource = async (resourceId: string) => {
    if (!activeProject || deletingResourceId) return;
    const resource = resources.find((item) => item.id === resourceId);
    if (!resource) return;
    if (!window.confirm(`确定删除“${resource.name}”吗？资料记录和文件都会被删除。`)) return;

    setDeletingResourceId(resourceId);
    setInsightError("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/documents/${resourceId}`, {
        method: "DELETE",
        headers: authHeaders
      });
      const data = (await response.json()) as { error?: string };
      if (response.status === 401) {
        onSignOut();
        return;
      }
      if (!response.ok) throw new Error(data.error || "资料删除失败");

      setResources((current) => current.filter((item) => item.id !== resourceId));
      setProjectStats((current) => ({ ...current, resources: Math.max(current.resources - 1, 0), recentStudyAt: new Date().toISOString() }));
    } catch (error) {
      console.error(error);
      setInsightError(error instanceof Error ? error.message : "资料删除失败，请稍后重试。");
    } finally {
      setDeletingResourceId("");
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const routeState = getRouteState();
      if (!routeState.projectId) return;

      const routeProject = projects.find((project) => project.id === routeState.projectId);
      if (!routeProject) {
        setWorkspaceError("项目不存在或无权访问，请先选择自己的学习项目。");
        return;
      }

      setActiveSection(routeState.section);
      if (routeProject.id !== activeProjectId) {
        setActiveProjectId(routeProject.id);
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "正在加载这个项目的历史消息...",
            time: "加载中"
          }
        ]);
        void loadMessages(routeProject).catch((error) => {
          setWorkspaceError(error instanceof Error ? error.message : "消息记录加载失败。");
        });
        void loadProjectDetails(routeProject).catch((error) => {
          setInsightError(error instanceof Error ? error.message : "项目详情加载失败。");
        });
        void loadAssessment(routeProject);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeProjectId, loadMessages, loadProjectDetails, loadAssessment, projects]);

  const openProfileSettings = () => {
    setDraftProfile(profile);
    setSelectedAvatarFile(null);
    if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
    setPreviewAvatarUrl("");
    setProfileStatus("idle");
    setProfileMessage("");
    setProfileOpen(true);
  };

  const closeProfileSettings = () => {
    if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
    setSelectedAvatarFile(null);
    setPreviewAvatarUrl("");
    setProfileOpen(false);
  };

  const selectAvatarFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setProfileStatus("idle");
    setProfileMessage("");

    if (!file) return;

    if (!allowedAvatarTypes.includes(file.type)) {
      setProfileStatus("error");
      setProfileMessage("请选择 JPG、PNG 或 WebP 图片。");
      return;
    }

    if (file.size > maxAvatarSize) {
      setProfileStatus("error");
      setProfileMessage("头像图片不能超过 5MB。");
      return;
    }

    if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
    setSelectedAvatarFile(file);
    setPreviewAvatarUrl(URL.createObjectURL(file));
  };

  const clearSelectedAvatar = () => {
    if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
    setSelectedAvatarFile(null);
    setPreviewAvatarUrl("");
    setProfileStatus("idle");
    setProfileMessage("");
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (profileSaving) return;

    const nickname = draftProfile.nickname.trim();
    if (nickname.length < 2 || nickname.length > 30) {
      setProfileStatus("error");
      setProfileMessage("昵称长度需要在 2 到 30 个字符之间。");
      return;
    }

    setProfileSaving(true);
    setProfileStatus("idle");
    setProfileMessage("保存中...");

    let uploadedAvatarPath = "";

    try {
      let nextAvatarUrl = draftProfile.avatarUrl;
      let nextAvatarPath = draftProfile.avatarPath;

      if (selectedAvatarFile) {
        const nextPath = `${session.user.id}/avatar-${Date.now()}.${getAvatarExtension(selectedAvatarFile)}`;
        await uploadAvatarFile(session.access_token, nextPath, selectedAvatarFile);
        uploadedAvatarPath = nextPath;
        nextAvatarPath = nextPath;
        nextAvatarUrl = getAvatarPublicUrl(nextPath);
      }

      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nickname,
          avatarUrl: nextAvatarUrl,
          avatarPath: nextAvatarPath
        })
      });
      const data = (await response.json()) as ApiProfileResponse;
      if (response.status === 401) {
        onSignOut();
        return;
      }
      if (!response.ok || !data.profile) throw new Error(data.error || "个人资料保存失败");

      if (selectedAvatarFile && profile.avatarPath && profile.avatarPath !== data.profile.avatarPath) {
        void deleteAvatarFile(session.access_token, profile.avatarPath).catch((error) => console.warn("旧头像删除失败", error));
      }

      setProfile(data.profile);
      setDraftProfile(data.profile);
      clearSelectedAvatar();
      setProfileStatus("success");
      setProfileMessage("保存成功。");
    } catch (error) {
      if (uploadedAvatarPath) {
        void deleteAvatarFile(session.access_token, uploadedAvatarPath).catch((deleteError) => console.warn("新头像回滚删除失败", deleteError));
      }
      setProfileStatus("error");
      setProfileMessage(getFriendlyProfileError(error));
    } finally {
      setProfileSaving(false);
    }
  };

  const startKnowledgeLearning = (title: string) => {
    changeSection("学习对话");
    setInput(`请围绕「${title}」帮我讲解核心概念、前置知识、常见误区，并给我 3 道练习题。`);
  };

  if (isBootstrapping) {
    return (
      <main className="app-shell loading-shell">
        <div className="workspace-empty-state">
          <strong>正在进入知界 AI</strong>
          <span>正在加载你的项目和历史消息...</span>
        </div>
      </main>
    );
  }

  if (workspaceError || !activeProject) {
    return (
      <main className="app-shell loading-shell">
        <div className="workspace-empty-state">
          <strong>工作台暂时无法打开</strong>
          <span>{workspaceError || "没有可用项目，请稍后重试。"}</span>
          <button onClick={onSignOut}>退出登录</button>
        </div>
      </main>
    );
  }

  const insightPanel = (
    <InsightPanel
      activeProject={activeProject}
      resources={resources}
      learningSteps={learningSteps}
      stats={projectStats}
      error={insightError}
      detailsOpen={detailsOpen}
      routeEditorOpen={routeEditorOpen}
      savingSteps={savingSteps}
      uploadingResource={uploadingResource}
      deletingResourceId={deletingResourceId}
      fileInputRef={fileInputRef}
      onOpenDetails={() => setDetailsOpen(true)}
      onCloseDetails={() => setDetailsOpen(false)}
      onOpenRouteEditor={() => setRouteEditorOpen(true)}
      onCloseRouteEditor={() => setRouteEditorOpen(false)}
      onSaveSteps={(steps) => void saveLearningSteps(steps)}
      onDeleteResource={(resourceId) => void deleteResource(resourceId)}
    />
  );

  return (
    <main className="app-shell">
      <WorkspaceSidebar
        activeSection={activeSection}
        mobileNavOpen={mobileNavOpen}
        projects={projects}
        activeProjectId={activeProjectId}
        onCloseMobileNav={() => setMobileNavOpen(false)}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onOpenNewProject={() => setNewProjectOpen(true)}
        onSelectProject={changeProject}
        onDeleteProject={(projectId) => void deleteProject(projectId)}
        onSelectSection={changeSection}
        userEmail={session.user.email || "已登录用户"}
        profile={profile}
        deletingProjectId={deletingProjectId}
        onOpenProfile={openProfileSettings}
        onSignOut={onSignOut}
      />

      <section className="workspace">
        <WorkspaceHeader
          activeProject={activeProject}
          mode={mode}
          modes={learningModes}
          isModeOpen={isModeOpen}
          messages={messages}
          resources={resources}
          isSearchOpen={isSearchOpen}
          searchQuery={searchQuery}
          onToggleModeMenu={() => setIsModeOpen((current) => !current)}
          onSelectMode={(selectedMode) => {
            setMode(selectedMode);
            setIsModeOpen(false);
          }}
          onOpenSearch={() => setIsSearchOpen(true)}
          onCloseSearch={() => {
            setIsSearchOpen(false);
            setSearchQuery("");
          }}
          onSearchQueryChange={setSearchQuery}
          onSelectMessage={jumpToMessage}
        />

        {activeSection === "学习对话" ? (
          <div className="workspace-grid">
            <ChatPanel
              activeProject={activeProject}
              resources={resources}
              messages={messages}
              input={input}
              mode={mode}
              isLoading={isLoading}
              isRecording={isRecording}
              suggestionPrompts={suggestionPrompts}
              fileInputRef={fileInputRef}
              imageInputRef={imageInputRef}
              messagesRef={messagesRef}
              bottomRef={bottomRef}
              highlightedMessageId={highlightedMessageId}
              deletingMessageId={deletingMessageId}
              onMessagesScroll={trackMessageScroll}
              onRegisterMessage={registerMessageRef}
              onDeleteMessage={(messageId) => void deleteMessage(messageId)}
              onInputChange={setInput}
              onSubmitMessage={submitMessage}
              onSendMessage={(text) => void sendMessage(text)}
              onCheckImageStatus={(message) => startImageStatusPolling(message, 1, { manual: true })}
              checkingImageMessageIds={checkingImageMessageIds}
              onToggleRecording={() => setIsRecording((current) => !current)}
            />
            {insightPanel}
          </div>
        ) : (
          <div className="workspace-grid module-workspace-grid">
            {activeSection === "总览" && (
              <ProjectOverview
                activeProject={activeProject}
                resources={resources}
                learningSteps={learningSteps}
                stats={projectStats}
                messages={messages}
                knowledgeNodes={knowledgeNodes}
                knowledgeEdges={knowledgeEdges}
                assessment={assessment}
                assessmentLoading={assessmentLoading}
                assessmentError={assessmentError}
                onGenerateAssessment={() => void generateAssessment()}
                onSubmitAssessment={(answers) => void submitAssessment(answers)}
              />
            )}
            {activeSection === "资料库" && (
              <ResourceLibrary
                activeProject={activeProject}
                resources={resources}
                session={session}
                uploadingResource={uploadingResource}
                deletingResourceId={deletingResourceId}
                fileInputRef={fileInputRef}
                onDeleteResource={(resourceId) => void deleteResource(resourceId)}
              />
            )}
            {activeSection === "知识地图" && (
              <KnowledgeMap
                activeProject={activeProject}
                resources={resources}
                learningSteps={learningSteps}
                stats={projectStats}
                messages={messages}
                knowledgeNodes={knowledgeNodes}
                knowledgeEdges={knowledgeEdges}
                onStartKnowledge={startKnowledgeLearning}
              />
            )}
            {insightPanel}
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple hidden onChange={addFiles} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.xlsx" />
        <input ref={imageInputRef} type="file" multiple hidden onChange={addFiles} accept="image/*" />
      </section>

      {newProjectOpen && (
        <NewProjectModal
          newProjectName={newProjectName}
          goal={newProjectGoal}
          baseline={newProjectBaseline}
          weeklyMinutes={newProjectWeeklyMinutes}
          onClose={() => setNewProjectOpen(false)}
          onSubmit={createProject}
          onNameChange={setNewProjectName}
          onGoalChange={setNewProjectGoal}
          onBaselineChange={setNewProjectBaseline}
          onWeeklyMinutesChange={setNewProjectWeeklyMinutes}
        />
      )}

      {profileOpen && (
        <ProfileModal
          draftProfile={draftProfile}
          previewAvatarUrl={previewAvatarUrl}
          selectedAvatarName={selectedAvatarFile?.name || ""}
          isSaving={profileSaving}
          status={profileStatus}
          error={profileMessage}
          onClose={closeProfileSettings}
          onSubmit={saveProfile}
          onProfileChange={setDraftProfile}
          onAvatarSelect={selectAvatarFile}
          onAvatarClear={clearSelectedAvatar}
        />
      )}
    </main>
  );
}
