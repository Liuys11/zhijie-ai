import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = { id: string };
type DbDocument = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  created_at: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function formatFileSize(size?: number | null) {
  if (!size) return "未知大小";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getResourceType(name: string, mimeType: string | null) {
  if (mimeType?.startsWith("image/")) return "图片";
  return name.split(".").pop()?.toUpperCase() || "文件";
}

function getResourceCategory(name: string, mimeType: string | null) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("练习") || lowerName.includes("习题") || lowerName.includes("exercise")) return "exercise";
  if (lowerName.includes("思维导图") || lowerName.includes("mindmap")) return "mindmap";
  if (lowerName.includes("拓展") || lowerName.includes("阅读") || lowerName.includes("reading")) return "reading";
  if (lowerName.includes("代码") || lowerName.includes("code") || mimeType?.includes("javascript") || mimeType?.includes("python")) return "code";
  if (lowerName.includes("讲解") || lowerName.includes("说明") || lowerName.includes("explain")) return "explanation";
  return "uploaded";
}

async function ensureProject(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId } = await context.params;
    const project = await ensureProject(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const body = (await request.json()) as { name?: string; storagePath?: string; mimeType?: string; sizeBytes?: number };
    const name = body.name?.trim();
    const storagePath = body.storagePath?.trim();
    if (!name || !storagePath) return jsonError("资料名称或存储路径缺失", 400);

    const created = await supabaseRest<DbDocument[]>(auth.token, "documents", {
      method: "POST",
      prefer: "return=representation",
      body: {
        project_id: projectId,
        user_id: auth.user.id,
        name,
        storage_path: storagePath,
        mime_type: body.mimeType || null,
        size_bytes: body.sizeBytes || null,
        status: "uploaded"
      }
    });
    const document = created[0];

    return NextResponse.json({
      ok: true,
      resource: {
        id: document.id,
        name: document.name,
        type: getResourceType(document.name, document.mime_type),
        size: formatFileSize(document.size_bytes),
        storagePath: document.storage_path,
        category: getResourceCategory(document.name, document.mime_type),
        status: document.status,
        createdAt: document.created_at,
        mimeType: document.mime_type || undefined
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError("资料保存失败，请稍后重试。", 500);
  }
}
