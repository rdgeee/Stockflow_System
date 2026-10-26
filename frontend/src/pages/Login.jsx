import { useState } from "react";
import { ArrowRight, Boxes, ShieldCheck } from "lucide-react";
import { login } from "../api/client.js";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      onLogin(await login(email.trim(), password));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-aside">
        <div className="login-brand"><div className="brand-mark">S</div><strong>StockFlow</strong></div>
        <div className="login-aside-copy">
          <span className="login-kicker">INVENTORY, IN MOTION</span>
          <h1>One clear view of your entire supply chain.</h1>
          <p>Track stock, coordinate your warehouses, and keep every delivery moving.</p>
        </div>
        <div className="login-aside-foot"><ShieldCheck size={16} /> Multi-warehouse operations workspace</div>
      </div>
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo"><Boxes size={23} aria-hidden="true" /></div>
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Sign in to StockFlow</h2>
        <p className="login-subtitle">Use your StockFlow account to continue.</p>
        <label>Email address
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <label>Password
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary full-button" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : <>Sign in <ArrowRight size={16} aria-hidden="true" /></>}
        </button>
      </form>
    </main>
  );
}
