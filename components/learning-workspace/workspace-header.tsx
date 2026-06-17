import { Check, ChevronDown, GraduationCap, Search, Sparkles } from "lucide-react";
import type { Project } from "./types";

type WorkspaceHeaderProps = {
  activeProject: Project;
  mode: string;
  modes: string[];
  isModeOpen: boolean;
  onToggleModeMenu: () => void;
  onSelectMode: (mode: string) => void;
};

export function WorkspaceHeader({
  activeProject,
  mode,
  modes,
  isModeOpen,
  onToggleModeMenu,
  onSelectMode
}: WorkspaceHeaderProps) {
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
        <button className="icon-button" aria-label="搜索">
          <Search size={18} />
        </button>
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
