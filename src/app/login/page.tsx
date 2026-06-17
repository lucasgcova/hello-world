"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function nextParam() {
    if (typeof window === "undefined") return "/";
    return new URLSearchParams(window.location.search).get("next") || "/";
  }

  function callbackUrl() {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    return `${base}/auth/callback?next=${encodeURIComponent(nextParam())}`;
  }

  async function signInWithGoogle() {
    setError(null);
    setLoading("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading("email");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(null);
    if (error) setError(error.message);
    else setMessage("Check your email for a magic sign-in link.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-sidebar p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🗂️</div>
          <h1 className="text-xl font-semibold">TeamSpace</h1>
          <p className="mt-1 text-sm opacity-60">
            Project management for your team
          </p>
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={loading !== null}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium transition hover:opacity-80 disabled:opacity-50"
        >
          {loading === "google" ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="my-4 flex items-center gap-3 text-xs opacity-40">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={signInWithEmail} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            type="submit"
            disabled={loading !== null}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading === "email" ? "Sending…" : "Email me a magic link"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-center text-sm text-green-600">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-center text-sm text-red-500">{error}</p>
        )}
      </div>
    </main>
  );
}
