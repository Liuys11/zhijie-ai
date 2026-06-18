"use client";

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  user: AuthUser;
};

const sessionKey = "zhijie-ai-session";

export function getBrowserSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function readSession() {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(sessionKey);
}

export async function signInWithPassword(email: string, password: string) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const data = (await response.json()) as Partial<AuthSession> & { error_description?: string; msg?: string };
  if (!response.ok || !data.access_token || !data.user) {
    throw new Error(data.error_description || data.msg || "登录失败，请检查邮箱和密码。");
  }

  return data as AuthSession;
}

export async function signUpWithPassword(email: string, password: string) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");

  const response = await fetch(`${config.url}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const data = (await response.json()) as Partial<AuthSession> & { user?: AuthUser; error_description?: string; msg?: string };
  if (!response.ok) {
    throw new Error(data.error_description || data.msg || "注册失败，请稍后重试。");
  }

  if (!data.access_token || !data.user) {
    throw new Error("注册成功，请先到邮箱完成验证，然后回到这里登录。");
  }

  return data as AuthSession;
}

export function getAvatarPublicUrl(path: string, version = Date.now()) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");

  const normalizedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${config.url}/storage/v1/object/public/avatars/${normalizedPath}?v=${version}`;
}

export async function uploadAvatarFile(token: string, path: string, file: File) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");

  const response = await fetch(`${config.url}/storage/v1/object/avatars/${path}`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type,
      "x-upsert": "true"
    },
    body: file
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `头像上传失败，状态码 ${response.status}`);
  }
}

export async function deleteAvatarFile(token: string, path: string) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");
  if (!path) return;

  const response = await fetch(`${config.url}/storage/v1/object/avatars`, {
    method: "DELETE",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefixes: [path] })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `旧头像删除失败，状态码 ${response.status}`);
  }
}

export async function uploadProjectFile(token: string, path: string, file: File) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");

  const response = await fetch(`${config.url}/storage/v1/object/project-files/${path}`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: file
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `项目资料上传失败，状态码 ${response.status}`);
  }
}

export async function deleteProjectFile(token: string, path: string) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");
  if (!path) return;

  const response = await fetch(`${config.url}/storage/v1/object/project-files`, {
    method: "DELETE",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefixes: [path] })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `项目资料文件删除失败，状态码 ${response.status}`);
  }
}

export async function createProjectFileSignedUrl(token: string, path: string) {
  const config = getBrowserSupabaseConfig();
  if (!config) throw new Error("Supabase 环境变量尚未配置。");
  if (!path) throw new Error("资料文件路径为空，无法打开。");

  const normalizedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const response = await fetch(`${config.url}/storage/v1/object/sign/project-files/${normalizedPath}`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ expiresIn: 300 })
  });

  const data = (await response.json().catch(() => ({}))) as { signedURL?: string; error?: string; message?: string };
  if (!response.ok || !data.signedURL) {
    throw new Error(data.error || data.message || `资料链接生成失败，状态码 ${response.status}`);
  }

  return data.signedURL.startsWith("http") ? data.signedURL : `${config.url}/storage/v1${data.signedURL}`;
}
