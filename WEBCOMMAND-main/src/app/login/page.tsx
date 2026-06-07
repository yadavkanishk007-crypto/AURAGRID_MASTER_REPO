"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Check if already authenticated on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            if (data && data.role !== "field_worker") {
              window.location.href = "/";
            }
          });
      }
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      setLoading(false);
      return;
    }

    try {
      const { data: { session }, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (session) {
        // Fetch profile
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (profileErr || !profile) {
          throw new Error("Unable to retrieve user profile.");
        }

        if (profile.role === "field_worker") {
          await supabase.auth.signOut();
          throw new Error("Access Denied: Field Workers cannot access the Command Centre web application. Please use the mobile app.");
        }

        setSuccess(true);
        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed. Please check your credentials.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "radial-gradient(circle at center, #18181b 0%, #09090b 100%)",
        fontFamily: "'Outfit', 'Inter', sans-serif",
        color: "#f8fafc",
        padding: "20px",
        overflow: "hidden",
        position: "relative"
      }}
    >
      {/* Background glowing decorations */}
      <div
        style={{
          position: "absolute",
          width: "300px",
          height: "300px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0) 70%)",
          top: "10%",
          left: "15%",
          filter: "blur(50px)",
          pointerEvents: "none"
        }}
      />
      <div
        style={{
          position: "absolute",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0) 70%)",
          bottom: "10%",
          right: "15%",
          filter: "blur(60px)",
          pointerEvents: "none"
        }}
      />

      {/* Login Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(24, 24, 27, 0.65)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          padding: "40px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
          textAlign: "center",
          zIndex: 1,
          animation: "fadeIn 0.6s ease-out"
        }}
      >
        <div style={{ marginBottom: "30px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              margin: "0 auto 15px auto",
              background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
              borderRadius: "14px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              boxShadow: "0 8px 20px rgba(168, 85, 247, 0.3)"
            }}
          >
            <img src="/logo.png" alt="AuraGrid" width="32" height="32" style={{ width: "32px", height: "32px", borderRadius: "4px" }} />
          </div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#f8fafc", margin: "0 0 8px 0" }}>
            AuraGrid Control Room
          </h2>
          <p style={{ fontSize: "0.85rem", color: "#a1a1aa", margin: 0 }}>
            System Administrator Authentication Portal
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "left" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor="email" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Administrator Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. jhansi@auragrid.org"
              disabled={loading || success}
              style={{
                background: "rgba(39, 39, 42, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                padding: "12px 14px",
                color: "#f8fafc",
                fontSize: "0.9rem",
                outline: "none",
                transition: "all 0.2s ease-in-out",
                width: "100%",
                boxSizing: "border-box"
              }}
              className="login-input"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor="password" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Access Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading || success}
              style={{
                background: "rgba(39, 39, 42, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "8px",
                padding: "12px 14px",
                color: "#f8fafc",
                fontSize: "0.9rem",
                outline: "none",
                transition: "all 0.2s ease-in-out",
                width: "100%",
                boxSizing: "border-box"
              }}
              className="login-input"
            />
          </div>

          {errorMsg && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#f87171",
                fontSize: "0.75rem",
                lineHeight: "1.4",
                animation: "shake 0.3s ease-in-out"
              }}
            >
              {errorMsg}
            </div>
          )}

          {success && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#34d399",
                fontSize: "0.75rem",
                textAlign: "center"
              }}
            >
              Access Granted. Initializing console...
            </div>
          )}

          <button
            type="submit"
            disabled={loading || success}
            style={{
              background: success
                ? "#10b981"
                : "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
              border: "none",
              borderRadius: "8px",
              padding: "14px",
              color: "#ffffff",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: loading || success ? "default" : "pointer",
              boxShadow: "0 4px 12px rgba(168, 85, 247, 0.25)",
              transition: "all 0.2s ease",
              marginTop: "10px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center"
            }}
            className="login-btn"
          >
            {loading ? (
              <span className="spinner" />
            ) : success ? (
              "Secured Connection Established"
            ) : (
              "Establish Secure Session"
            )}
          </button>
        </form>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .login-input:focus {
          border-color: #a855f7 !important;
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2) !important;
          background: rgba(39, 39, 42, 0.7) !important;
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(168, 85, 247, 0.35);
        }
        .login-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
