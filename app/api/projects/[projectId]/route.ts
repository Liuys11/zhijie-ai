import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = {
  id: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function ensureProjectAccess(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId } = await context.params;
    const project = await ensureProjectAccess(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    await supabaseRest<null>(auth.token, `projects?id=eq.${projectId}`, {
      method: "DELETE"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("项目删除失败，请稍后重试。", 500);
  }
}
