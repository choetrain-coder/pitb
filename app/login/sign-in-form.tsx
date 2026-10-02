"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (authError) setError(authError.message);
    else setNotice("If this address is registered for the workspace, a secure sign-in link is on its way.");
  }
  const initialMessage = initialError === "not_registered" ? "This email isn't registered with a team yet. Ask your IT administrator to add it." : initialError ? "That sign-in link expired or could not be verified. Request a fresh link." : "";
  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span>▦</span><strong>room<span>book</span></strong></div><small className="eyebrow">SEL / PROPERTIES</small><h1>Sign in to your workspace</h1><p>Use your registered work email. We’ll send you a secure sign-in link.</p>{initialMessage&&<div className="form-error">{initialMessage}</div>}<form className="form" onSubmit={submit}><label>Work email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" /></label>{error&&<div className="form-error">{error}</div>}{notice&&<div className="auth-notice" role="status">{notice}</div>}<button className="btn primary" disabled={busy}>{busy?"Sending link…":"Email me a sign-in link"}</button></form></section></main>;
}
