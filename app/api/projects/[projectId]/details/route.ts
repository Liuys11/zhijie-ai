import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = { id: string; progress: number; created_at: string };
type DbStep = { id: string; title: string; status: "todo" | "doing" | "done"; sort_order: number; updated_at: string };
type DbDocument = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  created_at: string;
};
type DbKnowledgeNode = {
  id: string;
  title: string;
  description: string | null;
  mastery_score: number | string;
  confidence: number | string;
  evidence_count: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
};
type DbKnowledgeEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation: string;
};

const defaultSteps = [
  { title: "明确学习目标", status: "done", sort_order: 0 },
  { title: "梳理核心知识", status: "doing", sort_order: 1 },
  { title: "完成练习与复盘", status: "todo", sort_order: 2 },
  { title: "准备展示与总结", status: "todo", sort_order: 3 }
] as const;

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

function getKnowledgeStatus(node: DbKnowledgeNode) {
  const masteryScore = Number(node.mastery_score) || 0;
  if (masteryScore >= 80) return "mastered";
  if (masteryScore > 0 && masteryScore < 45) return "weak";
  if (masteryScore >= 45) return "learning";
  return "todo";
}

function calculateProgress(steps: DbStep[], fallback: number) {
  if (!steps.length) return fallback;
  return Math.round((steps.filter((step) => step.status === "done").length / steps.length) * 100);
}

async function ensureProject(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id,progress,created_at&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

async function ensureSteps(token: string, userId: string, projectId: string) {
  const existing = await supabaseRest<DbStep[]>(
    token,
    `learning_steps?select=id,title,status,sort_order,updated_at&project_id=eq.${projectId}&order=sort_order.asc`
  );
  if (existing.length) return existing;

  const created = await supabaseRest<DbStep[]>(token, "learning_steps", {
    method: "POST",
    prefer: "return=representation",
    body: defaultSteps.map((step) => ({
      ...step,
      project_id: projectId,
      user_id: userId
    }))
  });
  return created;
}

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId } = await context.params;
    const project = await ensureProject(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const steps = await ensureSteps(auth.token, auth.user.id, projectId);
    const documents = await supabaseRest<DbDocument[]>(
      auth.token,
      `documents?select=id,name,storage_path,mime_type,size_bytes,status,created_at&project_id=eq.${projectId}&order=created_at.desc`
    );
    const knowledgeNodes = await supabaseRest<DbKnowledgeNode[]>(
      auth.token,
      `knowledge_nodes?select=id,title,description,mastery_score,confidence,evidence_count,last_reviewed_at,next_review_at&project_id=eq.${projectId}&order=updated_at.desc`
    );
    const knowledgeEdges = await supabaseRest<DbKnowledgeEdge[]>(
      auth.token,
      `knowledge_edges?select=id,source_node_id,target_node_id,relation&project_id=eq.${projectId}`
    );
    const progress = calculateProgress(steps, project.progress);
    if (progress !== project.progress) {
      await supabaseRest<unknown[]>(auth.token, `projects?id=eq.${projectId}`, {
        method: "PATCH",
        body: { progress, updated_at: new Date().toISOString() }
      });
    }

    const timestamps = [project.created_at, ...steps.map((step) => step.updated_at), ...documents.map((document) => document.created_at)];
    const recentStudyAt = timestamps.sort().at(-1) || project.created_at;

    return NextResponse.json({
      ok: true,
      progress,
      steps: steps.map((step) => ({
        id: step.id,
        title: step.title,
        status: step.status,
        sortOrder: step.sort_order
      })),
      resources: documents.map((document) => ({
        id: document.id,
        name: document.name,
        type: getResourceType(document.name, document.mime_type),
        size: formatFileSize(document.size_bytes),
        storagePath: document.storage_path,
        category: getResourceCategory(document.name, document.mime_type),
        status: document.status,
        createdAt: document.created_at,
        mimeType: document.mime_type || undefined
      })),
      knowledgeNodes: knowledgeNodes.map((node) => ({
        id: node.id,
        title: node.title,
        description: node.description || "",
        masteryScore: Number(node.mastery_score) || 0,
        confidence: Number(node.confidence) || 0,
        evidenceCount: node.evidence_count,
        status: getKnowledgeStatus(node),
        lastReviewedAt: node.last_reviewed_at || "",
        nextReviewedAt: node.next_review_at || ""
      })),
      knowledgeEdges: knowledgeEdges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id,
        relation: edge.relation
      })),
      stats: {
        done: steps.filter((step) => step.status === "done").length,
        doing: steps.filter((step) => step.status === "doing").length,
        todo: steps.filter((step) => step.status === "todo").length,
        resources: documents.length,
        recentStudyAt
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError("项目详情加载失败，请检查 Supabase 配置。", 500);
  }
}
