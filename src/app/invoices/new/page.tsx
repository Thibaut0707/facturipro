"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

type Item = {
  article: string;
  details: string;
  qty: number;
  price: number;
};

type Party = {
  name: string;
  phone: string;
  email: string;
  address: string;
  postal: string;
};

type SubscriptionRow = {
  status: string;
  plan: string;
};

type EntrepreneurProfile = {
  business_name: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  postal: string;
  logo_url: string;
  signature_url: string;
  tps: string;
  tvq: string;
};

type PaymentMethod =
  | "Chèque"
  | "Cash"
  | "E-transfer"
  | "Carte"
  | "Virement bancaire";

function money(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function todayFrCA() {
  return new Date().toLocaleDateString("fr-CA");
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function padInvoice(n: number) {
  return String(n).padStart(4, "0");
}

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paperRef = useRef<HTMLDivElement | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [loadingAccess, setLoadingAccess] = useState(true);

  const [entrepreneur, setEntrepreneur] = useState<Party>({
    name: "",
    phone: "",
    email: "",
    address: "",
    postal: "",
  });

  const [branding, setBranding] = useState<{
    logo_url: string;
    signature_url: string;
    tps: string;
    tvq: string;
  }>({
    logo_url: "",
    signature_url: "",
    tps: "",
    tvq: "",
  });

  const [client, setClient] = useState<Party>({
    name: "",
    phone: "",
    email: "",
    address: "",
    postal: "",
  });

  const [invoiceNumber, setInvoiceNumber] = useState("0001");
  const [invoiceDate, setInvoiceDate] = useState(todayFrCA());
  const [dueDate, setDueDate] = useState(addDays(todayFrCA(), 15));
  const [useTaxes, setUseTaxes] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("E-transfer");
  const [paymentInstructions, setPaymentInstructions] = useState("");

  const [items, setItems] = useState<Item[]>([
    { article: "Main d'œuvre", details: "Travaux (heures x taux)", qty: 1, price: 0 },
    { article: "Matériaux", details: "Liste des matériaux principaux", qty: 1, price: 0 },
  ]);

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (acc, it) => acc + (Number(it.qty) || 0) * (Number(it.price) || 0),
      0
    );
    const tps = useTaxes ? subtotal * 0.05 : 0;
    const tvq = useTaxes ? subtotal * 0.09975 : 0;
    const grandTotal = subtotal + tps + tvq;
    return { subtotal, tps, tvq, grandTotal };
  }, [items, useTaxes]);

  useEffect(() => {
    async function loadPage() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        alert("Connecte-toi d'abord.");
        router.push("/");
        return;
      }

      setSession(session);

      const justReturnedFromStripe = searchParams.get("success") === "true";

      let sub: SubscriptionRow | null = null;

      if (justReturnedFromStripe) {
        for (let i = 0; i < 8; i++) {
          const { data } = await supabase
            .from("subscriptions")
            .select("status, plan")
            .eq("user_id", session.user.id)
            .maybeSingle();

          sub = data;

          const isPremium =
            (sub?.status === "active" || sub?.status === "trialing") &&
            (sub?.plan === "monthly" || sub?.plan === "yearly");

          if (isPremium) break;

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } else {
        const { data } = await supabase
          .from("subscriptions")
          .select("status, plan")
          .eq("user_id", session.user.id)
          .maybeSingle();

        sub = data;
      }

      const isPremium =
        (sub?.status === "active" || sub?.status === "trialing") &&
        (sub?.plan === "monthly" || sub?.plan === "yearly");

      if (!isPremium) {
        alert("Tu dois avoir un abonnement actif pour accéder à cette page.");
        router.push("/dashboard");
        return;
      }

      const { data: prof } = await supabase
        .from("entrepreneur_profiles")
        .select(
          "business_name, name, phone, email, address, postal, logo_url, signature_url, tps, tvq"
        )
        .eq("user_id", session.user.id)
        .maybeSingle<EntrepreneurProfile>();

      setEntrepreneur({
        name: (prof?.business_name || prof?.name || "") as string,
        phone: (prof?.phone || "") as string,
        email: (prof?.email || session.user.email || "") as string,
        address: (prof?.address || "") as string,
        postal: (prof?.postal || "") as string,
      });

      setBranding({
        logo_url: prof?.logo_url || "",
        signature_url: prof?.signature_url || "",
        tps: prof?.tps || "",
        tvq: prof?.tvq || "",
      });

      const { data: nextNum, error: numErr } = await supabase.rpc("next_invoice_number");

      if (numErr) {
        console.error(numErr.message);
        setInvoiceNumber("0001");
      } else {
        setInvoiceNumber(padInvoice(Number(nextNum)));
      }

      setLoadingAccess(false);
    }

    loadPage();
  }, [router, searchParams]);

  useEffect(() => {
    setDueDate(addDays(invoiceDate, 15));
  }, [invoiceDate]);

  function updateItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function addRow() {
    setItems((prev) => [...prev, { article: "", details: "", qty: 1, price: 0 }]);
  }

  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
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

    pdf.save(`facture_${invoiceNumber}.pdf`);
  }

  async function saveInvoice() {
    if (!session?.user?.id) return;

    const payload = {
      user_id: session.user.id,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      payment_date: null,
      currency: "CAD",
      status: "unpaid",
      amount_paid: 0,
      use_taxes: useTaxes,
      client,
      entrepreneur: {
        name: entrepreneur.name,
        phone: entrepreneur.phone,
        email: entrepreneur.email,
        address: entrepreneur.address,
        postal: entrepreneur.postal,
        logo_url: branding.logo_url || "",
        signature_url: branding.signature_url || "",
        tps: branding.tps || "",
        tvq: branding.tvq || "",
      },
      items,
      totals,
      notes: JSON.stringify({
        paymentMethod,
        paymentInstructions,
      }),
    };

    const { data, error } = await supabase
      .from("invoices")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    alert("Facture sauvegardée ✅");
    router.push(`/invoices/${data.id}`);
  }

  if (loadingAccess) {
    return <main style={{ padding: 32, fontFamily: "Arial" }}>Chargement...</main>;
  }

  return (
    <main style={{ padding: 32, fontFamily: "Arial", maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Nouvelle facture</h1>
          <p style={{ marginTop: 0 }}>
            N° {invoiceNumber} — Date {invoiceDate}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => router.push("/dashboard")} style={{ padding: "10px 14px" }}>
            ← Dashboard
          </button>
          <button onClick={saveInvoice} style={{ padding: "10px 14px" }}>
            Sauvegarder
          </button>
          <button onClick={downloadPDF} style={{ padding: "10px 14px" }}>
            Télécharger PDF
          </button>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
          <h3>Entrepreneur</h3>
          <input
            placeholder="Nom"
            value={entrepreneur.name}
            onChange={(e) => setEntrepreneur({ ...entrepreneur, name: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Téléphone"
            value={entrepreneur.phone}
            onChange={(e) => setEntrepreneur({ ...entrepreneur, phone: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Email"
            value={entrepreneur.email}
            onChange={(e) => setEntrepreneur({ ...entrepreneur, email: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Adresse"
            value={entrepreneur.address}
            onChange={(e) => setEntrepreneur({ ...entrepreneur, address: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Code postal"
            value={entrepreneur.postal}
            onChange={(e) => setEntrepreneur({ ...entrepreneur, postal: e.target.value })}
            style={{ width: "100%", padding: 10 }}
          />
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
          <h3>Client</h3>
          <input
            placeholder="Nom"
            value={client.name}
            onChange={(e) => setClient({ ...client, name: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Téléphone"
            value={client.phone}
            onChange={(e) => setClient({ ...client, phone: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Email"
            value={client.email}
            onChange={(e) => setClient({ ...client, email: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Adresse"
            value={client.address}
            onChange={(e) => setClient({ ...client, address: e.target.value })}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <input
            placeholder="Code postal"
            value={client.postal}
            onChange={(e) => setClient({ ...client, postal: e.target.value })}
            style={{ width: "100%", padding: 10 }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={useTaxes}
            onChange={(e) => setUseTaxes(e.target.checked)}
          />
          TPS/TVQ (QC)
        </label>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Date facture</span>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Date d’échéance</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          border: "1px solid #eee",
          borderRadius: 10,
          padding: 12,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Informations de paiement</h3>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {["Chèque", "Cash", "E-transfer", "Carte", "Virement bancaire"].map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method as PaymentMethod)}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: paymentMethod === method ? "2px solid #111" : "1px solid #ccc",
                background: paymentMethod === method ? "#111" : "#fff",
                color: paymentMethod === method ? "#fff" : "#111",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {method}
            </button>
          ))}
        </div>

        <textarea
          placeholder="Instructions de paiement"
          value={paymentInstructions}
          onChange={(e) => setPaymentInstructions(e.target.value)}
          style={{
            width: "100%",
            minHeight: 90,
            padding: 12,
            borderRadius: 8,
            border: "1px solid #ccc",
            resize: "vertical",
          }}
        />
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h2>Articles</h2>
      <button onClick={addRow} style={{ padding: "8px 12px", marginBottom: 10 }}>
        + Ajouter une ligne
      </button>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={{ borderBottom: "1px solid #ddd", padding: 10 }}>Article</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: 10 }}>Description</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: 10 }}>Qté</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: 10 }}>Prix</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: 10 }}>Total</th>
              <th style={{ borderBottom: "1px solid #ddd", padding: 10 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);

              return (
                <tr key={i}>
                  <td style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                    <input
                      value={it.article}
                      onChange={(e) => updateItem(i, { article: e.target.value })}
                      style={{ width: "100%", padding: 8 }}
                    />
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                    <input
                      value={it.details}
                      onChange={(e) => updateItem(i, { details: e.target.value })}
                      style={{ width: "100%", padding: 8 }}
                    />
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                    <input
                      type="number"
                      min={0}
                      value={it.qty}
                      onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                      style={{ width: 90, padding: 8 }}
                    />
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.price}
                      onChange={(e) => updateItem(i, { price: Number(e.target.value) })}
                      style={{ width: 120, padding: 8 }}
                    />
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                    {money(lineTotal)}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                    <button onClick={() => removeRow(i)} style={{ padding: "6px 10px" }}>
                      Suppr.
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 16,
          maxWidth: 360,
          marginLeft: "auto",
          borderTop: "2px solid #111",
          paddingTop: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <span>Sous-total</span>
          <strong>{money(totals.subtotal)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <span>TPS</span>
          <strong>{money(totals.tps)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
          <span>TVQ</span>
          <strong>{money(totals.tvq)}</strong>
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
          <span>Total</span>
          <strong>{money(totals.grandTotal)}</strong>
        </div>
      </div>

      <hr style={{ margin: "22px 0" }} />

      <h2>Aperçu (PDF)</h2>
      <div
        ref={paperRef}
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 22,
          maxWidth: 900,
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
                Facture n. <strong>{invoiceNumber}</strong>
              </div>
              <div>
                Date <strong>{invoiceDate}</strong>
              </div>
              <div>
                Échéance <strong>{dueDate}</strong>
              </div>
            </div>
          </div>

          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt="Logo entreprise"
              style={{
                maxWidth: 140,
                maxHeight: 90,
                objectFit: "contain",
              }}
            />
          ) : null}
        </div>

        <hr style={{ border: 0, borderTop: "2px solid #111", margin: "16px 0" }} />

        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{client.name || "—"}</div>
          <div>{client.phone || "—"}</div>
          <div>{client.address || "—"}</div>
          <div>{client.email || "—"}</div>
          <div>{client.postal || "—"}</div>
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
            {items.map((it, i) => {
              const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);

              if (!it.article && !it.details && !it.qty && !it.price) return null;

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
          <div style={{ width: 320, borderTop: "2px solid #111", paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>Sous-total :</span>
              <strong>{money(totals.subtotal)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>TPS :</span>
              <strong>{money(totals.tps)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>TVQ :</span>
              <strong>{money(totals.tvq)}</strong>
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
              <strong>{money(totals.grandTotal)}</strong>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 26, fontWeight: 800 }}>Merci pour votre confiance !</div>

        <hr style={{ border: 0, borderTop: "2px solid #111", margin: "16px 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Informations de paiement</div>
            <div>Mode de paiement : {paymentMethod}</div>
            <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {paymentInstructions || "Aucune instruction de paiement"}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Contact Entrepreneur</div>
            <div>{entrepreneur.name || "—"}</div>
            <div>{entrepreneur.phone || "—"}</div>
            <div>{entrepreneur.email || "—"}</div>
            <div>{entrepreneur.address || "—"}</div>
            <div>{entrepreneur.postal || "—"}</div>
          </div>
        </div>

        {branding.signature_url ? (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Signature</div>
            <img
              src={branding.signature_url}
              alt="Signature"
              style={{
                maxWidth: 180,
                maxHeight: 80,
                objectFit: "contain",
              }}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}