"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  payment_date: string | null;
  status: string;
  amount_paid?: number | null;
  client: {
    name?: string;
    email?: string;
  } | null;
  totals: {
    subtotal?: number;
    tps?: number;
    tvq?: number;
    grandTotal?: number;
  } | null;
};

function money(n?: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function csvEscape(value: unknown) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

export default function InvoicesPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadInvoices() {
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
        .select(
          "id, invoice_number, invoice_date, due_date, payment_date, status, amount_paid, totals, client"
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      setInvoices((data || []) as InvoiceRow[]);
      setLoading(false);
    }

    loadInvoices();
  }, [router]);

  async function handleDeleteInvoice(id: string) {
    const ok = window.confirm("Supprimer cette facture ?");
    if (!ok) return;

    try {
      setDeletingId(id);

      const { error } = await supabase.from("invoices").delete().eq("id", id);

      if (error) {
        alert(error.message);
        return;
      }

      setInvoices((prev) => prev.filter((invoice) => invoice.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  function exportComptableCsv(rows: InvoiceRow[]) {
    const headers = [
      "Numero facture",
      "Date facture",
      "Date echeance",
      "Date paiement",
      "Client",
      "Email client",
      "Statut",
      "Sous-total",
      "TPS",
      "TVQ",
      "Total facture",
      "Montant paye",
      "Solde restant",
    ];

    const csvRows = rows.map((invoice) => {
      const subtotal = Number(invoice.totals?.subtotal || 0);
      const tps = Number(invoice.totals?.tps || 0);
      const tvq = Number(invoice.totals?.tvq || 0);
      const total = Number(invoice.totals?.grandTotal || 0);
      const amountPaid = Number(invoice.amount_paid || 0);
      const balance = total - amountPaid;

      let statut = "Impayée";
      if (invoice.status === "paid") statut = "Payée";
      if (invoice.status === "partial") statut = "Paiement incomplet";

      return [
        invoice.invoice_number,
        invoice.invoice_date || "",
        invoice.due_date || "",
        invoice.payment_date || "",
        invoice.client?.name || "",
        invoice.client?.email || "",
        statut,
        subtotal.toFixed(2),
        tps.toFixed(2),
        tvq.toFixed(2),
        total.toFixed(2),
        amountPaid.toFixed(2),
        balance.toFixed(2),
      ];
    });

    const csv = [
      headers.map(csvEscape).join(";"),
      ...csvRows.map((row) => row.map(csvEscape).join(";")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "export_comptable_facturipro.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesSearch =
        !q ||
        invoice.invoice_number?.toLowerCase().includes(q) ||
        invoice.client?.name?.toLowerCase().includes(q) ||
        invoice.client?.email?.toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "all" || (invoice.status || "unpaid") === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  if (loading) {
    return <main style={{ padding: 32, fontFamily: "Arial" }}>Chargement...</main>;
  }

  return (
    <main style={{ padding: 32, fontFamily: "Arial", maxWidth: 1150, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>Mes factures</h1>
          <p style={{ marginTop: 0 }}>{session?.user?.email}</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")} style={{ padding: "10px 14px" }}>
            ← Dashboard
          </button>

          <button onClick={() => router.push("/invoices/new")} style={{ padding: "10px 14px" }}>
            Nouvelle facture
          </button>

          <button
            onClick={() => exportComptableCsv(filteredInvoices)}
            style={{ padding: "10px 14px" }}
          >
            Export comptable CSV
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          marginBottom: 20,
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 12,
        }}
      >
        <input
          type="text"
          placeholder="Rechercher par numéro, client ou email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #d1d5db",
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "#fff",
          }}
        >
          <option value="all">Tous les statuts</option>
          <option value="unpaid">Impayée</option>
          <option value="partial">Paiement incomplet</option>
          <option value="paid">Payée</option>
        </select>
      </div>

      {filteredInvoices.length === 0 ? (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 20,
            background: "#fff",
          }}
        >
          Aucune facture trouvée.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: 12, borderBottom: "1px solid #ddd" }}>N° facture</th>
                <th style={{ padding: 12, borderBottom: "1px solid #ddd" }}>Client</th>
                <th style={{ padding: 12, borderBottom: "1px solid #ddd" }}>Date</th>
                <th style={{ padding: 12, borderBottom: "1px solid #ddd" }}>Échéance</th>
                <th style={{ padding: 12, borderBottom: "1px solid #ddd" }}>Statut</th>
                <th style={{ padding: 12, borderBottom: "1px solid #ddd" }}>Total</th>
                <th style={{ padding: 12, borderBottom: "1px solid #ddd" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    {invoice.invoice_number}
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    <div>{invoice.client?.name || "—"}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {invoice.client?.email || ""}
                    </div>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    {invoice.invoice_date}
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    {invoice.due_date || "—"}
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 10px",
                        borderRadius: 999,
                        background:
                          invoice.status === "paid"
                            ? "#dcfce7"
                            : invoice.status === "partial"
                            ? "#fef3c7"
                            : "#fee2e2",
                        color:
                          invoice.status === "paid"
                            ? "#166534"
                            : invoice.status === "partial"
                            ? "#92400e"
                            : "#991b1b",
                        fontWeight: 700,
                      }}
                    >
                      {invoice.status === "paid"
                        ? "Payée"
                        : invoice.status === "partial"
                        ? "Paiement incomplet"
                        : "Impayée"}
                    </span>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    {money(invoice.totals?.grandTotal)}
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => router.push(`/invoices/${invoice.id}`)}
                        style={{ padding: "8px 12px" }}
                      >
                        Voir
                      </button>

                      <button
                        onClick={() => handleDeleteInvoice(invoice.id)}
                        disabled={deletingId === invoice.id}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ef4444",
                          background: "#fff",
                          color: "#ef4444",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        {deletingId === invoice.id ? "Suppression..." : "Supprimer"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}