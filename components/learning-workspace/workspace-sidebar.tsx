import {
  BrainCircuit,
  FolderOpen,
  LayoutDashboard,
  Menu,
  MessageCircle,
  LogOut,
  Plus,
  Trash2,
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
  onDeleteProject: (projectId: string) => void;
  onSelectSection: (section: WorkspaceSection) => void;
  userEmail: string;
  deletingProjectId: string;
  onSignOut: () => void;
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
  onDeleteProject,
  onSelectSection,
  userEmail,
  deletingProjectId,
  onSignOut
}: WorkspaceSidebarProps) {
  const initial = userEmail.slice(0, 1).toUpperCase();

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
            <div
              key={project.id}
              className={`project-item ${project.id === activeProjectId ? "active" : ""}`}
            >
              <button className="project-select" onClick={() => onSelectProject(project.id)}>
                <span className="project-emoji">{project.emoji}</span>
                <span className="project-copy">
                  <strong>{project.name}</strong>
                  <small>{project.subject}</small>
                </span>
              </button>
              <span className="mini-progress">{project.progress}%</span>
              <button
                className="project-delete"
                onClick={() => onDeleteProject(project.id)}
                disabled={deletingProjectId === project.id}
                aria-label={`删除${project.name}`}
                title="删除项目"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="avatar">{initial}</div>
          <div>
            <strong>{userEmail}</strong>
            <span>已登录 · 历史自动保存</span>
          </div>
          <button className="sidebar-logout" onClick={onSignOut} aria-label="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-backdrop" onClick={onCloseMobileNav} aria-label="关闭导航背景" />}
    </>
  );
}
