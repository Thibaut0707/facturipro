"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

export default function HomePage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingYearly, setLoadingYearly] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleAuth() {
    try {
      setLoadingAuth(true);

      if (!email || !password) {
        alert("Entre ton email et ton mot de passe.");
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) {
          alert(error.message);
          return;
        }

        if (data.user) {
          alert("Compte créé ✅");
          setSession(data.session ?? null);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          alert(error.message);
          return;
        }

        setSession(data.session);
      }
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
  }

  async function handleSubscribe(plan: "monthly" | "yearly") {
    try {
      if (!session?.user?.id) {
        alert("Connecte-toi d'abord pour démarrer ton abonnement.");
        return;
      }

      if (plan === "monthly") setLoadingMonthly(true);
      if (plan === "yearly") setLoadingYearly(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: session.user.id,
          plan,
        }),
      });

      const data: { url?: string; error?: string } = await res.json();

      if (!res.ok) {
        alert(data.error || "Erreur Stripe");
        return;
      }

      if (!data.url) {
        alert("Stripe n'a pas renvoyé d'URL.");
        return;
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error("Homepage subscribe error:", error);
      alert("Impossible de lancer le paiement.");
    } finally {
      setLoadingMonthly(false);
      setLoadingYearly(false);
    }
  }

  return (
    <main style={{ padding: "60px 20px", fontFamily: "Arial, sans-serif" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 64,
              fontWeight: 900,
              lineHeight: 0.95,
              background: "linear-gradient(90deg,#7c3aed,#2563eb)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: 20,
            }}
          >
            FacturiPro
          </h1>

          <p
            style={{
              fontSize: 21,
              color: "#475569",
              maxWidth: 720,
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            La plateforme moderne pour créer et gérer tes factures
            professionnelles. Ajoute ton logo, ta signature, tes taxes, exporte
            tes PDF et démarre avec un essai gratuit de 7 jours.
          </p>

          <div
            style={{
              display: "inline-block",
              background: "#22c55e",
              color: "white",
              padding: "10px 16px",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 28,
            }}
          >
            🎁 Essai gratuit 7 jours
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 20,
              marginTop: 24,
            }}
          >
            <div
              style={{
                padding: 24,
                borderRadius: 18,
                background: "#ffffff",
                boxShadow: "0 12px 30px rgba(0,0,0,0.06)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Factures rapides</h3>
              <p style={{ color: "#64748b", lineHeight: 1.7 }}>
                Crée des factures professionnelles en quelques secondes avec
                calcul automatique des taxes.
              </p>
            </div>

            <div
              style={{
                padding: 24,
                borderRadius: 18,
                background: "#ffffff",
                boxShadow: "0 12px 30px rgba(0,0,0,0.06)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Branding entreprise</h3>
              <p style={{ color: "#64748b", lineHeight: 1.7 }}>
                Ajoute ton logo, ta signature et tes informations pour générer
                des factures propres et crédibles.
              </p>
            </div>

            <div
              style={{
                padding: 24,
                borderRadius: 18,
                background: "#ffffff",
                boxShadow: "0 12px 30px rgba(0,0,0,0.06)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Abonnement simple</h3>
              <p style={{ color: "#64748b", lineHeight: 1.7 }}>
                Plan mensuel avec essai gratuit de 7 jours ou plan annuel pour
                économiser.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 50 }}>
            <h2 style={{ fontSize: 34, marginBottom: 22 }}>Choisis ton plan</h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
                gap: 24,
              }}
            >
              <div
                style={{
                  padding: 28,
                  borderRadius: 20,
                  background: "white",
                  boxShadow: "0 15px 40px rgba(0,0,0,0.08)",
                }}
              >
                <h3>Plan Mensuel</h3>
                <p
                  style={{
                    fontSize: 40,
                    fontWeight: 900,
                    color: "#7c3aed",
                    margin: "10px 0",
                  }}
                >
                  9,99 $
                </p>
                <p style={{ color: "#64748b" }}>/ mois</p>

                <ul style={{ color: "#475569", lineHeight: 1.9 }}>
                  <li>Essai gratuit 7 jours</li>
                  <li>Factures illimitées</li>
                  <li>PDF premium</li>
                  <li>Logo + signature</li>
                </ul>

                <button
                  onClick={() => handleSubscribe("monthly")}
                  disabled={loadingMonthly}
                  style={{
                    width: "100%",
                    marginTop: 16,
                    padding: "14px 16px",
                    background: "linear-gradient(135deg,#7c3aed,#2563eb)",
                    color: "white",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {loadingMonthly ? "Chargement..." : "Commencer l’essai gratuit"}
                </button>
              </div>

              <div
                style={{
                  padding: 28,
                  borderRadius: 20,
                  background: "white",
                  boxShadow: "0 15px 40px rgba(0,0,0,0.08)",
                }}
              >
                <h3>Plan Annuel</h3>
                <p
                  style={{
                    fontSize: 40,
                    fontWeight: 900,
                    color: "#2563eb",
                    margin: "10px 0",
                  }}
                >
                  79,99 $
                </p>
                <p style={{ color: "#64748b" }}>/ an</p>

                <ul style={{ color: "#475569", lineHeight: 1.9 }}>
                  <li>Accès premium complet</li>
                  <li>Abonnement annuel</li>
                  <li>Factures illimitées</li>
                  <li>Export PDF</li>
                </ul>

                <button
                  onClick={() => handleSubscribe("yearly")}
                  disabled={loadingYearly}
                  style={{
                    width: "100%",
                    marginTop: 16,
                    padding: "14px 16px",
                    background: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {loadingYearly ? "Chargement..." : "Choisir le plan annuel"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.82)",
            border: "1px solid rgba(148,163,184,0.16)",
            boxShadow: "0 20px 50px rgba(15,23,42,0.08)",
            borderRadius: 24,
            padding: 28,
            position: "sticky",
            top: 24,
          }}
        >
          {session ? (
            <>
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>Tu es connecté ✅</h2>

              <p style={{ color: "#64748b", lineHeight: 1.7, marginTop: 0 }}>
                Tu peux maintenant accéder au dashboard ou lancer ton abonnement.
              </p>

              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: "#ecfeff",
                  color: "#0f172a",
                  fontWeight: 700,
                  marginTop: 20,
                }}
              >
                Connecté avec : {session.user.email}
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
                <button
                  onClick={() => router.push("/dashboard")}
                  style={{
                    padding: "14px 16px",
                    background: "linear-gradient(135deg,#7c3aed,#2563eb)",
                    color: "white",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Aller au dashboard
                </button>

                <button
                  onClick={handleLogout}
                  style={{
                    padding: "14px 16px",
                    background: "#f3f4f6",
                    color: "#111827",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Déconnexion
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 18,
                }}
              >
                <button
                  onClick={() => setMode("signup")}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: mode === "signup" ? "none" : "1px solid #dbe4f0",
                    background:
                      mode === "signup"
                        ? "linear-gradient(135deg,#7c3aed,#2563eb)"
                        : "#f8fafc",
                    color: mode === "signup" ? "white" : "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Inscription
                </button>

                <button
                  onClick={() => setMode("login")}
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: mode === "login" ? "none" : "1px solid #dbe4f0",
                    background:
                      mode === "login"
                        ? "linear-gradient(135deg,#7c3aed,#2563eb)"
                        : "#f8fafc",
                    color: mode === "login" ? "white" : "#0f172a",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Connexion
                </button>
              </div>

              <h2 style={{ marginTop: 0, marginBottom: 8 }}>
                {mode === "signup" ? "Créer un compte" : "Se connecter"}
              </h2>

              <p style={{ color: "#64748b", lineHeight: 1.7, marginTop: 0 }}>
                Connecte-toi ou crée ton compte pour activer ton essai gratuit et utiliser l’application.
              </p>

              <div style={{ display: "grid", gap: 12, marginTop: 22 }}>
                {mode === "signup" ? (
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nom complet"
                    style={{
                      padding: "14px 16px",
                      borderRadius: 14,
                      border: "1px solid #dbe4f0",
                    }}
                  />
                ) : null}

                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: "1px solid #dbe4f0",
                  }}
                />

                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe"
                  type="password"
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: "1px solid #dbe4f0",
                  }}
                />

                <button
                  onClick={handleAuth}
                  disabled={loadingAuth}
                  style={{
                    marginTop: 6,
                    padding: "14px 16px",
                    background: "linear-gradient(135deg,#7c3aed,#2563eb)",
                    color: "white",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {loadingAuth
                    ? "Chargement..."
                    : mode === "signup"
                    ? "Créer mon compte"
                    : "Me connecter"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}