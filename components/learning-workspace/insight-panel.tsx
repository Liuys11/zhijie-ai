import type { CSSProperties } from "react";
import { BrainCircuit, Check, FileText, FolderOpen, Image as ImageIcon, Plus, Target, Upload } from "lucide-react";
import type { FileInputRef, Project, Resource } from "./types";

type ProgressStyle = CSSProperties & {
  "--progress": string;
};

type InsightPanelProps = {
  activeProject: Project;
  resources: Resource[];
  fileInputRef: FileInputRef;
};

export function InsightPanel({ activeProject, resources, fileInputRef }: InsightPanelProps) {
  const progressStyle: ProgressStyle = {
    "--progress": `${activeProject.progress * 3.6}deg`
  };

  return (
    <aside className="insight-panel">
      <section className="insight-card progress-card">
        <div className="card-title">
          <span>
            <Target size={17} /> 项目进度
          </span>
          <button>详情</button>
        </div>
        <div className="progress-ring" style={progressStyle}>
          <div>
            <strong>{activeProject.progress}%</strong>
            <span>总体掌握</span>
          </div>
        </div>
        <div className="progress-stats">
          <div>
            <strong>8</strong>
            <span>已掌握</span>
          </div>
          <div>
            <strong>5</strong>
            <span>学习中</span>
          </div>
          <div>
            <strong>3</strong>
            <span>待学习</span>
          </div>
        </div>
      </section>

      <section className="insight-card">
        <div className="card-title">
          <span>
            <BrainCircuit size={17} /> 当前学习路线
          </span>
          <button>调整</button>
        </div>
        <div className="roadmap">
          <div className="roadmap-item done">
            <span>
              <Check size={13} />
            </span>
            <div>
              <strong>理解竞赛任务</strong>
              <small>已完成</small>
            </div>
          </div>
          <div className="roadmap-item current">
            <span>2</span>
            <div>
              <strong>需求与功能设计</strong>
              <small>正在学习</small>
            </div>
          </div>
          <div className="roadmap-item">
            <span>3</span>
            <div>
              <strong>模型与知识库接入</strong>
              <small>待开始</small>
            </div>
          </div>
          <div className="roadmap-item">
            <span>4</span>
            <div>
              <strong>测试与作品完善</strong>
              <small>待开始</small>
            </div>
          </div>
        </div>
      </section>

      <section className="insight-card resource-card">
        <div className="card-title">
          <span>
            <FolderOpen size={17} /> 项目资料
          </span>
          <button onClick={() => fileInputRef.current?.click()}>
            <Plus size={14} />
          </button>
        </div>
        <div className="resource-list">
          {resources.slice(0, 4).map((resource) => (
            <div className="resource-item" key={resource.id}>
              <div className={resource.type === "图片" ? "resource-icon image" : "resource-icon"}>
                {resource.type === "图片" ? <ImageIcon size={16} /> : <FileText size={16} />}
              </div>
              <div>
                <strong title={resource.name}>{resource.name}</strong>
                <span>
                  {resource.type} · {resource.size}
                </span>
              </div>
            </div>
          ))}
          {resources.length === 0 && <p className="empty-resource">还没有资料，但你仍然可以直接对话学习。</p>}
        </div>
        <button className="upload-card-button" onClick={() => fileInputRef.current?.click()}>
          <Upload size={16} /> 添加学习资料
        </button>
      </section>
    </aside>
  );
}
