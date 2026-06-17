import { NextRequest } from "next/server";

export type SupabaseUser = {
  id: string;
  email?: string;
};

export type AuthResult =
  | {
      token: string;
      user: SupabaseUser;
    }
  | {
      error: string;
      status: 401;
    };

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function getUserFromToken(token: string) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) return null;
  const user = (await response.json()) as SupabaseUser;
  return user.id ? user : null;
}

export async function supabaseRest<T>(
  token: string,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    prefer?: string;
  } = {}
) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured");

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Supabase request failed with ${response.status}`);
  }

  if (response.status === 204) return null as T;

  const responseText = await response.text();
  if (!responseText.trim()) return null as T;

  return JSON.parse(responseText) as T;
}

export async function requireUser(request: NextRequest): Promise<AuthResult> {
  const token = getBearerToken(request);
  if (!token) return { error: "未登录或登录已过期", status: 401 as const };

  const user = await getUserFromToken(token);
  if (!user) return { error: "未登录或登录已过期", status: 401 as const };

  return { token, user };
}
