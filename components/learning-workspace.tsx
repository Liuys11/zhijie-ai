"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatPanel } from "./learning-workspace/chat-panel";
import { initialMessages, learningModes, suggestionPrompts } from "./learning-workspace/data";
import { InsightPanel } from "./learning-workspace/insight-panel";
import { NewProjectModal } from "./learning-workspace/new-project-modal";
import type { Message, Project, Resource, WorkspaceSection } from "./learning-workspace/types";
import { formatFileSize, nowLabel } from "./learning-workspace/utils";
import { WorkspaceHeader } from "./learning-workspace/workspace-header";
import { WorkspaceSidebar } from "./learning-workspace/workspace-sidebar";
import type { AuthSession } from "@/lib/supabase-browser";

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

export function LearningWorkspace({ session, onSignOut }: LearningWorkspaceProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [resources, setResources] = useState<Resource[]>([
    { id: "r1", name: "软件设计竞赛需求分析.pdf", type: "PDF", size: "2.4 MB" },
    { id: "r2", name: "知界AI功能结构图.png", type: "图片", size: "860 KB" }
  ]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState(learningModes[0]);
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("学习对话");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedMessageId, setHighlightedMessageId] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        setProjects(data.projects);
        setActiveProjectId(data.projects[0].id);
        await loadMessages(data.projects[0]);
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
  }, [authHeaders, loadMessages, onSignOut]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

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

    setResources((current) => [
      ...files.map((file) => ({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        type: file.type.startsWith("image/") ? "图片" : file.name.split(".").pop()?.toUpperCase() || "文件",
        size: formatFileSize(file.size)
      })),
      ...current
    ]);
    event.target.value = "";
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
    shouldStickToBottomRef.current = true;
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);

    const assistantMessageId = crypto.randomUUID();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: messageText,
          projectId: activeProject.id,
          conversationId: activeProject.conversationId,
          projectName: activeProject.name,
          mode,
          history,
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
          body: JSON.stringify({ name })
        });
        const data = (await response.json()) as { project?: Project; error?: string };
        if (!response.ok || !data.project) throw new Error(data.error || "项目创建失败");

        setProjects((current) => [data.project as Project, ...current]);
        setActiveProjectId(data.project.id);
        shouldStickToBottomRef.current = true;
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `“${name}”项目已经创建。你可以直接提出第一个问题，也可以补充学习目标、时间安排或已有资料，我会据此生成项目制学习路线。`,
            time: "刚刚"
          }
        ]);
        setNewProjectName("");
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
    }
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
    await loadMessages(data.projects[0]);
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
        await loadMessages(remainingProjects[0]);
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
        onSelectSection={setActiveSection}
        userEmail={session.user.email || "已登录用户"}
        deletingProjectId={deletingProjectId}
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
            onToggleRecording={() => setIsRecording((current) => !current)}
            onAddFiles={addFiles}
          />

          <InsightPanel activeProject={activeProject} resources={resources} fileInputRef={fileInputRef} />
        </div>
      </section>

      {newProjectOpen && (
        <NewProjectModal
          newProjectName={newProjectName}
          onClose={() => setNewProjectOpen(false)}
          onSubmit={createProject}
          onNameChange={setNewProjectName}
        />
      )}
    </main>
  );
}
