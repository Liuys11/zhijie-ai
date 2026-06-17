import { FormEvent } from "react";
import { Sparkles, X } from "lucide-react";

type NewProjectModalProps = {
  newProjectName: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onNameChange: (name: string) => void;
};

export function NewProjectModal({ newProjectName, onClose, onSubmit, onNameChange }: NewProjectModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="modal-icon">
          <Sparkles size={23} />
        </div>
        <h2>创建新的学习项目</h2>
        <p>每门课、每次竞赛或每个研究主题都可以建立独立空间。</p>
        <label>
          项目名称
          <input autoFocus value={newProjectName} onChange={(event) => onNameChange(event.target.value)} placeholder="例如：数字电路期末复习" />
        </label>
        <div className="modal-options">
          <button type="button">
            <span>📚</span>课程学习
          </button>
          <button type="button">
            <span>🏆</span>竞赛项目
          </button>
          <button type="button">
            <span>🔬</span>自主探索
          </button>
        </div>
        <button className="modal-submit" type="submit" disabled={!newProjectName.trim()}>
          创建并开始学习
        </button>
      </form>
    </div>
  );
}
