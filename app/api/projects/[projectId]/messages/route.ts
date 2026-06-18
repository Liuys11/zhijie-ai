import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = {
  id: string;
};

type DbConversation = {
  id: string;
  project_id: string;
};

type DbMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function ensureProjectAccess(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
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

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId } = await context.params;
    const project = await ensureProjectAccess(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const conversation = await ensureConversation(auth.token, auth.user.id, projectId);
    const messages = await supabaseRest<DbMessage[]>(
      auth.token,
      `messages?select=id,role,content,metadata,created_at&conversation_id=eq.${conversation.id}&order=created_at.asc`
    );

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messages: messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          parts: Array.isArray(message.metadata?.parts) ? message.metadata.parts : undefined,
          time: new Intl.DateTimeFormat("zh-CN", {
            hour: "2-digit",
            minute: "2-digit"
          }).format(new Date(message.created_at))
        }))
    });
  } catch (error) {
    console.error(error);
    return jsonError("消息记录加载失败，请稍后重试。", 500);
  }
}
