import { CSSProperties, useState } from "react";
import { ArrowDown, ArrowUp, BrainCircuit, Check, Cpu, FileText, FolderOpen, Image as ImageIcon, Target, Trash2, Upload, X } from "lucide-react";
import type { FileInputRef, LearningStep, LearningStepStatus, Project, Resource } from "./types";

type ProgressStyle = CSSProperties & {
  "--progress": string;
};

type ProjectStats = {
  done: number;
  doing: number;
  todo: number;
  resources: number;
  recentStudyAt: string;
};

type InsightPanelProps = {
  activeProject: Project;
  resources: Resource[];
  learningSteps: LearningStep[];
  stats: ProjectStats;
  error: string;
  detailsOpen: boolean;
  routeEditorOpen: boolean;
  savingSteps: boolean;
  uploadingResource: boolean;
  deletingResourceId: string;
  fileInputRef: FileInputRef;
  onOpenDetails: () => void;
  onCloseDetails: () => void;
  onOpenRouteEditor: () => void;
  onCloseRouteEditor: () => void;
  onSaveSteps: (steps: LearningStep[]) => void;
  onDeleteResource: (resourceId: string) => void;
};

const statusLabels: Record<LearningStepStatus, string> = {
  done: "已完成",
  doing: "学习中",
  todo: "待开始"
};

function formatRecentTime(value: string) {
  if (!value) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function RouteEditor({
  steps,
  saving,
  onClose,
  onSave
}: {
  steps: LearningStep[];
  saving: boolean;
  onClose: () => void;
  onSave: (steps: LearningStep[]) => void;
}) {
  const [draftSteps, setDraftSteps] = useState<LearningStep[]>(steps);
  const [error, setError] = useState("");

  const updateStep = (id: string, patch: Partial<LearningStep>) => {
    setDraftSteps((current) =>
      current.map((step) => {
        if (step.id !== id) return patch.status === "doing" ? { ...step, status: step.status === "doing" ? "todo" : step.status } : step;
        return { ...step, ...patch };
      })
    );
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftSteps.length) return;
    const next = [...draftSteps];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDraftSteps(next.map((step, sortOrder) => ({ ...step, sortOrder })));
  };

  const addStep = () => {
    setDraftSteps((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: "新的学习步骤",
        status: "todo",
        sortOrder: current.length
      }
    ]);
  };

  const removeStep = (id: string) => {
    setDraftSteps((current) => current.filter((step) => step.id !== id).map((step, sortOrder) => ({ ...step, sortOrder })));
  };

  const submit = () => {
    const normalized = draftSteps.map((step, sortOrder) => ({ ...step, title: step.title.trim(), sortOrder })).filter((step) => step.title);
    if (!normalized.length) {
      setError("学习路线至少需要保留一个步骤。");
      return;
    }
    if (normalized.filter((step) => step.status === "doing").length > 1) {
      setError("一个项目最多只能有一个学习中的步骤。");
      return;
    }
    onSave(normalized);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal route-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>调整学习路线</h2>
        <p>编辑当前项目的学习步骤。保存后会同步更新项目进度。</p>
        <div className="route-editor-list">
          {draftSteps.map((step, index) => (
            <div className="route-editor-item" key={step.id}>
              <input value={step.title} onChange={(event) => updateStep(step.id, { title: event.target.value })} />
              <select value={step.status} onChange={(event) => updateStep(step.id, { status: event.target.value as LearningStepStatus })}>
                <option value="todo">待开始</option>
                <option value="doing">学习中</option>
                <option value="done">已完成</option>
              </select>
              <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0}>
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => moveStep(index, 1)} disabled={index === draftSteps.length - 1}>
                <ArrowDown size={14} />
              </button>
              <button type="button" onClick={() => removeStep(step.id)} disabled={draftSteps.length === 1}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {error && <p className="profile-message error">{error}</p>}
        <button className="route-add-button" onClick={addStep} type="button">
          新增步骤
        </button>
        <button className="modal-submit" onClick={submit} disabled={saving} type="button">
          {saving ? "保存中..." : "保存路线"}
        </button>
      </section>
    </div>
  );
}

