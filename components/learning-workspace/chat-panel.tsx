import { FormEvent, RefObject } from "react";
import {
  BookOpen,
  BrainCircuit,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  LineChart,
  Mic,
  Paperclip,
  Send,
  Sparkles,
  Trash2
} from "lucide-react";
import { MessageRenderer } from "./message-renderer";
import type { Message, Project, Resource } from "./types";

type ChatPanelProps = {
  activeProject: Project;
  resources: Resource[];
  messages: Message[];
  input: string;
  mode: string;
  isLoading: boolean;
  isRecording: boolean;
  suggestionPrompts: string[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  messagesRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  highlightedMessageId: string;
  deletingMessageId: string;
  onMessagesScroll: () => void;
  onRegisterMessage: (messageId: string, node: HTMLElement | null) => void;
  onDeleteMessage: (messageId: string) => void;
  onInputChange: (value: string) => void;
  onSubmitMessage: (event: FormEvent) => void;
  onSendMessage: (text?: string) => void;
  onCheckImageStatus: (message: Message) => void;
  onCheckVideoStatus: (message: Message) => void;
  onToggleRecording: () => void;
};

export function ChatPanel({
  activeProject,
  resources,
  messages,
  input,
  mode,
  isLoading,
  isRecording,
  suggestionPrompts,
  fileInputRef,
  imageInputRef,
  messagesRef,
  bottomRef,
  highlightedMessageId,
  deletingMessageId,
  onMessagesScroll,
  onRegisterMessage,
  onDeleteMessage,
  onInputChange,
  onSubmitMessage,
  onSendMessage,
  onCheckImageStatus,
  onCheckVideoStatus,
  onToggleRecording
}: ChatPanelProps) {
  return (
    <section className="chat-panel">
      <div className="context-bar">
        <span>
          <BookOpen size={15} /> 当前上下文
        </span>
        <button>{activeProject.name}</button>
        <button>{resources.length} 份资料</button>
        <button>{mode}</button>
      </div>

      <div className="messages" ref={messagesRef} onScroll={onMessagesScroll} aria-live="polite">
        <div className="welcome-card">
          <div className="welcome-icon">
            <Lightbulb size={22} />
          </div>
          <div>
            <span>竞赛演示建议从这里开始</span>
            <strong>梳理作品定位、核心创新与答辩讲述路径</strong>
            <p>预计 15 分钟 · 完成后可直接用于路演说明</p>
          </div>
          <button onClick={() => onSendMessage("帮我准备知界 AI 的竞赛演示讲解")}>开始</button>
        </div>

        {messages.map((message) => (
          <article
            className={`message ${message.role} ${highlightedMessageId === message.id ? "highlighted" : ""}`}
            key={message.id}
            ref={(node) => onRegisterMessage(message.id, node)}
          >
            <div className="message-avatar">{message.role === "assistant" ? <BrainCircuit size={18} /> : "我"}</div>
            <div className="message-content">
              <div className="message-meta">
                <strong>{message.role === "assistant" ? "知界 AI" : "我"}</strong>
                <span>{message.time}</span>
                <button
                  type="button"
                  className="message-delete"
                  onClick={() => onDeleteMessage(message.id)}
                  disabled={deletingMessageId === message.id}
                  aria-label="删除这条消息"
                  title="删除消息"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="message-bubble">
                <MessageRenderer
                  message={message}
                  onSendMessage={onSendMessage}
                  onCheckImageStatus={onCheckImageStatus}
                  onCheckVideoStatus={onCheckVideoStatus}
                />
              </div>
            </div>
          </article>
        ))}

        {messages.length === 1 && (
          <div className="suggestions">
            {suggestionPrompts.map((suggestion) => (
              <button key={suggestion} onClick={() => onSendMessage(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <article className="message assistant">
            <div className="message-avatar">
              <BrainCircuit size={18} />
            </div>
            <div className="message-content">
              <div className="message-meta">
                <strong>知界 AI</strong>
                <span>正在思考</span>
              </div>
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </article>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={onSubmitMessage}>
        {resources.length > 0 && (
          <div className="composer-context">
            <FileText size={14} /> 已关联 {resources.length} 份项目资料
          </div>
        )}
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSendMessage();
            }
          }}
          placeholder="直接提问，或让知界 AI 生成公式讲解、思维导图、数据图表、教学插图和微课视频..."
          rows={3}
        />
        <div className="composer-toolbar">
          <div>
            <button type="button" onClick={() => fileInputRef.current?.click()} title="上传文件">
              <Paperclip size={18} />
            </button>
            <button type="button" onClick={() => imageInputRef.current?.click()} title="上传图片">
              <ImageIcon size={18} />
            </button>
            <button type="button" className={isRecording ? "recording" : ""} onClick={onToggleRecording} title="语音输入">
              <Mic size={18} />
            </button>
            <span className="generate-toolbar" aria-label="生成内容">
              <button type="button" onClick={() => onInputChange("生成一张教学插图：")} title="生成图片">
                <ImageIcon size={16} /> 图片
              </button>
              <button type="button" onClick={() => onInputChange("画一个数据图表：")} title="生成图表">
                <LineChart size={16} /> 图表
              </button>
              <button type="button" onClick={() => onInputChange("画一个思维导图：")} title="生成思维导图">
                <Sparkles size={16} /> 导图
              </button>
              <button type="button" onClick={() => onInputChange("生成一个 1 分钟教学视频：")} title="生成教学视频">
                <FileText size={16} /> 视频
              </button>
            </span>
            {isRecording && <span className="recording-label">正在录音（演示）</span>}
          </div>
          <button className="send-button" type="submit" disabled={!input.trim() || isLoading}>
            <Send size={17} />
          </button>
        </div>
      </form>
      <p className="ai-note">AI 可能会出错，重要结论请结合课程资料与教师要求核对。</p>
    </section>
  );
}
