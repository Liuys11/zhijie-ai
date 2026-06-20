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
  checkingImageMessageIds?: Set<string>;
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

const mermaidStartPattern =
  /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|xychart-beta)\b/i;

function stripMermaidFence(raw: string) {
  return raw
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeMermaidContent(raw: string) {
  const lines = stripMermaidFence(raw)
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const firstMermaidLineIndex = lines.findIndex((line) => mermaidStartPattern.test(line.trim()));
  if (firstMermaidLineIndex < 0) {
    return {
      code: lines.join("\n").trim(),
      isValidStart: false,
      firstLine: lines.find((line) => line.trim())?.trim() || ""
    };
  }

  const code = lines.slice(firstMermaidLineIndex).join("\n").trim();
  return {
    code,
    isValidStart: true,
    firstLine: code.split(/\r?\n/).find((line) => line.trim())?.trim() || ""
  };
}

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
      parts.push({ type: "mermaid", content: normalizeMermaidContent(body).code || body });
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
  const normalized = useMemo(() => normalizeMermaidContent(content), [content]);

  const renderMermaid = useMemo(
    () => async () => {
      setError("");
      setSvg("");
      if (!normalized.isValidStart || !normalized.code) {
        console.warn("[mermaid-render-skip]", {
          reason: "invalid-start",
          firstLine: normalized.firstLine.slice(0, 80),
          length: normalized.code.length
        });
        setError("图形代码不是有效的 Mermaid 图形，已保留为代码文本。");
        return;
      }
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
        console.info("[mermaid-render]", {
          firstLine: normalized.firstLine.slice(0, 80),
          length: normalized.code.length
        });
        await mermaid.parse(normalized.code);
        const result = await mermaid.render(`zhijie-${id}`, normalized.code);
        setSvg(result.svg);
      } catch (renderError) {
        console.error(renderError);
        setError("图形渲染失败，请检查 Mermaid 代码格式。");
      }
    },
    [id, normalized]
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
      {error ? (
        <>
          <p className="generated-error">{error}</p>
          <MarkdownPart content={`\`\`\`mermaid\n${normalized.code || content.trim()}\n\`\`\``} />
        </>
      ) : (
        <div ref={containerRef} className="mermaid-stage" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
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
  checkingImageMessageIds,
}: {
  message: Message;
  part: MessagePart;
  onSendMessage?: (text: string) => void;
  onCheckImageStatus?: (message: Message) => void;
  checkingImageMessageIds?: Set<string>;
}) {
  if (part.type === "image") {
    const isChecking = checkingImageMessageIds?.has(message.id) || false;
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
              <button type="button" onClick={() => onCheckImageStatus?.(message)} disabled={isChecking}>
                {isChecking ? "查询中..." : "继续查询"}
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
    return (
      <div className="generated-block">
        <div className="generated-block-header">
          <strong>{part.title || "教学视频"}</strong>
        </div>
        <p className="generated-note">（当前版本不支持生成视频）我可以直接生成文字讲解、微课脚本或分镜大纲用于展示。</p>
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

export function MessageRenderer({ message, onSendMessage, onCheckImageStatus, checkingImageMessageIds }: MessageRendererProps) {
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
            checkingImageMessageIds={checkingImageMessageIds}
          />
        );
      })}
    </>
  );
}
