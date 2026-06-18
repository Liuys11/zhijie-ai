import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = { id: string };
type StepInput = { id?: string; title?: string; status?: string; sortOrder?: number };
type NormalizedStep = { title: string; status: "todo" | "doing" | "done"; sort_order: number };
type NormalizeStepsResult = { steps: NormalizedStep[] } | { error: string };

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function ensureProject(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

function normalizeSteps(raw: unknown): NormalizeStepsResult {
  if (!Array.isArray(raw)) return { error: "学习路线格式不正确" };

  const steps = raw
    .map((item, index) => {
      const source = item as StepInput;
      const title = source.title?.trim();
      const status = source.status === "done" || source.status === "doing" || source.status === "todo" ? source.status : "todo";
      return title ? { title: title.slice(0, 80), status, sort_order: index } : null;
    })
    .filter((item): item is { title: string; status: "todo" | "doing" | "done"; sort_order: number } => item !== null);

  if (!steps.length) return { error: "学习路线至少需要保留一个步骤" };
  if (steps.filter((step) => step.status === "doing").length > 1) return { error: "一个项目最多只能有一个学习中的步骤" };

  return { steps };
}

export async function PUT(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId } = await context.params;
    const project = await ensureProject(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const body = (await request.json()) as { steps?: unknown };
    const normalized = normalizeSteps(body.steps);
    if ("error" in normalized) return jsonError(normalized.error, 400);

    await supabaseRest<null>(auth.token, `learning_steps?project_id=eq.${projectId}`, {
      method: "DELETE"
    });

    const created = await supabaseRest<Array<{ id: string; title: string; status: "todo" | "doing" | "done"; sort_order: number }>>(
      auth.token,
      "learning_steps",
      {
        method: "POST",
        prefer: "return=representation",
        body: normalized.steps.map((step) => ({
          ...step,
          project_id: projectId,
          user_id: auth.user.id
        }))
      }
    );

    const progress = Math.round((created.filter((step) => step.status === "done").length / created.length) * 100);
    await supabaseRest<unknown[]>(auth.token, `projects?id=eq.${projectId}`, {
      method: "PATCH",
      body: { progress, updated_at: new Date().toISOString() }
    });

    return NextResponse.json({
      ok: true,
      progress,
      steps: created.map((step) => ({
        id: step.id,
        title: step.title,
        status: step.status,
        sortOrder: step.sort_order
      }))
    });
  } catch (error) {
    console.error(error);
    return jsonError("学习路线保存失败，请稍后重试。", 500);
  }
}
