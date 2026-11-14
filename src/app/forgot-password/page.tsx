"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) setError(error.message);
    else setInfo("If that email has an account, a reset link is on its way.");
    setLoading(false);
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>Reset your password</h1>
        <p className="muted mt-0">
          Enter your email and we will send you a reset link.
        </p>
        {error && <div className="error">{error}</div>}
        {info && <div className="success">{info}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </button>
        <div className="auth-links">
          <Link href="/login">Back to log in</Link>
        </div>
      </form>
    </div>
  );
}
