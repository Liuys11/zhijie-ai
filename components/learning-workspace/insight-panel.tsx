import type { CSSProperties } from "react";
import { BrainCircuit, Check, Cpu, FileText, FolderOpen, Image as ImageIcon, Plus, Target, Upload } from "lucide-react";
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
          <button>调整</button>
        </div>
        <div className="roadmap">
          <div className="roadmap-item done">
            <span>
              <Check size={13} />
            </span>
            <div>
              <strong>明确作品定位</strong>
              <small>已完成</small>
            </div>
          </div>
          <div className="roadmap-item current">
            <span>2</span>
            <div>
              <strong>打磨演示叙事</strong>
              <small>正在学习</small>
            </div>
          </div>
          <div className="roadmap-item">
            <span>3</span>
            <div>
              <strong>展示 AI 学习闭环</strong>
              <small>待开始</small>
            </div>
          </div>
          <div className="roadmap-item">
            <span>4</span>
            <div>
              <strong>答辩问答准备</strong>
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
