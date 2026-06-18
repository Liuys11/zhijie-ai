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
  conversation_id: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function ensureProjectAccess(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ projectId: string; messageId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId, messageId } = await context.params;
    const project = await ensureProjectAccess(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const messages = await supabaseRest<DbMessage[]>(
      auth.token,
      `messages?select=id,conversation_id&id=eq.${messageId}&limit=1`
    );
    const message = messages[0];
    if (!message) return jsonError("消息不存在或无权访问", 404);

    const conversations = await supabaseRest<DbConversation[]>(
      auth.token,
      `conversations?select=id,project_id&id=eq.${message.conversation_id}&project_id=eq.${projectId}&limit=1`
    );
    if (!conversations[0]) return jsonError("消息不属于当前项目", 404);

    await supabaseRest<null>(auth.token, `messages?id=eq.${messageId}`, {
      method: "DELETE"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("消息删除失败，请稍后重试。", 500);
  }
}
