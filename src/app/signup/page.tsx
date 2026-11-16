"use client";

import Logo from "@/components/Logo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import WarmUp from "@/components/WarmUp";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setInfo("Check your email to confirm your account, then log in.");
    setLoading(false);
  }

  return (
    <div className="auth-wrap">
      <WarmUp />
      <form className="card auth-card" onSubmit={onSubmit}>
        <Logo className="auth-logo" />
        <h1>Create your account</h1>
        <p className="muted mt-0">
          Start tracking your money in a minute.
        </p>
        {error && <div className="error">{error}</div>}
        {info && <div className="success">{info}</div>}
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-accent btn-block" disabled={loading}>
          {loading ? "Creating..." : "Sign up"}
        </button>
        <div className="auth-links">
          <span className="muted">Already have an account?</span>
          <Link href="/login">Log in</Link>
        </div>
      </form>
    </div>
  );
}
