"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Download, RefreshCw } from "lucide-react";
import type { ChartOption, Message, MessagePart } from "./types";

type MessageRendererProps = {
  message: Message;
  onSendMessage?: (text: string) => void;
  onCheckImageStatus?: (message: Message) => void;
  onCheckVideoStatus?: (message: Message) => void;
  checkingVideoMessageIds?: Set<string>;
};

const markdownComponents: Components = {
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  code({ children, className }) {
    return <code className={className}>{children}</code>;
  }
};

const enableVideoGeneration = process.env.NEXT_PUBLIC_ENABLE_VIDEO_GENERATION === "true";

function parseJsonChart(raw: string): ChartOption | null {
  try {
    const parsed = JSON.parse(raw) as ChartOption;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.series)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function partsFromContent(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let cursor = 0;
  const fencePattern = /```(mermaid|chart|chart-json|echarts)\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content))) {
    const before = content.slice(cursor, match.index);
    if (before.trim()) parts.push({ type: "markdown", content: before });

    const kind = match[1].toLowerCase();
    const body = match[2].trim();
    if (kind === "mermaid") {
      parts.push({ type: "mermaid", content: body });
    } else {
      const option = parseJsonChart(body);
      if (option) {
        parts.push({ type: "chart", option, title: option.title?.text });
      } else {
        parts.push({ type: "markdown", content: match[0] });
      }
    }

    cursor = match.index + match[0].length;
  }

  const rest = content.slice(cursor);
  if (rest.trim() || parts.length === 0) parts.push({ type: "markdown", content: rest || content });
  return parts;
}

function MarkdownPart({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MermaidPart({ content, title }: { content: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  const renderMermaid = useMemo(
    () => async () => {
      setError("");
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor: "#eeefff",
            primaryTextColor: "#172033",
            primaryBorderColor: "#bfc2f0",
            lineColor: "#758096",
            fontFamily: "Inter, Microsoft YaHei, sans-serif"
          }
        });
        const result = await mermaid.render(`zhijie-${id}`, content);
        setSvg(result.svg);
      } catch (renderError) {
        console.error(renderError);
        setError("图形渲染失败，请检查 Mermaid 代码格式。");
      }
    },
    [content, id]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void renderMermaid();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [renderMermaid]);

  const downloadSvg = () => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title || "zhijie-diagram"}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    const svgElement = containerRef.current?.querySelector("svg");
    if (!svgElement) return;

    const serializedSvg = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([serializedSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(image.width, 900);
      canvas.height = Math.max(image.height, 520);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${title || "zhijie-diagram"}.png`;
      link.click();
    };

    image.src = url;
  };

  return (
    <div className="generated-block">
      <div className="generated-block-header">
        <strong>{title || "Mermaid 图形"}</strong>
        <span>
          <button type="button" onClick={() => void renderMermaid()}>
            <RefreshCw size={14} /> 重新渲染
          </button>
          <button type="button" onClick={downloadSvg} disabled={!svg}>
            <Download size={14} /> SVG
          </button>
          <button type="button" onClick={downloadPng} disabled={!svg}>
            <Download size={14} /> PNG
          </button>
        </span>
      </div>
      {error ? <p className="generated-error">{error}</p> : <div ref={containerRef} className="mermaid-stage" dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}

function ChartPart({ option, title }: { option: ChartOption; title?: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<{ dispose: () => void; resize: () => void; getDataURL: (options: { type: "png"; pixelRatio: number; backgroundColor: string }) => string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const renderChart = async () => {
      if (!chartRef.current) return;
      setError("");

      try {
        const echarts = await import("echarts");
        if (cancelled || !chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        chart.setOption(option);
        chartInstanceRef.current = chart;

        const handleResize = () => chart.resize();
        window.addEventListener("resize", handleResize);
        return () => {
          window.removeEventListener("resize", handleResize);
          chart.dispose();
        };
      } catch (chartError) {
        console.error(chartError);
        setError("图表渲染失败，请检查图表配置。");
        return undefined;
      }
    };

    let cleanup: (() => void) | undefined;
    void renderChart().then((dispose) => {
      cleanup = dispose;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [option]);

  const downloadPng = () => {
    const dataUrl = chartInstanceRef.current?.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#ffffff"
    });
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${title || "zhijie-chart"}.png`;
    link.click();
  };

  return (
    <div className="generated-block">
      <div className="generated-block-header">
        <strong>{title || "数据图表"}</strong>
        <span>
          <button type="button" onClick={downloadPng}>
            <Download size={14} /> PNG
          </button>
        </span>
      </div>
      {error ? <p className="generated-error">{error}</p> : <div className="chart-stage" ref={chartRef} />}
    </div>
  );
}

function MediaPlaceholder({
  message,
  part,
  onSendMessage,
  onCheckImageStatus,
  onCheckVideoStatus,
  checkingVideoMessageIds
}: {
  message: Message;
  part: MessagePart;
  onSendMessage?: (text: string) => void;
  onCheckImageStatus?: (message: Message) => void;
  onCheckVideoStatus?: (message: Message) => void;
  checkingVideoMessageIds?: Set<string>;
}) {
  if (part.type === "image") {
    const downloadImage = () => {
      if (!part.url) return;
      const link = document.createElement("a");
      link.href = part.url;
      link.download = "zhijie-generated-image.png";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    };

    return (
      <div className="generated-block">
        <div className="generated-block-header">
          <strong>教学图片</strong>
          <span>
            <button type="button" onClick={() => onSendMessage?.(`重新生成图片：${part.prompt}`)}>
              <RefreshCw size={14} /> 重试
            </button>
            {part.status === "generating" && part.taskId && (
              <button type="button" onClick={() => onCheckImageStatus?.(message)}>
                继续查询
              </button>
            )}
            <button type="button" onClick={() => onSendMessage?.(`请在这张图片描述基础上继续修改：${part.prompt}`)}>
              继续修改
            </button>
            <button type="button" onClick={downloadImage} disabled={!part.url}>
              <Download size={14} /> 下载
            </button>
          </span>
        </div>
        {part.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="generated-image" src={part.url} alt={part.prompt} />
        ) : (
          <p className={part.status === "failed" ? "generated-error" : "generated-note"}>
            {part.error || (part.status === "generating" ? "图片正在生成中，请稍候。" : "图片生成服务尚未配置，暂时无法生成真实图片。")}
          </p>
        )}
      </div>
    );
  }

  if (part.type === "video") {
    const isChecking = checkingVideoMessageIds?.has(message.id) || false;
    const videoTextPrompt = `请直接用文字讲解这个主题，并在开头用小括号备注“当前版本不支持生成视频”：${part.title}`;
    const downloadVideo = () => {
      if (!part.url) return;
      const link = document.createElement("a");
      link.href = part.url;
      link.download = `${part.title || "zhijie-video"}.mp4`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    };

    if (!enableVideoGeneration && !part.url) {
      return (
        <div className="generated-block">
          <div className="generated-block-header">
            <strong>{part.title}</strong>
            <span>
              <button type="button" onClick={() => onSendMessage?.(videoTextPrompt)}>
                <RefreshCw size={14} /> 生成文字讲解
              </button>
            </span>
          </div>
          <p className="generated-note">（当前版本不支持生成视频）可以直接生成文字讲解，避免演示时长时间等待视频队列。</p>
        </div>
      );
    }

    return (
      <div className="generated-block">
        <div className="generated-block-header">
          <strong>{part.title}</strong>
          <span>
            <button type="button" onClick={() => onSendMessage?.(enableVideoGeneration ? `重新生成教学视频：${part.title}` : videoTextPrompt)}>
              <RefreshCw size={14} /> {enableVideoGeneration ? "重新生成" : "生成文字讲解"}
            </button>
            {enableVideoGeneration && part.status === "generating" && (
              <button type="button" onClick={() => onCheckVideoStatus?.(message)} disabled={isChecking}>
                <RefreshCw size={14} /> {isChecking ? "查询中..." : "继续查询"}
              </button>
            )}
            <button type="button" onClick={() => onSendMessage?.(enableVideoGeneration ? `请按这个意见修改教学视频：${part.title}` : videoTextPrompt)}>
              继续修改
            </button>
            {part.url && (
              <button type="button" onClick={downloadVideo}>
                <Download size={14} /> 下载
              </button>
            )}
          </span>
        </div>
        {(part.duration || part.difficulty || part.style) && (
          <p className="generated-note">
            预计时长：{part.duration === "30s" ? "约30秒" : part.duration === "90s" ? "约1分30秒" : "约1分钟"}
            {part.difficulty ? `；难度：${part.difficulty}` : ""}
            {part.style ? `；风格：${part.style}` : ""}
          </p>
        )}
        {enableVideoGeneration && (part.taskIdMasked || part.lastCheckedAt || part.providerStatusLabel || part.providerStatusDetail) && (
          <p className="generated-note">
            {part.taskIdMasked ? `任务：${part.taskIdMasked}` : ""}
            {part.elapsedMs ? `；已等待：${Math.floor(part.elapsedMs / 60000)}分${String(Math.floor((part.elapsedMs % 60000) / 1000)).padStart(2, "0")}秒` : ""}
            {part.lastCheckedAt ? `；最近查询：${part.lastCheckedAt}` : ""}
            {part.providerStatusLabel ? `?${part.providerStatusLabel}` : ""}
            {part.providerStatusDetail ? `?${part.providerStatusDetail}` : ""}
          </p>
        )}
        {part.url ? (
          <video className="generated-video" src={part.url} controls />
        ) : (
          <p className={part.status === "failed" ? "generated-error" : "generated-note"}>
            {enableVideoGeneration
              ? part.error || part.progressLabel || "微课视频任务结构已准备，视频生成服务尚未配置。"
              : "视频生成服务排队较慢，当前演示版已暂停真实 MP4 生成。建议先生成微课脚本、分镜大纲和字幕稿用于展示。"}
          </p>
        )}
        {part.script && <MarkdownPart content={part.script} />}
      </div>
    );
  }

  if (part.type === "generation_status") {
    return <p className={`generation-status ${part.status}`}>{part.label}</p>;
  }

  if (part.type === "error") {
    return <p className="generated-error">{part.message}</p>;
  }

  return null;
}

export function MessageRenderer({ message, onSendMessage, onCheckImageStatus, onCheckVideoStatus, checkingVideoMessageIds }: MessageRendererProps) {
  const parts = message.parts?.length ? message.parts : partsFromContent(message.content);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "text" || part.type === "markdown") {
          return <MarkdownPart key={index} content={part.content} />;
        }
        if (part.type === "mermaid") {
          return <MermaidPart key={index} content={part.content} title={part.title} />;
        }
        if (part.type === "chart") {
          return <ChartPart key={index} option={part.option} title={part.title} />;
        }
        return (
          <MediaPlaceholder
            key={index}
            message={message}
            part={part}
            onSendMessage={onSendMessage}
            onCheckImageStatus={onCheckImageStatus}
            onCheckVideoStatus={onCheckVideoStatus}
            checkingVideoMessageIds={checkingVideoMessageIds}
          />
        );
      })}
    </>
  );
}
