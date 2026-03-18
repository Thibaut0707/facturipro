"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

type InvoiceData = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  payment_date: string | null;
  status: string;
  use_taxes: boolean;
  amount_paid?: number | null;
  client: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    postal?: string;
  };
  entrepreneur: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    postal?: string;
    logo_url?: string;
    signature_url?: string;
    tps?: string;
    tvq?: string;
  };
  items: Array<{
    article: string;
    details: string;
    qty: number;
    price: number;
  }>;
  totals: {
    subtotal?: number;
    tps?: number;
    tvq?: number;
    grandTotal?: number;
  };
  notes?: string | null;
};

type EntrepreneurProfile = {
  logo_url: string | null;
  signature_url: string | null;
};

function money(n?: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export default function InvoiceDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const paperRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [profileBranding, setProfileBranding] = useState<EntrepreneurProfile | null>(null);
  const [amountPaid, setAmountPaid] = useState(0);

  useEffect(() => {
    async function loadInvoice() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/");
        return;
      }

      const invoiceId = Array.isArray(params.id) ? params.id[0] : params.id;

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        alert("Facture introuvable");
        router.push("/invoices");
        return;
      }

      const inv = data as InvoiceData;
      setInvoice(inv);
      setAmountPaid(Number(inv.amount_paid || 0));

      const needsBrandingFallback =
        !inv.entrepreneur?.logo_url || !inv.entrepreneur?.signature_url;

      if (needsBrandingFallback) {
        const { data: prof } = await supabase
          .from("entrepreneur_profiles")
          .select("logo_url, signature_url")
          .eq("user_id", session.user.id)
          .maybeSingle();

        setProfileBranding(prof as EntrepreneurProfile | null);
      }

      setLoading(false);
    }

    loadInvoice();
  }, [params.id, router]);

  const effectiveLogoUrl = useMemo(() => {
    return invoice?.entrepreneur?.logo_url || profileBranding?.logo_url || "";
  }, [invoice, profileBranding]);

  const effectiveSignatureUrl = useMemo(() => {
    return invoice?.entrepreneur?.signature_url || profileBranding?.signature_url || "";
  }, [invoice, profileBranding]);

  const paymentData = useMemo(() => {
    try {
      return invoice?.notes ? JSON.parse(invoice.notes) : null;
    } catch {
      return null;
    }
  }, [invoice]);

  const balance = useMemo(() => {
    return (invoice?.totals?.grandTotal || 0) - (amountPaid || 0);
  }, [invoice, amountPaid]);

  async function updateInvoiceStatus(nextStatus: "unpaid" | "partial" | "paid") {
    if (!invoice?.id) return;

    try {
      setSavingStatus(true);

      const payload: {
        status: "unpaid" | "partial" | "paid";
        payment_date: string | null;
        amount_paid?: number;
      } = {
        status: nextStatus,
        payment_date: nextStatus === "paid" ? new Date().toISOString().slice(0, 10) : null,
      };

      if (nextStatus === "unpaid") {
        payload.amount_paid = 0;
      }

      if (nextStatus === "paid") {
        payload.amount_paid = Number(invoice.totals?.grandTotal || 0);
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
              status: nextStatus,
              payment_date: payload.payment_date,
              amount_paid:
                payload.amount_paid !== undefined ? payload.amount_paid : prev.amount_paid,
            }
          : prev
      );

      if (payload.amount_paid !== undefined) {
        setAmountPaid(payload.amount_paid);
      }
    } finally {
      setSavingStatus(false);
    }
  }

  async function markPartialPayment() {
    if (!invoice?.id) return;

    const paid = window.prompt("Montant déjà payé :", String(amountPaid || 0));
    if (paid === null) return;

    const value = Number(paid);

    if (Number.isNaN(value) || value < 0) {
      alert("Montant invalide.");
      return;
    }

    if (value >= Number(invoice.totals?.grandTotal || 0)) {
      await updateInvoiceStatus("paid");
      return;
    }

    try {
      setSavingStatus(true);

      const { error } = await supabase
        .from("invoices")
        .update({
          status: "partial",
          amount_paid: value,
          payment_date: null,
        })
        .eq("id", invoice.id);

      if (error) {
        alert(error.message);
        return;
      }

      setAmountPaid(value);
      setInvoice((prev) =>
        prev
          ? {
              ...prev,
              status: "partial",
              amount_paid: value,
              payment_date: null,
            }
          : prev
      );
    } finally {
      setSavingStatus(false);
    }
  }

  async function sendReminder() {
    if (!invoice?.id) return;

    try {
      setSendingReminder(true);

      const res = await fetch("/api/reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId: invoice.id,
        }),
      });

      const rawText = await res.text();
      const data = rawText ? JSON.parse(rawText) : {};

      if (!res.ok) {
        alert(data.error || "Erreur envoi rappel");
        return;
      }

      alert("Rappel envoyé au client ✅");
    } catch (error) {
      console.error("sendReminder error:", error);
      alert("Erreur envoi rappel");
    } finally {
      setSendingReminder(false);
    }
  }

  async function downloadPDF() {
    if (!paperRef.current) return;

    const canvas = await html2canvas(paperRef.current, {
      scale: 2,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    } else {
      let remainingHeight = imgHeight;
      let position = 0;

      while (remainingHeight > 0) {
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        remainingHeight -= pageHeight;
        position -= pageHeight;

        if (remainingHeight > 0) pdf.addPage();
      }
    }

    pdf.save(`facture_${invoice?.invoice_number || "detail"}.pdf`);
  }

  function statusBadge(status?: string) {
    if (status === "paid") {
      return { label: "Payée", bg: "#dcfce7", color: "#166534" };
    }
    if (status === "partial") {
      return { label: "Paiement incomplet", bg: "#fef3c7", color: "#92400e" };
    }
    return { label: "Impayée", bg: "#fee2e2", color: "#991b1b" };
  }

  if (loading) {
    return <main style={{ padding: 32, fontFamily: "Arial" }}>Chargement...</main>;
  }

  if (!invoice) return null;

  const badge = statusBadge(invoice.status);

  return (
    <main style={{ padding: 32, fontFamily: "Arial", maxWidth: 1000, margin: "0 auto" }}>
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
          <h1>Détail facture #{invoice.invoice_number}</h1>
          <p style={{ marginTop: 0 }}>Date : {invoice.invoice_date}</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/invoices")} style={{ padding: "10px 14px" }}>
            ← Mes factures
          </button>
          <button onClick={downloadPDF} style={{ padding: "10px 14px" }}>
            Télécharger PDF
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          marginBottom: 20,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "8px 12px",
            borderRadius: 999,
            background: badge.bg,
            color: badge.color,
            fontWeight: 700,
          }}
        >
          {badge.label}
        </span>

        <button
          onClick={() => updateInvoiceStatus("unpaid")}
          disabled={savingStatus}
          style={{ padding: "10px 14px" }}
        >
          Marquer impayée
        </button>

        <button
          onClick={markPartialPayment}
          disabled={savingStatus}
          style={{ padding: "10px 14px" }}
        >
          Paiement incomplet
        </button>

        <button
          onClick={() => updateInvoiceStatus("paid")}
          disabled={savingStatus}
          style={{ padding: "10px 14px" }}
        >
          Marquer payée
        </button>

        <button
          onClick={sendReminder}
          disabled={sendingReminder || invoice.status === "paid"}
          style={{ padding: "10px 14px" }}
        >
          {sendingReminder ? "Envoi..." : "Envoyer un rappel"}
        </button>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <div
        ref={paperRef}
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: 36, fontWeight: 900 }}>FACTURE</div>
            <div style={{ marginTop: 6 }}>
              <div>
                Facture n. <strong>{invoice.invoice_number}</strong>
              </div>
              <div>
                Date <strong>{invoice.invoice_date}</strong>
              </div>
            </div>
          </div>

          {effectiveLogoUrl ? (
            <img
              src={effectiveLogoUrl}
              alt="Logo"
              style={{ maxWidth: 140, maxHeight: 90, objectFit: "contain" }}
            />
          ) : null}
        </div>

        <hr style={{ border: 0, borderTop: "2px solid #111", margin: "16px 0" }} />

        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{invoice.client?.name || "—"}</div>
          <div>{invoice.client?.phone || "—"}</div>
          <div>{invoice.client?.address || "—"}</div>
          <div>{invoice.client?.email || "—"}</div>
          <div>{invoice.client?.postal || "—"}</div>
        </div>

        <hr style={{ border: 0, borderTop: "2px solid #111", margin: "16px 0" }} />

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "2px solid #111", padding: 8 }}>Article</th>
              <th style={{ textAlign: "left", borderBottom: "2px solid #111", padding: 8 }}>Description</th>
              <th style={{ textAlign: "right", borderBottom: "2px solid #111", padding: 8 }}>Qté</th>
              <th style={{ textAlign: "right", borderBottom: "2px solid #111", padding: 8 }}>Prix</th>
              <th style={{ textAlign: "right", borderBottom: "2px solid #111", padding: 8 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items?.map((it, i) => {
              const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);
              return (
                <tr key={i}>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{it.article || "—"}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{it.details || "—"}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8, textAlign: "right" }}>{it.qty}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8, textAlign: "right" }}>{money(it.price)}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8, textAlign: "right" }}>{money(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: 340, borderTop: "2px solid #111", paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>Sous-total :</span>
              <strong>{money(invoice.totals?.subtotal)}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>Taxes :</span>
              <strong>{money((invoice.totals?.tps || 0) + (invoice.totals?.tvq || 0))}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
              }}
            >
              <span>Montant payé :</span>
              <strong>{money(amountPaid)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                color: balance > 0 ? "#b91c1c" : "#166534",
                fontWeight: 700,
              }}
            >
              <span>Solde restant :</span>
              <strong>{money(balance)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 0",
                borderTop: "2px solid #111",
                fontSize: 18,
              }}
            >
              <span>Total :</span>
              <strong>{money(invoice.totals?.grandTotal)}</strong>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 26, fontWeight: 800 }}>Merci pour votre confiance !</div>

        <hr style={{ border: 0, borderTop: "2px solid #111", margin: "16px 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Informations de paiement</div>
            <div>Mode de paiement : {paymentData?.paymentMethod || "—"}</div>
            <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {paymentData?.paymentInstructions || "Aucune instruction de paiement"}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Contact Entrepreneur</div>
            <div>{invoice.entrepreneur?.name || "—"}</div>
            <div>{invoice.entrepreneur?.phone || "—"}</div>
            <div>{invoice.entrepreneur?.email || "—"}</div>
            <div>{invoice.entrepreneur?.address || "—"}</div>
            <div>{invoice.entrepreneur?.postal || "—"}</div>
          </div>
        </div>

        {effectiveSignatureUrl ? (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Signature</div>
            <img
              src={effectiveSignatureUrl}
              alt="Signature"
              style={{ maxWidth: 180, maxHeight: 80, objectFit: "contain" }}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}