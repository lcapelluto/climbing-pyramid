import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../firebase";

const FRIENDLY_ERRORS = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/user-not-found": "No account with that email. Try signing up instead.",
  "auth/wrong-password": "Wrong password. Try again or reset it.",
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/email-already-in-use": "That email already has an account. Try logging in instead.",
  "auth/weak-password": "Password should be at least 6 characters.",
};

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email) {
      setError("Enter your email above first, then tap reset.");
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfo("Password reset email sent — check your inbox.");
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] || "Couldn't send that. Check the email and try again.");
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.title}>{mode === "login" ? "Log in" : "Create account"}</div>
        <form onSubmit={submit}>
          <input
            style={S.input}
            type="email"
            placeholder="name@email.com"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={{ ...S.input, marginTop: 10 }}
            type="password"
            placeholder="Password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <div style={S.error}>{error}</div>}
          {info && <div style={S.info}>{info}</div>}
          <button style={S.submit} type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        {mode === "login" && (
          <button style={S.linkBtn} onClick={resetPassword}>
            Forgot password?
          </button>
        )}

        <div style={S.switchRow}>
          {mode === "login" ? "New here?" : "Already have an account?"}
          <button
            style={S.linkBtn}
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  );
}

const C = { bg: "#F7F5F0", card: "#FFFFFF", border: "#E3DECF", text: "#2A2822", muted: "#8A8478", gold: "#B8792A", red: "#C1503A" };

const S = {
  page: {
    background: C.bg,
    minHeight: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
    padding: 20,
  },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  title: { fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 16, textAlign: "center" },
  input: {
    width: "100%",
    background: "#F1EDE2",
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
  },
  submit: {
    width: "100%",
    marginTop: 16,
    background: C.gold,
    color: "#FFFDF8",
    border: "none",
    borderRadius: 10,
    padding: "11px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: C.red, fontSize: 13, marginTop: 10 },
  info: { color: C.gold, fontSize: 13, marginTop: 10 },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: C.gold,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: "8px 4px",
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    fontSize: 13,
    color: C.muted,
    marginTop: 8,
  },
};
