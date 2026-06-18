import { useEffect, useMemo, useRef } from "react";
import { Check, ChevronDown, GraduationCap, Search, Sparkles, X } from "lucide-react";
import type { Message, Project, Resource } from "./types";

type SearchResult =
  | {
      id: string;
      type: "message";
      label: string;
      meta: string;
      excerpt: string;
      messageId: string;
    }
  | {
      id: string;
      type: "resource" | "project";
      label: string;
      meta: string;
      excerpt: string;
    };

type WorkspaceHeaderProps = {
  activeProject: Project;
  mode: string;
  modes: string[];
  isModeOpen: boolean;
  messages: Message[];
  resources: Resource[];
  isSearchOpen: boolean;
  searchQuery: string;
  onToggleModeMenu: () => void;
  onSelectMode: (mode: string) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSearchQueryChange: (query: string) => void;
  onSelectMessage: (messageId: string) => void;
};

function makeExcerpt(content: string, query: string) {
  const cleanContent = content.replace(/\s+/g, " ").trim();
  const lowerContent = cleanContent.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) return cleanContent.slice(0, 86);

  const start = Math.max(matchIndex - 26, 0);
  const end = Math.min(matchIndex + lowerQuery.length + 54, cleanContent.length);
  return `${start > 0 ? "..." : ""}${cleanContent.slice(start, end)}${end < cleanContent.length ? "..." : ""}`;
}

export function WorkspaceHeader({
  activeProject,
  mode,
  modes,
  isModeOpen,
  messages,
  resources,
  isSearchOpen,
  searchQuery,
  onToggleModeMenu,
  onSelectMode,
  onOpenSearch,
  onCloseSearch,
  onSearchQueryChange,
  onSelectMessage
}: WorkspaceHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!normalizedQuery) return [];

    const messageResults = messages
      .filter((message) => message.content.toLowerCase().includes(normalizedQuery))
      .slice(-8)
      .reverse()
      .map((message) => ({
        id: `message-${message.id}`,
        type: "message" as const,
        label: message.role === "assistant" ? "知界 AI" : "我",
        meta: `消息 · ${message.time}`,
        excerpt: makeExcerpt(message.content, searchQuery),
        messageId: message.id
      }));

    const resourceResults = resources
      .filter((resource) => `${resource.name} ${resource.type}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 4)
      .map((resource) => ({
        id: `resource-${resource.id}`,
        type: "resource" as const,
        label: resource.name,
        meta: `资料 · ${resource.type}`,
        excerpt: resource.size
      }));

    const projectText = `${activeProject.name} ${activeProject.subject}`.toLowerCase();
    const projectResults = projectText.includes(normalizedQuery)
      ? [
          {
            id: `project-${activeProject.id}`,
            type: "project" as const,
            label: activeProject.name,
            meta: "当前项目",
            excerpt: activeProject.subject
          }
        ]
      : [];

    return [...messageResults, ...resourceResults, ...projectResults].slice(0, 10);
  }, [activeProject.id, activeProject.name, activeProject.subject, messages, normalizedQuery, resources, searchQuery]);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  return (
    <header className="workspace-header">
      <div>
        <div className="eyebrow">
          <Sparkles size={14} /> 项目制学习空间
        </div>
        <h1>{activeProject.name}</h1>
        <p>{activeProject.subject} · 已连续学习 4 天</p>
      </div>
      <div className="header-actions">
        <div className={`workspace-search ${isSearchOpen ? "open" : ""}`}>
          {isSearchOpen ? (
            <>
              <div className="search-input-row">
                <Search size={17} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") onCloseSearch();
                  }}
                  placeholder="搜索当前项目..."
                />
                {searchQuery && (
                  <button type="button" onClick={() => onSearchQueryChange("")} aria-label="清空搜索">
                    <X size={15} />
                  </button>
                )}
                <button type="button" onClick={onCloseSearch} aria-label="关闭搜索">
                  <X size={16} />
                </button>
              </div>
              <div className="search-results">
                {!searchQuery.trim() && <p>输入关键词，搜索当前项目的消息和资料。</p>}
                {searchQuery.trim() && searchResults.length === 0 && <p>没有找到相关内容。</p>}
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      if (result.type === "message") onSelectMessage(result.messageId);
                    }}
                    disabled={result.type !== "message"}
                  >
                    <span>{result.label}</span>
                    <small>{result.meta}</small>
                    <em>{result.excerpt}</em>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="icon-button" onClick={onOpenSearch} aria-label="搜索">
              <Search size={18} />
            </button>
          )}
        </div>
        <div className="mode-selector">
          <button onClick={onToggleModeMenu}>
            <GraduationCap size={17} /> {mode} <ChevronDown size={15} />
          </button>
          {isModeOpen && (
            <div className="mode-menu">
              {modes.map((item) => (
                <button key={item} onClick={() => onSelectMode(item)}>
                  {item}
                  <span>{item === mode && <Check size={15} />}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
