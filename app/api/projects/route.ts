import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = {
  id: string;
  name: string;
  subject: string | null;
  project_type: "course" | "competition" | "research";
  goal: string | null;
  weekly_minutes: number;
  progress: number;
  created_at: string;
};

type DbConversation = {
  id: string;
  project_id: string;
};

const starterProjects = [
  {
    name: "知界 AI 竞赛作品",
    subject: "软件设计竞赛 × 智能学习",
    project_type: "competition",
    progress: 72
  },
  {
    name: "电力系统期末复习",
    subject: "电气工程课程",
    project_type: "course",
    progress: 38
  },
  {
    name: "大学英语听力提升",
    subject: "语言学习项目",
    project_type: "course",
    progress: 71
  }
] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function ensureConversation(token: string, userId: string, projectId: string) {
  const existing = await supabaseRest<DbConversation[]>(
    token,
    `conversations?select=id,project_id&project_id=eq.${projectId}&user_id=eq.${userId}&order=created_at.asc&limit=1`
  );

  if (existing[0]) return existing[0];

  const created = await supabaseRest<DbConversation[]>(token, "conversations", {
    method: "POST",
    prefer: "return=representation",
    body: {
      project_id: projectId,
      user_id: userId,
      title: "默认对话",
      mode: "讲解模式"
    }
  });

  return created[0];
}

async function ensureStarterData(token: string, userId: string) {
  const projects = await supabaseRest<DbProject[]>(
    token,
    "projects?select=id,name,subject,project_type,goal,weekly_minutes,progress,created_at&order=created_at.asc"
  );

  if (projects.length > 0) return projects;

  const created = await supabaseRest<DbProject[]>(token, "projects", {
    method: "POST",
    prefer: "return=representation",
    body: starterProjects.map((project) => ({
      ...project,
      user_id: userId
    }))
  });

  for (const project of created) {
    await ensureConversation(token, userId, project.id);
  }

  return created;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const projects = await ensureStarterData(auth.token, auth.user.id);
    const conversations = await Promise.all(projects.map((project) => ensureConversation(auth.token, auth.user.id, project.id)));

    return NextResponse.json({
      ok: true,
      projects: projects.map((project, index) => ({
        id: project.id,
        name: project.name,
        subject: project.subject || "学习项目",
        goal: project.goal || "",
        weeklyMinutes: project.weekly_minutes,
        emoji: index === 0 ? "🧠" : project.project_type === "course" ? "📘" : "✨",
        progress: project.progress,
        conversationId: conversations.find((conversation) => conversation.project_id === project.id)?.id
      }))
    });
  } catch (error) {
    console.error(error);
    return jsonError("项目加载失败，请检查 Supabase 配置。", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const body = (await request.json()) as { name?: string; goal?: string; baseline?: string; weeklyMinutes?: number };
    const name = body.name?.trim();
    if (!name) return jsonError("项目名称不能为空", 400);
    const goal = body.goal?.trim() || "";
    const baseline = body.baseline?.trim() || "";
    const weeklyMinutes = Math.min(2400, Math.max(30, Math.round(Number(body.weeklyMinutes) || 180)));

    const created = await supabaseRest<DbProject[]>(auth.token, "projects", {
      method: "POST",
      prefer: "return=representation",
      body: {
        user_id: auth.user.id,
        name,
        subject: baseline ? `当前基础：${baseline}` : "待生成学习画像",
        project_type: "research",
        goal,
        weekly_minutes: weeklyMinutes,
        progress: 0
      }
    });

    const project = created[0];
    const conversation = await ensureConversation(auth.token, auth.user.id, project.id);

    return NextResponse.json({
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        subject: project.subject || "学习项目",
        goal: project.goal || "",
        weeklyMinutes: project.weekly_minutes,
        emoji: "✨",
        progress: project.progress,
        conversationId: conversation.id
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError("项目创建失败，请稍后重试。", 500);
  }
}
