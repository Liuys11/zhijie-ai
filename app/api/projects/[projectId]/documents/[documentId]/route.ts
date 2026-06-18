import { NextRequest, NextResponse } from "next/server";
import { deleteStorageObject, requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = { id: string };
type DbDocument = { id: string; storage_path: string };

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function ensureProject(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ projectId: string; documentId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId, documentId } = await context.params;
    const project = await ensureProject(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const documents = await supabaseRest<DbDocument[]>(
      auth.token,
      `documents?select=id,storage_path&id=eq.${documentId}&project_id=eq.${projectId}&limit=1`
    );
    const document = documents[0];
    if (!document) return jsonError("资料不存在或无权访问", 404);

    await supabaseRest<null>(auth.token, `documents?id=eq.${documentId}`, {
      method: "DELETE"
    });

    await deleteStorageObject(auth.token, "project-files", document.storage_path).catch((error) => {
      console.warn("资料文件删除失败", error);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("资料删除失败，请稍后重试。", 500);
  }
}
