import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProject = {
  id: string;
  name: string;
  goal: string | null;
};

type DbStep = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  sort_order: number;
};

type DbAssessment = {
  id: string;
  title: string;
  status: "draft" | "submitted";
  score: number | string | null;
  total_score: number | string;
  created_at: string;
  submitted_at: string | null;
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

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function ensureProject(token: string, projectId: string) {
  const projects = await supabaseRest<DbProject[]>(token, `projects?select=id,name,goal&id=eq.${projectId}&limit=1`);
  return projects[0] || null;
}

async function getCurrentStep(token: string, projectId: string) {
  const steps = await supabaseRest<DbStep[]>(
    token,
    `learning_steps?select=id,title,status,sort_order&project_id=eq.${projectId}&order=sort_order.asc`
  );
  return steps.find((step) => step.status === "doing") || steps[0] || null;
}

function buildQuestions(project: DbProject, step: DbStep | null) {
  const topic = step?.title || project.goal || project.name;
  return [
    {
      question_type: "single_choice",
      question: `关于“${topic}”，学习时最应该先确认的是哪一项？`,
      options: ["核心概念和适用条件", "无关背景故事", "随机记忆结论", "跳过基础直接做难题"],
      correct_answer: "核心概念和适用条件",
      explanation: "先确认概念、条件和目标，后续例题与迁移才有依据。",
      knowledge_title: topic,
      sort_order: 0
    },
    {
      question_type: "true_false",
      question: `学习“${topic}”时，只背答案而不理解条件也能稳定迁移到新题。`,
      options: ["正确", "错误"],
      correct_answer: "错误",
      explanation: "只背答案容易在题目变化时失效，理解条件和推理过程更重要。",
      knowledge_title: topic,
      sort_order: 1
    },
    {
      question_type: "single_choice",
      question: `如果你在“${topic}”上反复出错，最合适的下一步是？`,
      options: ["回到定义、例子和错因复盘", "继续刷更难的题", "删除学习路线", "忽略这个知识点"],
      correct_answer: "回到定义、例子和错因复盘",
      explanation: "薄弱点应先定位概念缺口，再做针对性练习。",
      knowledge_title: topic,
      sort_order: 2
    },
    {
      question_type: "short_answer",
      question: `用一句话写出你对“${topic}”的当前理解。`,
      options: [],
      correct_answer: "包含核心概念或关键关系",
      explanation: "简答题用于自我表达检查，本版按是否认真作答给分。",
      knowledge_title: topic,
      sort_order: 3
    }
  ] as const;
}

async function loadAssessment(token: string, assessmentId: string) {
  const assessments = await supabaseRest<DbAssessment[]>(
    token,
    `assessments?select=id,title,status,score,total_score,created_at,submitted_at&id=eq.${assessmentId}&limit=1`
  );
  const assessment = assessments[0];
  if (!assessment) return null;

  const items = await supabaseRest<DbAssessmentItem[]>(
    token,
    `assessment_items?select=id,question_type,question,options,correct_answer,explanation,knowledge_title,sort_order&assessment_id=eq.${assessment.id}&order=sort_order.asc`
  );

  return {
    id: assessment.id,
    title: assessment.title,
    status: assessment.status,
    score: assessment.score === null ? null : Number(assessment.score),
    totalScore: Number(assessment.total_score) || 100,
    createdAt: assessment.created_at,
    submittedAt: assessment.submitted_at || undefined,
    items: items.map((item) => ({
      id: item.id,
      questionType: item.question_type,
      question: item.question,
      options: Array.isArray(item.options) ? item.options : [],
      correctAnswer: item.correct_answer,
      explanation: item.explanation || "",
      knowledgeTitle: item.knowledge_title || ""
    }))
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId } = await context.params;
    const project = await ensureProject(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const assessments = await supabaseRest<DbAssessment[]>(
      auth.token,
      `assessments?select=id,title,status,score,total_score,created_at,submitted_at&project_id=eq.${projectId}&order=created_at.desc&limit=1`
    );
    const latest = assessments[0] ? await loadAssessment(auth.token, assessments[0].id) : null;

    return NextResponse.json({ ok: true, assessment: latest });
  } catch (error) {
    console.error(error);
    return jsonError("测评加载失败，请确认已执行 learning-loop-migration.sql。", 500);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const { projectId } = await context.params;
    const project = await ensureProject(auth.token, projectId);
    if (!project) return jsonError("项目不存在或无权访问", 404);

    const currentStep = await getCurrentStep(auth.token, projectId);
    const title = currentStep ? `${currentStep.title}随堂测评` : `${project.name}随堂测评`;
    const created = await supabaseRest<DbAssessment[]>(auth.token, "assessments", {
      method: "POST",
      prefer: "return=representation",
      body: {
        project_id: projectId,
        user_id: auth.user.id,
        step_id: currentStep?.id || null,
        title,
        mode: "随堂测评",
        total_score: 100,
        status: "draft",
        metadata: {
          projectGoal: project.goal || "",
          stepTitle: currentStep?.title || ""
        }
      }
    });
    const assessment = created[0];

    await supabaseRest<DbAssessmentItem[]>(auth.token, "assessment_items", {
      method: "POST",
      prefer: "return=representation",
      body: buildQuestions(project, currentStep).map((item) => ({
        ...item,
        assessment_id: assessment.id,
        project_id: projectId,
        user_id: auth.user.id
      }))
    });

    const loaded = await loadAssessment(auth.token, assessment.id);
    return NextResponse.json({ ok: true, assessment: loaded });
  } catch (error) {
    console.error(error);
    return jsonError("测评生成失败，请确认已执行 learning-loop-migration.sql。", 500);
  }
}
