"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type Invoice = {
  id: string;
  invoice_number: string;
  client_name: string;
  total: number;
  created_at: string;
};

function DashboardPageContent() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/");
        return;
      }

      setSession(session);

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
      } else {
        setInvoices(data || []);
      }

      setLoading(false);
    }

    loadDashboard();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        router.push("/");
      } else {
        setSession(nextSession);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "Arial",
        }}
      >
        Chargement...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: 32,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 40,
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 42,
                fontWeight: 900,
                color: "#111827",
              }}
            >
              Dashboard
            </h1>

            <p
              style={{
                marginTop: 10,
                color: "#64748b",
                fontSize: 16,
              }}
            >
              Bienvenue {session?.user?.email}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => router.push("/invoices/new")}
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg,#7c3aed,#2563eb)",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Nouvelle facture
            </button>

            <button
              onClick={handleLogout}
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                border: "1px solid #dbe4f0",
                background: "white",
                color: "#111827",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 20,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
            }}
          >
            <p
              style={{
                color: "#64748b",
                marginBottom: 8,
              }}
            >
              Total Factures
            </p>

            <h2
              style={{
                margin: 0,
                fontSize: 42,
              }}
            >
              {invoices.length}
            </h2>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
            }}
          >
            <p
              style={{
                color: "#64748b",
                marginBottom: 8,
              }}
            >
              Revenus Totaux
            </p>

            <h2
              style={{
                margin: 0,
                fontSize: 42,
              }}
            >
              $
              {invoices
                .reduce((acc, inv) => acc + Number(inv.total || 0), 0)
                .toFixed(2)}
            </h2>
          </div>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 24,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 28,
              }}
            >
              Factures récentes
            </h2>
          </div>

          {invoices.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "#64748b",
              }}
            >
              Aucune facture pour le moment.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <th style={{ padding: 14 }}>Numéro</th>
                  <th style={{ padding: 14 }}>Client</th>
                  <th style={{ padding: 14 }}>Montant</th>
                  <th style={{ padding: 14 }}>Date</th>
                </tr>
              </thead>

              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                    }}
                  >
                    <td style={{ padding: 14 }}>
                      #{invoice.invoice_number}
                    </td>

                    <td style={{ padding: 14 }}>
                      {invoice.client_name || "Client"}
                    </td>

                    <td style={{ padding: 14 }}>
                      ${Number(invoice.total || 0).toFixed(2)}
                    </td>

                    <td style={{ padding: 14 }}>
                      {new Date(invoice.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 32, fontFamily: "Arial" }}>
          Chargement...
        </main>
      }
    >
      <DashboardPageContent />
    </Suspense>
  );
}