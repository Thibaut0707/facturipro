"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

type InvoiceItem = {
  title?: string;
  description?: string;
  quantity?: number;
  price?: number;
  total?: number;
};

type PartyInfo = {
  business_name?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  postal?: string;
  logo_url?: string;
  signature_url?: string;
  payment_methods?: string[];
};

type Totals = {
  subtotal?: number;
  tps?: number;
  tvq?: number;
  grandTotal?: number;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  payment_date?: string | null;
  status: "paid" | "unpaid" | "partial";
  amount_paid?: number | null;
  notes?: string | null;
  pdf_url?: string | null;
  client?: PartyInfo | null;
  entrepreneur?: PartyInfo | null;
  items?: InvoiceItem[] | null;
  totals?: Totals | null;
};

function money(n?: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [amountPaidInput, setAmountPaidInput] = useState("");

  useEffect(() => {
    async function loadInvoice() {
      if (!id) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/");
        return;
      }

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        alert("Facture introuvable.");
        router.push("/invoices");
        return;
      }

      const normalized = data as InvoiceRow;
      setInvoice(normalized);
      setAmountPaidInput(String(Number(normalized.amount_paid || 0)));
      setLoading(false);
    }

    loadInvoice();
  }, [id, router]);

  const subtotal = Number(invoice?.totals?.subtotal || 0);
  const tps = Number(invoice?.totals?.tps || 0);
  const tvq = Number(invoice?.totals?.tvq || 0);
  const grandTotal = Number(invoice?.totals?.grandTotal || 0);
  const amountPaid = Number(invoice?.amount_paid || 0);
  const remainingBalance = Math.max(0, grandTotal - amountPaid);

  const paymentMethodsText = useMemo(() => {
    const methods = safeArray(invoice?.entrepreneur?.payment_methods);
    if (!methods.length) {
      return "À convenir avec l’entrepreneur";
    }
    return methods.join(" • ");
  }, [invoice]);

  async function updateInvoiceStatus(
    nextStatus: "paid" | "unpaid" | "partial",
    nextAmountPaid?: number
  ) {
    if (!invoice) return;

    try {
      setSavingStatus(true);

      const payload: {
        status: "paid" | "unpaid" | "partial";
        amount_paid?: number;
        payment_date?: string | null;
      } = {
        status: nextStatus,
      };

      if (typeof nextAmountPaid === "number") {
        payload.amount_paid = nextAmountPaid;
      }

      if (nextStatus === "paid") {
        payload.payment_date = new Date().toISOString().slice(0, 10);
        payload.amount_paid = grandTotal;
      }

      if (nextStatus === "unpaid") {
        payload.payment_date = null;
        payload.amount_paid = 0;
      }

      if (nextStatus === "partial") {
        payload.payment_date = null;
      }

      const { error } = await supabase
        .from("invoices")
        .update(payload)
        .eq("id", invoice.id);

      if (error) {
        alert(error.message);
        return;
      }

      setInvoice((prev) =>
        prev
          ? {
              ...prev,
              status: payload.status,
              amount_paid:
                typeof payload.amount_paid === "number"
                  ? payload.amount_paid
                  : prev.amount_paid,
              payment_date:
                payload.payment_date !== undefined
                  ? payload.payment_date
                  : prev.payment_date,
            }
          : prev
      );

      if (payload.amount_paid !== undefined) {
        setAmountPaidInput(String(payload.amount_paid));
      }
    } finally {
      setSavingStatus(false);
    }
  }

  async function markPartialPayment() {
    if (!invoice) return;

    const parsed = Number(amountPaidInput);

    if (Number.isNaN(parsed) || parsed < 0) {
      alert("Entre un montant payé valide.");
      return;
    }

    if (parsed >= grandTotal) {
      await updateInvoiceStatus("paid", grandTotal);
      return;
    }

    await updateInvoiceStatus("partial", parsed);
  }

  function downloadPdf() {
    if (invoice?.pdf_url) {
      window.open(invoice.pdf_url, "_blank");
      return;
    }

    window.print();
  }

  if (loading) {
    return <main style={{ padding: 32, fontFamily: "Arial" }}>Chargement...</main>;
  }

  if (!invoice) {
    return <main style={{ padding: 32, fontFamily: "Arial" }}>Facture introuvable.</main>;
  }

  const items = safeArray(invoice.items);

  return (
    <main
      style={{
        padding: 32,
        fontFamily: "Arial, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 8 }}>Détail facture #{invoice.invoice_number}</h1>
          <div style={{ color: "#555" }}>Date : {invoice.invoice_date}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/invoices")}
            style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
          >
            ← Mes factures
          </button>

          <button
            onClick={downloadPdf}
            style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
          >
            Télécharger PDF
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <span
          style={{
            display: "inline-block",
            padding: "8px 12px",
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

        <button
          onClick={() => updateInvoiceStatus("unpaid")}
          disabled={savingStatus}
          style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
        >
          Marquer impayée
        </button>

        <button
          onClick={markPartialPayment}
          disabled={savingStatus}
          style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
        >
          Paiement incomplet
        </button>

        <button
          onClick={() => updateInvoiceStatus("paid")}
          disabled={savingStatus}
          style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer" }}
        >
          Marquer payée
        </button>
      </div>

      <div
        style={{
          marginBottom: 20,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <label style={{ fontWeight: 700 }}>Montant payé :</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountPaidInput}
          onChange={(e) => setAmountPaidInput(e.target.value)}
          style={{ padding: 10, width: 180 }}
        />
        <div style={{ color: "#555" }}>
          Solde restant : <strong>{money(remainingBalance)}</strong>
        </div>
      </div>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "#fff",
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            alignItems: "flex-start",
            borderBottom: "2px solid #222",
            paddingBottom: 18,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>FACTURE</div>
            <div style={{ marginTop: 10, fontSize: 26 }}>
              Facture n. <strong>{invoice.invoice_number}</strong>
            </div>
            <div style={{ fontSize: 26 }}>
              Date <strong>{invoice.invoice_date}</strong>
            </div>
          </div>

          {invoice.entrepreneur?.logo_url ? (
            <img
              src={invoice.entrepreneur.logo_url}
              alt="Logo"
              style={{
                width: 140,
                maxHeight: 100,
                objectFit: "contain",
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 24,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 10 }}>
              {invoice.client?.name || "Client"}
            </div>
            {invoice.client?.phone ? <div>{invoice.client.phone}</div> : null}
            {invoice.client?.address ? <div>{invoice.client.address}</div> : null}
            {invoice.client?.email ? <div>{invoice.client.email}</div> : null}
            {invoice.client?.postal ? <div>{invoice.client.postal}</div> : null}
          </div>
        </div>

        <div style={{ borderTop: "2px solid #222", paddingTop: 20, marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: "10px 8px" }}>Article</th>
                <th style={{ padding: "10px 8px" }}>Description</th>
                <th style={{ padding: "10px 8px" }}>Qté</th>
                <th style={{ padding: "10px 8px" }}>Prix</th>
                <th style={{ padding: "10px 8px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "10px 8px" }}>{item.title || ""}</td>
                  <td style={{ padding: "10px 8px" }}>{item.description || ""}</td>
                  <td style={{ padding: "10px 8px" }}>{item.quantity || 0}</td>
                  <td style={{ padding: "10px 8px" }}>{money(item.price)}</td>
                  <td style={{ padding: "10px 8px" }}>{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 30,
          }}
        >
          <div style={{ width: 360 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
              }}
            >
              <span>Sous-total :</span>
              <strong>{money(subtotal)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
              }}
            >
              <span>Impôts :</span>
              <strong>{money(tps + tvq)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
              }}
            >
              <span>Montant payé :</span>
              <strong>{money(amountPaid)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderTop: "2px solid #222",
                marginTop: 8,
              }}
            >
              <span>Solde restant :</span>
              <strong>{money(remainingBalance)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 0 0",
                fontSize: 30,
              }}
            >
              <span>Total :</span>
              <strong>{money(grandTotal)}</strong>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20, fontSize: 20, fontWeight: 800 }}>
          Merci pour votre confiance !
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 30,
            borderTop: "2px solid #222",
            paddingTop: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
              Informations de paiement
            </div>
            <div>{paymentMethodsText}</div>
            {invoice.notes ? <div style={{ marginTop: 12 }}>{invoice.notes}</div> : null}
          </div>

          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>
              Contact Entrepreneur
            </div>
            <div>{invoice.entrepreneur?.business_name || invoice.entrepreneur?.name || ""}</div>
            {invoice.entrepreneur?.phone ? <div>{invoice.entrepreneur.phone}</div> : null}
            {invoice.entrepreneur?.email ? <div>{invoice.entrepreneur.email}</div> : null}
            {invoice.entrepreneur?.address ? <div>{invoice.entrepreneur.address}</div> : null}
            {invoice.entrepreneur?.postal ? <div>{invoice.entrepreneur.postal}</div> : null}
          </div>
        </div>
      </div>
    </main>
  );
}