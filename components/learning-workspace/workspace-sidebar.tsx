import { useState } from "react";
import {
  BrainCircuit,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Trash2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Project, UserProfile, WorkspaceSection } from "./types";

const navItems: Array<[WorkspaceSection, LucideIcon]> = [
  ["总览", LayoutDashboard],
  ["学习对话", MessageCircle],
  ["资料库", FolderOpen],
  ["知识地图", BrainCircuit]
];

function ProfileAvatar({ profile, initial }: { profile: UserProfile; initial: string }) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState("");
  const showAvatarImage = profile.avatarUrl && failedAvatarUrl !== profile.avatarUrl;

  if (showAvatarImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={profile.avatarUrl} alt="" onError={() => setFailedAvatarUrl(profile.avatarUrl)} />
    );
  }

  return <>{initial}</>;
}

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
  profile: UserProfile;
  deletingProjectId: string;
  onOpenProfile: () => void;
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
  profile,
  deletingProjectId,
  onOpenProfile,
  onSignOut
}: WorkspaceSidebarProps) {
  const displayName = profile.nickname || userEmail.split("@")[0] || "学习者";
  const initial = displayName.slice(0, 1).toUpperCase();

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
            <span>学习成长空间</span>
          </div>
          <button className="mobile-close" onClick={onCloseMobileNav} aria-label="关闭导航">
            <X size={18} />
          </button>
        </div>

        <button className="new-project-button" onClick={onOpenNewProject}>
          <Plus size={17} /> 新建学习项目
        </button>

        <div className="sidebar-projects">
          <div className="project-heading">
            <span>学习项目</span>
            <button onClick={onOpenNewProject} aria-label="新建项目">
              <Plus size={15} />
            </button>
          </div>

          <div className="project-list">
            {projects.map((project) => (
              <div key={project.id} className={`project-item ${project.id === activeProjectId ? "active" : ""}`}>
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
        </div>

        <nav className="primary-nav" aria-label="当前项目功能">
          {navItems.map(([label, Icon]) => (
            <button className={activeSection === label ? "active" : ""} key={label} onClick={() => onSelectSection(label)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="profile-trigger" onClick={onOpenProfile} title="编辑个人资料">
            <span className="avatar">
              <ProfileAvatar profile={profile} initial={initial} />
            </span>
            <span className="profile-copy">
              <strong>{displayName}</strong>
              <span>{userEmail}</span>
            </span>
          </button>
          <button className="sidebar-logout" onClick={onSignOut} aria-label="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="nav-backdrop" onClick={onCloseMobileNav} aria-label="关闭导航背景" />}
    </>
  );
}
