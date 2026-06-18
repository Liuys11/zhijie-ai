"use client";

import { FormEvent, useState } from "react";
import { BrainCircuit, Lock, Mail, UserPlus } from "lucide-react";
import { AuthSession, clearSession, readSession, saveSession, signInWithPassword, signUpWithPassword } from "@/lib/supabase-browser";
import { LearningWorkspace } from "./learning-workspace";

type AuthMode = "login" | "signup";

export function AuthGate() {
  const [session, setSession] = useState<AuthSession | null>(() => (typeof window === "undefined" ? null : readSession()));
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const nextSession = mode === "login" ? await signInWithPassword(email, password) : await signUpWithPassword(email, password);
      saveSession(nextSession);
      setSession(nextSession);
      setStatus("success");
      setMessage("登录成功，正在进入学习空间。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    }
  };

  const signOut = () => {
    clearSession();
    setSession(null);
    setPassword("");
    setStatus("idle");
    setMessage("");
  };

  if (session) {
    return <LearningWorkspace session={session} onSignOut={signOut} />;
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <div className="brand-mark">
            <BrainCircuit size={25} />
          </div>
          <div>
            <strong>知界 AI</strong>
            <span>登录后保存项目与消息历史</span>
          </div>
        </div>

        <div className="auth-copy">
          <span>{mode === "login" ? "账号登录" : "创建账号"}</span>
          <h1>{mode === "login" ? "继续你的专属学习空间" : "注册后开始使用知界 AI"}</h1>
          <p>当前版本已取消游客模式。每个账号拥有独立项目、对话记录和学习进度。</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            邮箱
            <span>
              <Mail size={17} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            </span>
          </label>
          <label>
            密码
            <span>
              <Lock size={17} />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位密码"
                minLength={6}
                required
              />
            </span>
          </label>

          {message && <p className={`auth-message ${status}`}>{message}</p>}

          <button className="auth-submit" type="submit" disabled={status === "loading"}>
            {mode === "login" ? <Lock size={18} /> : <UserPlus size={18} />}
            {status === "loading" ? "处理中..." : mode === "login" ? "登录" : "注册并进入"}
          </button>
        </form>

        <button className="auth-switch" onClick={() => setMode((current) => (current === "login" ? "signup" : "login"))}>
          {mode === "login" ? "还没有账号？去注册" : "已有账号？去登录"}
        </button>
      </section>
    </main>
  );
}
