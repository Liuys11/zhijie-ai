import { FormEvent } from "react";
import { Sparkles, X } from "lucide-react";

type NewProjectModalProps = {
  newProjectName: string;
  goal: string;
  baseline: string;
  weeklyMinutes: number;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onNameChange: (name: string) => void;
  onGoalChange: (goal: string) => void;
  onBaselineChange: (baseline: string) => void;
  onWeeklyMinutesChange: (minutes: number) => void;
};

export function NewProjectModal({
  newProjectName,
  goal,
  baseline,
  weeklyMinutes,
  onClose,
  onSubmit,
  onNameChange,
  onGoalChange,
  onBaselineChange,
  onWeeklyMinutesChange
}: NewProjectModalProps) {
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
        <label>
          学习目标
          <input value={goal} onChange={(event) => onGoalChange(event.target.value)} placeholder="例如：两周内掌握异步电动机核心考点" />
        </label>
        <label>
          当前基础
          <input value={baseline} onChange={(event) => onBaselineChange(event.target.value)} placeholder="例如：学过公式，但不会做综合题" />
        </label>
        <label>
          每周可用时间（分钟）
          <input
            type="number"
            min={30}
            max={2400}
            step={30}
            value={weeklyMinutes}
            onChange={(event) => onWeeklyMinutesChange(Number(event.target.value) || 180)}
          />
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
