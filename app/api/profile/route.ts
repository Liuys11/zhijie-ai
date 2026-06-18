import { NextRequest, NextResponse } from "next/server";
import { requireUser, supabaseRest } from "@/lib/supabase-rest";

type DbProfile = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  avatar_path: string | null;
  updated_at: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function defaultNickname(email?: string) {
  return email?.split("@")[0]?.trim() || "学习者";
}

function normalizeProfile(profile: DbProfile, email?: string) {
  return {
    nickname: profile.nickname || defaultNickname(email),
    avatarUrl: profile.avatar_url || "",
    avatarPath: profile.avatar_path || ""
  };
}

function normalizeNickname(value: unknown, email?: string) {
  if (typeof value !== "string") return defaultNickname(email);
  return value.trim();
}

async function ensureProfile(token: string, userId: string, email?: string) {
  const existing = await supabaseRest<DbProfile[]>(
    token,
    `profiles?select=user_id,nickname,avatar_url,avatar_path,updated_at&user_id=eq.${userId}&limit=1`
  );
  if (existing[0]) return existing[0];

  const created = await supabaseRest<DbProfile[]>(token, "profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: userId,
      nickname: defaultNickname(email),
      avatar_url: "",
      avatar_path: ""
    }
  });

  return created[0];
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const profile = await ensureProfile(auth.token, auth.user.id, auth.user.email);
    return NextResponse.json({
      ok: true,
      profile: normalizeProfile(profile, auth.user.email)
    });
  } catch (error) {
    console.error(error);
    return jsonError("个人资料加载失败，请检查 Supabase 配置。", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ("status" in auth) return jsonError(auth.error, auth.status);

    const body = (await request.json()) as { nickname?: unknown; avatarUrl?: unknown; avatarPath?: unknown };
    const nickname = normalizeNickname(body.nickname, auth.user.email);
    if (nickname.length < 2 || nickname.length > 30) {
      return jsonError("昵称长度需要在 2 到 30 个字符之间。", 400);
    }

    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.trim().slice(0, 700) : "";
    const avatarPath = typeof body.avatarPath === "string" ? body.avatarPath.trim().slice(0, 500) : "";

    await ensureProfile(auth.token, auth.user.id, auth.user.email);
    const updated = await supabaseRest<DbProfile[]>(auth.token, `profiles?user_id=eq.${auth.user.id}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        nickname,
        avatar_url: avatarUrl,
        avatar_path: avatarPath,
        updated_at: new Date().toISOString()
      }
    });

    return NextResponse.json({
      ok: true,
      profile: normalizeProfile(updated[0], auth.user.email)
    });
  } catch (error) {
    console.error(error);
    return jsonError("个人资料保存失败，请稍后重试。", 500);
  }
}
