"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type SubscriptionRow = {
  status: string;
  plan: string;
  current_period_end?: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  created_at: string;
  totals: {
    grandTotal?: number;
  } | null;
};

type RevenuePoint = {
  month: string;
  amount: number;
};

function formatDate(date?: string | null) {
  if (!date) return "—";

  try {
    return new Date(date).toLocaleDateString("fr-CA");
  } catch {
    return "—";
  }
}

function money(n?: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("fr-CA", {
    month: "short",
    year: "2-digit",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<Session | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingYearly, setLoadingYearly] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  const isPremium =
    (subscription?.status === "active" || subscription?.status === "trialing") &&
    (subscription?.plan === "monthly" || subscription?.plan === "yearly");

  const currentPlanLabel = useMemo(() => {
    if (subscription?.plan === "monthly") return "Mensuel";
    if (subscription?.plan === "yearly") return "Annuel";
    return "Free";
  }, [subscription]);

  const statusLabel = useMemo(() => {
    if (subscription?.status === "trialing") return "Essai gratuit en cours";
    if (subscription?.status === "active") return "Actif";
    if (subscription?.status === "past_due") return "Paiement en retard";
    if (subscription?.status === "canceled") return "Annulé";
    return subscription?.status || "Inactive";
  }, [subscription]);

  const stats = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    let monthlyRevenue = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;
    let partialTotal = 0;

    for (const invoice of invoices) {
      const total = Number(invoice.totals?.grandTotal || 0);
      const createdAt = new Date(invoice.created_at);

      if (invoice.status === "paid") paidTotal += total;
      if (invoice.status === "unpaid") unpaidTotal += total;
      if (invoice.status === "partial") partialTotal += total;

      if (createdAt.getMonth() === month && createdAt.getFullYear() === year) {
        monthlyRevenue += total;
      }
    }

    return {
      monthlyRevenue,
      paidTotal,
      unpaidTotal,
      partialTotal,
      totalInvoiced: invoices.reduce(
        (sum, inv) => sum + Number(inv.totals?.grandTotal || 0),
        0
      ),
    };
  }, [invoices]);

  const revenueChartData = useMemo<RevenuePoint[]>(() => {
    const now = new Date();
    const buckets: RevenuePoint[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        month: monthLabel(d),
        amount: 0,
      });
    }

    for (const invoice of invoices) {
      const createdAt = new Date(invoice.created_at);
      const label = monthLabel(new Date(createdAt.getFullYear(), createdAt.getMonth(), 1));
      const bucket = buckets.find((b) => b.month === label);

      if (bucket) {
        bucket.amount += Number(invoice.totals?.grandTotal || 0);
      }
    }

    return buckets;
  }, [invoices]);

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/");
        return;
      }

      setSession(session);

      const { data: sub, error: subError } = await supabase
        .from("subscriptions")
        .select("status, plan, current_period_end")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (subError) {
        console.error("Subscription load error:", subError);
      } else {
        setSubscription(sub);
      }

      const { data: invData, error: invError } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, created_at, totals")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (invError) {
        console.error("Invoices load error:", invError);
      } else {
        setInvoices((invData || []) as InvoiceRow[]);
      }

      setLoading(false);
    }

    loadData();

    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => authSub.unsubscribe();
  }, [router]);

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

      const rawText = await res.text();
      let data: { url?: string; error?: string } = {};

      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        alert("La route checkout n'a pas renvoyé un JSON valide.");
        return;
      }

      if (!res.ok) {
        alert(data.error || "Erreur Stripe");
        return;
      }

      if (!data.url) {
        alert("Stripe n'a pas renvoyé d'URL.");
        return;
      }

      window.location.assign(data.url);
    } catch (err) {
      console.error("handleSubscribe error:", err);
      alert("Erreur paiement Stripe");
    } finally {
      setLoadingMonthly(false);
      setLoadingYearly(false);
    }
  }

  async function handleOpenPortal() {
    try {
      if (!session?.user?.id) {
        alert("Session introuvable.");
        return;
      }

      setLoadingPortal(true);

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: session.user.id,
        }),
      });

      const rawText = await res.text();
      let data: { url?: string; error?: string } = {};

      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        alert("La route portail n'a pas renvoyé un JSON valide.");
        return;
      }

      if (!res.ok) {
        alert(data.error || "Impossible d’ouvrir le portail d’abonnement.");
        return;
      }

      if (!data.url) {
        alert("Stripe n'a pas renvoyé d'URL de portail.");
        return;
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error("handleOpenPortal error:", error);
      alert("Erreur ouverture portail");
    } finally {
      setLoadingPortal(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return <main style={{ padding: 40, fontFamily: "Arial" }}>Chargement...</main>;
  }

  if (!session) {
    return (
      <main style={{ padding: 40, fontFamily: "Arial" }}>
        <div
          style={{
            maxWidth: 700,
            margin: "0 auto",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 24,
          }}
        >
          <h1>Tu n’es pas connecté</h1>
          <p>Connecte-toi pour accéder à ton dashboard.</p>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retour à l’accueil
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: "36px 24px 70px",
        maxWidth: 1150,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ color: "#6366f1", fontWeight: 800 }}>FacturiPro • Dashboard</div>
          <h1 style={{ fontSize: 42, margin: "10px 0 8px", color: "#0f172a" }}>
            Bienvenue 👋
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 16, maxWidth: 760, lineHeight: 1.6 }}>
            Suis la santé financière de ton entreprise, consulte rapidement tes factures récentes,
            gère ton abonnement et garde une vue claire sur tes revenus, tes paiements reçus
            et les montants encore à encaisser.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/invoices/new")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Créer une facture
          </button>

          <button
            onClick={() => router.push("/invoices")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Voir mes factures
          </button>

          <button
            onClick={() => router.push("/profile")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Mon profil
          </button>

          <button
            onClick={handleLogout}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Déconnexion
          </button>
        </div>
      </div>

      {success === "true" ? (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #86efac",
            color: "#166534",
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            fontWeight: 700,
          }}
        >
          Paiement validé ✅ Ton abonnement est activé.
        </div>
      ) : null}

      {canceled === "true" ? (
        <div
          style={{
            background: "#fff7ed",
            border: "1px solid #fdba74",
            color: "#9a3412",
            padding: 16,
            borderRadius: 12,
            marginBottom: 16,
            fontWeight: 700,
          }}
        >
          Paiement annulé.
        </div>
      ) : null}

      <section
        style={{
          background: "linear-gradient(135deg,#ffffff,#f8fafc)",
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Ton abonnement est actif</h2>
            <p style={{ color: "#64748b", maxWidth: 680 }}>
              Tu peux gérer ton plan, ton moyen de paiement, suivre ton essai gratuit
              et accéder rapidement à tes principales actions de facturation.
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              {subscription?.status === "trialing" ? (
                <span
                  style={{
                    display: "inline-block",
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "#dcfce7",
                    color: "#166534",
                    fontWeight: 700,
                  }}
                >
                  Essai gratuit jusqu’au {formatDate(subscription?.current_period_end)}
                </span>
              ) : null}

              <span
                style={{
                  display: "inline-block",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "#ede9fe",
                  color: "#6d28d9",
                  fontWeight: 700,
                }}
              >
                Plan {currentPlanLabel}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <button
              onClick={() => router.push("/invoices/new")}
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                border: "none",
                background: "#4f46e5",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Nouvelle facture
            </button>

            <button
              onClick={() => router.push("/invoices")}
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Voir mes factures
            </button>

            <button
              onClick={handleOpenPortal}
              disabled={loadingPortal}
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {loadingPortal ? "Ouverture..." : "Gérer mon abonnement"}
            </button>
          </div>
        </div>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Factures récentes</h2>

        {invoices.length === 0 ? (
          <div style={{ color: "#64748b" }}>Aucune facture pour le moment.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "12px 8px" }}>Facture</th>
                  <th style={{ padding: "12px 8px" }}>Date</th>
                  <th style={{ padding: "12px 8px" }}>Statut</th>
                  <th style={{ padding: "12px 8px" }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 5).map((invoice) => (
                  <tr
                    key={invoice.id}
                    style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                    onClick={() => router.push(`/invoices/${invoice.id}`)}
                  >
                    <td style={{ padding: "12px 8px", fontWeight: 700 }}>
                      #{invoice.invoice_number}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{formatDate(invoice.created_at)}</td>
                    <td style={{ padding: "12px 8px" }}>
                      {invoice.status === "paid"
                        ? "Payée"
                        : invoice.status === "partial"
                        ? "Paiement incomplet"
                        : "Impayée"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{money(invoice.totals?.grandTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>Revenus ce mois</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#111827" }}>
            {money(stats.monthlyRevenue)}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>Factures payées</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#166534" }}>
            {money(stats.paidTotal)}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>Factures impayées</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#991b1b" }}>
            {money(stats.unpaidTotal)}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>Paiements incomplets</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#92400e" }}>
            {money(stats.partialTotal)}
          </div>
        </div>
      </div>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Évolution des revenus</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              Vue sur les 6 derniers mois
            </p>
          </div>

          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              background: "#eef2ff",
              color: "#4338ca",
              fontWeight: 700,
            }}
          >
            Total facturé : {money(stats.totalInvoiced)}
          </div>
        </div>

        <div style={{ width: "100%", height: 320 }}>
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={revenueChartData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="month" />
      <YAxis />
      <Tooltip
        formatter={(value) => money(Number(value))}
        labelFormatter={(label) => `Mois : ${String(label)}`}
      />
      <Line
        type="monotone"
        dataKey="amount"
        stroke="#4f46e5"
        strokeWidth={3}
        dot={{ r: 4 }}
      />
    </LineChart>
  </ResponsiveContainer>
</div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg,#ffffff,#f8fafc)",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>Statut du compte</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#0f172a" }}>
            {isPremium ? "Premium" : "Gratuit"}
          </div>
          <div style={{ marginTop: 12 }}>
            <span
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 999,
                background:
                  subscription?.status === "active" || subscription?.status === "trialing"
                    ? "#dcfce7"
                    : "#fef3c7",
                color:
                  subscription?.status === "active" || subscription?.status === "trialing"
                    ? "#166534"
                    : "#92400e",
                fontWeight: 700,
              }}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg,#ffffff,#f5f3ff)",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>Plan actuel</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#4f46e5" }}>
            {currentPlanLabel}
          </div>
          <div style={{ marginTop: 12 }}>
            <span
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 999,
                background:
                  subscription?.plan === "yearly"
                    ? "#dbeafe"
                    : subscription?.plan === "monthly"
                    ? "#ede9fe"
                    : "#f3f4f6",
                color:
                  subscription?.plan === "yearly"
                    ? "#1d4ed8"
                    : subscription?.plan === "monthly"
                    ? "#6d28d9"
                    : "#374151",
                fontWeight: 700,
              }}
            >
              {subscription?.plan === "yearly"
                ? "Abonnement annuel"
                : subscription?.plan === "monthly"
                ? "Abonnement mensuel"
                : "Aucun abonnement"}
            </span>
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg,#ffffff,#ecfeff)",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>
            {subscription?.status === "trialing" ? "Fin de l’essai" : "Renouvellement"}
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#0891b2" }}>
            {formatDate(subscription?.current_period_end)}
          </div>
          <div style={{ marginTop: 10, color: "#64748b" }}>
            {subscription?.status === "trialing"
              ? "Ton essai gratuit se termine à cette date."
              : "Date actuelle de ton prochain cycle."}
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg,#ffffff,#f0fdf4)",
            border: "1px solid #e5e7eb",
            borderRadius: 18,
            padding: 22,
          }}
        >
          <div style={{ color: "#64748b" }}>Facturation</div>
          <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#15803d" }}>
            {isPremium ? "ON" : "OFF"}
          </div>
          <div style={{ marginTop: 10, color: "#64748b" }}>
            {isPremium
              ? "Tu peux créer et gérer tes factures."
              : "Un abonnement est requis pour créer des factures."}
          </div>
        </div>
      </div>
    </main>
  );
}