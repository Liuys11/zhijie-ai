import { RefObject, useMemo, useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Lightbulb,
  Map,
  Network,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload
} from "lucide-react";
import { createProjectFileSignedUrl, type AuthSession } from "@/lib/supabase-browser";
import type { KnowledgeEdge, KnowledgeNode, KnowledgeStatus, LearningStep, Message, Project, ProjectStats, Resource, ResourceCategory } from "./types";

const resourceCategories: Array<{ value: "all" | ResourceCategory; label: string; icon: typeof FileText }> = [
  { value: "all", label: "全部资源", icon: FolderOpen },
  { value: "uploaded", label: "用户上传", icon: Upload },
  { value: "explanation", label: "讲解文档", icon: FileText },
  { value: "exercise", label: "练习题", icon: CheckCircle2 },
  { value: "mindmap", label: "思维导图", icon: Network },
  { value: "reading", label: "拓展阅读", icon: BookOpen },
  { value: "code", label: "代码案例", icon: Code2 }
];

const knowledgeStatusLabels: Record<KnowledgeStatus, string> = {
  mastered: "已掌握",
  learning: "学习中",
  todo: "待学习",
  weak: "薄弱点"
};

function formatTime(value: string) {
  if (!value) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function buildLearningAdvice(steps: LearningStep[], resources: Resource[], nodes: KnowledgeNode[], messages: Message[]) {
  const currentStep = steps.find((step) => step.status === "doing");
  const weakNode = nodes.find((node) => node.status === "weak");

  if (weakNode) return `建议先回到「${weakNode.title}」，结合资料和练习补一次基础，再继续后面的学习步骤。`;
  if (currentStep) return `建议继续完成「${currentStep.title}」，学完后把状态改为已完成，系统会同步更新项目进度。`;
  if (resources.length === 0) return "当前项目还没有资料。你可以先直接提问，也可以上传课程资料，让后续分析更贴近你的项目。";
  if (messages.length <= 1) return "当前项目对话较少。建议先向知界 AI 说明学习目标和已有基础，生成更贴合你的学习路径。";
  return "当前项目状态稳定。建议保持对话学习、资料整理和路线复盘同步推进。";
}

function getKnowledgeCounts(nodes: KnowledgeNode[]) {
  return {
    mastered: nodes.filter((node) => node.status === "mastered").length,
    learning: nodes.filter((node) => node.status === "learning").length,
    todo: nodes.filter((node) => node.status === "todo").length,
    weak: nodes.filter((node) => node.status === "weak").length
  };
}

type ModuleProps = {
  activeProject: Project;
  resources: Resource[];
  learningSteps: LearningStep[];
  stats: ProjectStats;
  messages: Message[];
  knowledgeNodes: KnowledgeNode[];
  knowledgeEdges: KnowledgeEdge[];
};

export function ProjectOverview({ activeProject, resources, learningSteps, stats, messages, knowledgeNodes }: ModuleProps) {
  const counts = getKnowledgeCounts(knowledgeNodes);
  const advice = buildLearningAdvice(learningSteps, resources, knowledgeNodes, messages);

  return (
    <section className="module-panel">
      <div className="module-hero">
        <div>
          <span><Sparkles size={15} /> 项目总览</span>
          <h2>{activeProject.name}</h2>
          <p>{activeProject.subject || "还没有设置学科信息"}</p>
        </div>
        <strong>{activeProject.progress}%</strong>
      </div>

      <div className="overview-grid">
        <article className="module-card">
          <span><Target size={16} /> 总体进度</span>
          <strong>{activeProject.progress}%</strong>
          <p>由当前项目学习路线的完成情况自动计算。</p>
        </article>
        <article className="module-card">
          <span><FolderOpen size={16} /> 学习资料</span>
          <strong>{resources.length}</strong>
          <p>包含用户上传资料和后续 AI 生成资源。</p>
        </article>
        <article className="module-card">
          <span><BrainCircuit size={16} /> 知识点</span>
          <strong>{knowledgeNodes.length}</strong>
          <p>来自当前项目的知识地图数据。</p>
        </article>
        <article className="module-card">
          <span><BookOpen size={16} /> 最近学习</span>
          <strong>{formatTime(stats.recentStudyAt)}</strong>
          <p>根据路线、资料和项目更新时间汇总。</p>
        </article>
      </div>

      <section className="module-card wide">
        <div className="module-section-title">
          <h3>当前学习路线</h3>
          <span>{stats.done} 已完成 / {stats.doing} 学习中 / {stats.todo} 待学习</span>
        </div>
        {learningSteps.length ? (
          <div className="compact-roadmap">
            {learningSteps.map((step, index) => (
              <div key={step.id} className={`compact-step ${step.status}`}>
                <span>{index + 1}</span>
                <strong>{step.title}</strong>
                <em>{step.status === "done" ? "已完成" : step.status === "doing" ? "学习中" : "待开始"}</em>
              </div>
            ))}
          </div>
        ) : (
          <p className="module-empty">还没有学习路线。可以在右侧“当前学习路线”中调整并保存。</p>
        )}
      </section>

      <section className="module-card wide">
        <div className="module-section-title">
          <h3>知识掌握概览</h3>
          <span>{counts.mastered} 已掌握 / {counts.learning} 学习中 / {counts.todo} 待学习 / {counts.weak} 薄弱</span>
        </div>
        {knowledgeNodes.length ? (
          <div className="knowledge-summary">
            {Object.entries(counts).map(([status, count]) => (
              <div key={status} className={`knowledge-pill ${status}`}>
                <strong>{count}</strong>
                <span>{knowledgeStatusLabels[status as KnowledgeStatus]}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="module-empty">知识点还没有沉淀。继续对话、上传资料或后续完成 AI 分析后会出现在这里。</p>
        )}
      </section>

      <section className="module-card wide advice-card">
        <span><Lightbulb size={17} /> AI 下一步建议</span>
        <p>{advice}</p>
      </section>
    </section>
  );
}

type ResourceLibraryProps = {
  activeProject: Project;
  resources: Resource[];
  session: AuthSession;
  uploadingResource: boolean;
  deletingResourceId: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDeleteResource: (resourceId: string) => void;
};

export function ResourceLibrary({
  activeProject,
  resources,
  session,
  uploadingResource,
  deletingResourceId,
  fileInputRef,
  onDeleteResource
}: ResourceLibraryProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ResourceCategory>("all");
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");

  const filteredResources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesCategory = category === "all" || (resource.category || "uploaded") === category;
      const matchesQuery = !normalizedQuery || `${resource.name} ${resource.type}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query, resources]);

  const openResource = async (resource: Resource, download: boolean) => {
    if (!resource.storagePath) {
      setError("这条资料没有可打开的文件路径。");
      return;
    }

    setOpeningId(resource.id);
    setError("");

    try {
      const url = await createProjectFileSignedUrl(session.access_token, resource.storagePath);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = resource.name;
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (openError) {
      console.error(openError);
      setError(openError instanceof Error ? openError.message : "资料打开失败，请稍后重试。");
    } finally {
      setOpeningId("");
    }
  };

  return (
    <section className="module-panel">
      <div className="module-toolbar">
        <div>
          <span><FolderOpen size={15} /> 当前项目资料库</span>
          <h2>{activeProject.name}</h2>
        </div>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploadingResource}>
          <Upload size={16} /> {uploadingResource ? "上传中..." : "添加学习资料"}
        </button>
      </div>

      <div className="resource-filter-row">
        <label>
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前项目资料..." />
        </label>
        <div className="resource-tabs">
          {resourceCategories.map(({ value, label, icon: Icon }) => (
            <button key={value} className={category === value ? "active" : ""} onClick={() => setCategory(value)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="module-error">{error}</p>}

      {filteredResources.length ? (
        <div className="resource-library-grid">
          {filteredResources.map((resource) => (
            <article className="library-resource-card" key={resource.id}>
              <div className="resource-icon"><FileText size={18} /></div>
              <div>
                <strong>{resource.name}</strong>
                <span>{resource.type} · {resource.size} · {resource.status || "uploaded"}</span>
              </div>
              <div className="library-resource-actions">
                <button onClick={() => void openResource(resource, false)} disabled={openingId === resource.id}>
                  <Eye size={15} /> 预览
                </button>
                <button onClick={() => void openResource(resource, true)} disabled={openingId === resource.id}>
                  <Download size={15} /> 下载
                </button>
                <button onClick={() => onDeleteResource(resource.id)} disabled={deletingResourceId === resource.id}>
                  <Trash2 size={15} /> 删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="module-empty-state">
          <FolderOpen size={26} />
          <strong>{resources.length ? "没有匹配的资料" : "当前项目还没有资料"}</strong>
          <span>{resources.length ? "换个关键词或分类再试试。" : "不上传资料也能开始对话学习；需要资料上下文时再上传即可。"}</span>
        </div>
      )}
    </section>
  );
}

type KnowledgeMapProps = ModuleProps & {
  onStartKnowledge: (title: string) => void;
};

export function KnowledgeMap({ activeProject, resources, knowledgeNodes, knowledgeEdges, onStartKnowledge }: KnowledgeMapProps) {
  const [selectedId, setSelectedId] = useState("");
  const selectedNode = knowledgeNodes.find((node) => node.id === selectedId) || knowledgeNodes[0];
  const relatedEdges = selectedNode
    ? knowledgeEdges.filter((edge) => edge.sourceNodeId === selectedNode.id || edge.targetNodeId === selectedNode.id)
    : [];
  const relatedResources = selectedNode
    ? resources.filter((resource) => resource.name.includes(selectedNode.title)).slice(0, 3)
    : [];

  return (
    <section className="module-panel">
      <div className="module-toolbar">
        <div>
          <span><Map size={15} /> 知识地图</span>
          <h2>{activeProject.name}</h2>
        </div>
      </div>

      {knowledgeNodes.length ? (
        <div className="knowledge-map-layout">
          <div className="knowledge-node-list">
            {knowledgeNodes.map((node) => (
              <button
                key={node.id}
                className={`knowledge-node ${node.status} ${selectedNode?.id === node.id ? "active" : ""}`}
                onClick={() => setSelectedId(node.id)}
              >
                <strong>{node.title}</strong>
                <span>{knowledgeStatusLabels[node.status]} · 掌握度 {Math.round(node.masteryScore)}%</span>
              </button>
            ))}
          </div>
          {selectedNode && (
            <article className="knowledge-detail">
              <span className={`knowledge-status ${selectedNode.status}`}>{knowledgeStatusLabels[selectedNode.status]}</span>
              <h3>{selectedNode.title}</h3>
              <p>{selectedNode.description || "这个知识点还没有详细说明，后续可由对话和资料分析继续补充。"}</p>
              <div className="knowledge-metrics">
                <div><strong>{Math.round(selectedNode.masteryScore)}%</strong><span>掌握度</span></div>
                <div><strong>{Math.round(selectedNode.confidence)}%</strong><span>置信度</span></div>
                <div><strong>{selectedNode.evidenceCount}</strong><span>证据数</span></div>
              </div>
              <div className="knowledge-relations">
                <strong>前置 / 关联关系</strong>
                {relatedEdges.length ? (
                  relatedEdges.map((edge) => <span key={edge.id}>{edge.relation}</span>)
                ) : (
                  <span>暂无关系数据</span>
                )}
              </div>
              <div className="knowledge-relations">
                <strong>相关资料</strong>
                {relatedResources.length ? (
                  relatedResources.map((resource) => <span key={resource.id}>{resource.name}</span>)
                ) : (
                  <span>暂无直接匹配资料</span>
                )}
              </div>
              <button className="start-knowledge-button" onClick={() => onStartKnowledge(selectedNode.title)}>
                <BrainCircuit size={16} /> 开始学习这个知识点
              </button>
            </article>
          )}
        </div>
      ) : (
        <div className="module-empty-state">
          <Map size={26} />
          <strong>当前项目还没有知识地图</strong>
          <span>继续进行学习对话、上传资料或后续执行知识点抽取后，这里会展示真实知识点和掌握状态。</span>
          <button onClick={() => onStartKnowledge("当前项目的核心知识点")}>去对话中梳理知识点</button>
        </div>
      )}
    </section>
  );
}
