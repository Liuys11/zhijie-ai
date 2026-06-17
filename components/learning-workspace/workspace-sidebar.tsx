import {
  BrainCircuit,
  FolderOpen,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Project, WorkspaceSection } from "./types";

const navItems: Array<[WorkspaceSection, LucideIcon]> = [
  ["总览", LayoutDashboard],
  ["学习对话", MessageCircle],
  ["资料库", FolderOpen],
  ["知识地图", BrainCircuit]
];

type WorkspaceSidebarProps = {
  activeSection: WorkspaceSection;
  mobileNavOpen: boolean;
  projects: Project[];
  activeProjectId: string;
  onCloseMobileNav: () => void;
  onOpenMobileNav: () => void;
  onOpenNewProject: () => void;
  onSelectProject: (projectId: string) => void;
  onSelectSection: (section: WorkspaceSection) => void;
};

export function WorkspaceSidebar({
  activeSection,
  mobileNavOpen,
  projects,
  activeProjectId,
  onCloseMobileNav,
  onOpenMobileNav,
  onOpenNewProject,
  onSelectProject,
  onSelectSection
}: WorkspaceSidebarProps) {
  return (
    <>
      <button className="mobile-menu-button" onClick={onOpenMobileNav} aria-label="打开导航">
        <Menu size={20} />
      </button>

      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <BrainCircuit size={22} />
          </div>
          <div>
            <strong>知界 AI</strong>
            <span>智能学习空间</span>
          </div>
          <button className="mobile-close" onClick={onCloseMobileNav} aria-label="关闭导航">
            <X size={18} />
          </button>
        </div>

        <button className="new-project-button" onClick={onOpenNewProject}>
          <Plus size={17} /> 新建学习项目
        </button>

        <nav className="primary-nav">
          {navItems.map(([label, Icon]) => (
            <button className={activeSection === label ? "active" : ""} key={label} onClick={() => onSelectSection(label)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        <div className="project-heading">
          <span>学习项目</span>
          <button onClick={onOpenNewProject} aria-label="新建项目">
            <Plus size={15} />
          </button>
        </div>

        <div className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`project-item ${project.id === activeProjectId ? "active" : ""}`}
              onClick={() => onSelectProject(project.id)}
            >
              <span className="project-emoji">{project.emoji}</span>
              <span className="project-copy">
                <strong>{project.name}</strong>
                <small>{project.subject}</small>
              </span>
              <span className="mini-progress">{project.progress}%</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="avatar">鲍</div>
          <div>
            <strong>学习者</strong>
            <span>今日已学习 42 分钟</span>
          </div>
          <MoreHorizontal size={18} />
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-backdrop" onClick={onCloseMobileNav} aria-label="关闭导航背景" />}
    </>
  );
}