export function InsightPanel({
  activeProject,
  resources,
  learningSteps,
  stats,
  error,
  detailsOpen,
  routeEditorOpen,
  savingSteps,
  uploadingResource,
  deletingResourceId,
  fileInputRef,
  onOpenDetails,
  onCloseDetails,
  onOpenRouteEditor,
  onCloseRouteEditor,
  onSaveSteps,
  onDeleteResource
}: InsightPanelProps) {
  const progressStyle: ProgressStyle = {
    "--progress": `${activeProject.progress * 3.6}deg`
  };

  return (
    <aside className="insight-panel">
      {error && <p className="insight-error">{error}</p>}
      <section className="insight-card progress-card">
        <div className="card-title">
          <span>
            <Target size={17} /> 项目进度
          </span>
          <button onClick={onOpenDetails}>详情</button>
        </div>
        <div className="progress-ring" style={progressStyle}>
          <div>
            <strong>{activeProject.progress}%</strong>
            <span>总体掌握</span>
          </div>
        </div>
        <div className="progress-stats">
          <div>
            <strong>{stats.done}</strong>
            <span>已完成</span>
          </div>
          <div>
            <strong>{stats.doing}</strong>
            <span>学习中</span>
          </div>
          <div>
            <strong>{stats.todo}</strong>
            <span>待学习</span>
          </div>
        </div>
      </section>

      <section className="insight-card">
        <div className="card-title">
          <span>
            <Cpu size={17} /> 模型服务
          </span>
          <button>已接入</button>
        </div>
        <div className="resource-item">
          <div className="resource-icon image">
            <Cpu size={16} />
          </div>
          <div>
            <strong>科大讯飞星火 Spark-X2-Flash</strong>
            <span>服务端安全调用 · 流式输出</span>
          </div>
        </div>
      </section>

      <section className="insight-card">
        <div className="card-title">
          <span>
            <BrainCircuit size={17} /> 当前学习路线
          </span>
          <button onClick={onOpenRouteEditor}>调整</button>
        </div>
        <div className="roadmap">
          {learningSteps.map((step, index) => (
            <div className={`roadmap-item ${step.status === "done" ? "done" : step.status === "doing" ? "current" : ""}`} key={step.id}>
              <span>{step.status === "done" ? <Check size={13} /> : index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{statusLabels[step.status]}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="insight-card resource-card">
        <div className="card-title">
          <span>
            <FolderOpen size={17} /> 项目资料
          </span>
        </div>
        <div className="resource-list">
          {resources.slice(0, 4).map((resource) => (
            <div className="resource-item resource-item-manage" key={resource.id}>
              <div className={resource.type === "图片" ? "resource-icon image" : "resource-icon"}>
                {resource.type === "图片" ? <ImageIcon size={16} /> : <FileText size={16} />}
              </div>
              <div>
                <strong title={resource.name}>{resource.name}</strong>
                <span>
                  {resource.type} · {resource.size}
                </span>
              </div>
              <button onClick={() => onDeleteResource(resource.id)} disabled={deletingResourceId === resource.id} title="删除资料">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {resources.length === 0 && <p className="empty-resource">还没有资料，但你仍然可以直接对话学习。</p>}
        </div>
        <button className="upload-card-button" onClick={() => fileInputRef.current?.click()} disabled={uploadingResource}>
          <Upload size={16} /> {uploadingResource ? "上传中..." : "添加学习资料"}
        </button>
      </section>

      {detailsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseDetails}>
          <section className="modal progress-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={onCloseDetails}>
              <X size={18} />
            </button>
            <h2>项目进度详情</h2>
            <p>当前项目进度由学习路线完成情况自动计算。</p>
            <div className="progress-detail-grid">
              <span>总体进度</span>
              <strong>{activeProject.progress}%</strong>
              <span>已完成</span>
              <strong>{stats.done}</strong>
              <span>学习中</span>
              <strong>{stats.doing}</strong>
              <span>待学习</span>
              <strong>{stats.todo}</strong>
              <span>资料数量</span>
              <strong>{stats.resources}</strong>
              <span>最近学习</span>
              <strong>{formatRecentTime(stats.recentStudyAt)}</strong>
            </div>
          </section>
        </div>
      )}

      {routeEditorOpen && <RouteEditor steps={learningSteps} saving={savingSteps} onClose={onCloseRouteEditor} onSave={onSaveSteps} />}
    </aside>
  );
}
