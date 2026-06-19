import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = { id: string };
type DbAssessment = {
  id: string;
  project_id: string;
  title: string;
  status: "draft" | "submitted";
  total_score: number | string;
  created_at: string;
};
type DbAssessmentItem = {
  id: string;
  question_type: "single_choice" | "true_false" | "short_answer";
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  knowledge_title: string | null;
  sort_order: number;
};
type DbAnswer = {
  item_id: string;
  user_answer: string;
  is_correct: boolean;
  score: number | string;
  feedback: string | null;
};
type AnswerInput = {
  itemId?: string;
  answer?: string;
};
type DbKnowledgeNode = {
  id: string;
  mastery_score: number | string;
  evidence_count: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isCorrect(item: DbAssessmentItem, answer: string) {
  if (item.question_type === "short_answer") return answer.trim().length >= 6;
  return normalize(answer) === normalize(item.correct_answer);
}

async function ensureProject(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

async function updateKnowledgeNode(token: string, userId: string, projectId: string, title: string, correct: boolean) {
  if (!title.trim()) return;
  const existing = await supabaseRest<DbKnowledgeNode[]>(
    token,
    `knowledge_nodes?select=id,mastery_score,evidence_count&project_id=eq.${projectId}&title=eq.${encodeURIComponent(title)}&limit=1`
  );
  const current = existing[0];
  const nextScore = correct ? 82 : 35;

  if (current) {
    const previousScore = Number(current.mastery_score) || 0;
    await supabaseRest<unknown[]>(token, `knowledge_nodes?id=eq.${current.id}`, {
      method: "PATCH",
      body: {
        mastery_score: Math.round(previousScore ? (previousScore + nextScore) / 2 : nextScore),
        confidence: correct ? 75 : 55,
        evidence_count: current.evidence_count + 1,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    return;
  }

  await supabaseRest<unknown[]>(token, "knowledge_nodes", {
    method: "POST",
    body: {
      project_id: projectId,
      user_id: userId,
      title,
      description: `${title} 的掌握度来自随堂测评结果。`,
      mastery_score: nextScore,
      confidence: correct ? 75 : 55,
      evidence_count: 1,
      last_reviewed_at: new Date().toISOString()
    }
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; assessmentId: string }> }
) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId, assessmentId } = await context.params;
    const project = await ensureProject(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const assessments = await supabaseRest<DbAssessment[]>(
      auth.token,
      `assessments?select=id,project_id,title,status,total_score,created_at&id=eq.${assessmentId}&project_id=eq.${projectId}&limit=1`
    );
    const assessment = assessments[0];
    if (!assessment) return jsonError("测评不存在或无权访问", 404);

    const body = (await request.json()) as { answers?: AnswerInput[] };
    const answerMap = new Map(
      (Array.isArray(body.answers) ? body.answers : [])
        .filter((item) => item.itemId)
        .map((item) => [String(item.itemId), String(item.answer || "").trim()])
    );

    const items = await supabaseRest<DbAssessmentItem[]>(
      auth.token,
      `assessment_items?select=id,question_type,question,options,correct_answer,explanation,knowledge_title,sort_order&assessment_id=eq.${assessmentId}&order=sort_order.asc`
    );
    if (!items.length) return jsonError("测评题目为空，请重新生成。", 400);

    await supabaseRest<null>(auth.token, `assessment_answers?assessment_id=eq.${assessmentId}`, {
      method: "DELETE"
    });

    const points = 100 / items.length;
    const answerRows = items.map((item) => {
      const userAnswer = answerMap.get(item.id) || "";
      const correct = isCorrect(item, userAnswer);
      return {
        assessment_id: assessmentId,
        item_id: item.id,
        project_id: projectId,
        user_id: auth.user.id,
        user_answer: userAnswer,
        is_correct: correct,
        score: correct ? points : 0,
        feedback: correct ? "回答正确。" : `建议复习：${item.explanation || item.correct_answer}`
      };
    });

    await supabaseRest<DbAnswer[]>(auth.token, "assessment_answers", {
      method: "POST",
      prefer: "return=representation",
      body: answerRows
    });

    const score = Math.round(answerRows.reduce((sum, row) => sum + row.score, 0));
    await supabaseRest<unknown[]>(auth.token, `assessments?id=eq.${assessmentId}`, {
      method: "PATCH",
      body: {
        score,
        status: "submitted",
        submitted_at: new Date().toISOString()
      }
    });

    await Promise.all(items.map((item, index) => updateKnowledgeNode(auth.token, auth.user.id, projectId, item.knowledge_title || item.question, answerRows[index].is_correct)));

    return NextResponse.json({
      ok: true,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        status: "submitted",
        score,
        totalScore: 100,
        createdAt: assessment.created_at,
        submittedAt: new Date().toISOString(),
        items: items.map((item, index) => ({
          id: item.id,
          questionType: item.question_type,
          question: item.question,
          options: Array.isArray(item.options) ? item.options : [],
          correctAnswer: item.correct_answer,
          explanation: item.explanation || "",
          knowledgeTitle: item.knowledge_title || "",
          userAnswer: answerRows[index].user_answer,
          isCorrect: answerRows[index].is_correct,
          feedback: answerRows[index].feedback || ""
        }))
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError("测评提交失败，请确认已执行 learning-loop-migration.sql。", 500);
  }
}
