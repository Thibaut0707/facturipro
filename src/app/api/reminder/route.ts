import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

function money(n?: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const invoiceId = body.invoiceId as string | undefined;

    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId manquant" }, { status: 400 });
    }

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) {
      return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
    }

    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "Impossible d’envoyer un rappel pour une facture payée." },
        { status: 400 }
      );
    }

    const clientEmail = invoice.client?.email;
    const clientName = invoice.client?.name || "Client";
    const invoiceNumber = invoice.invoice_number || "—";
    const dueDate = invoice.due_date || "—";
    const total = Number(invoice.totals?.grandTotal || 0);
    const amountPaid = Number(invoice.amount_paid || 0);
    const balance = total - amountPaid;

    if (!clientEmail) {
      return NextResponse.json(
        { error: "Aucun email client trouvé pour cette facture." },
        { status: 400 }
      );
    }

    const entrepreneurName = invoice.entrepreneur?.name || "FacturiPro";
    const paymentMethod = (() => {
      try {
        return invoice.notes ? JSON.parse(invoice.notes)?.paymentMethod : null;
      } catch {
        return null;
      }
    })();

    const paymentInstructions = (() => {
      try {
        return invoice.notes ? JSON.parse(invoice.notes)?.paymentInstructions : null;
      } catch {
        return null;
      }
    })();

    const subject = `Rappel de paiement — Facture #${invoiceNumber}`;

    const html = `
      <div style="font-family: Arial, sans-serif; color:#111; line-height:1.6;">
        <h2>Rappel de paiement</h2>
        <p>Bonjour ${clientName},</p>
        <p>
          Ceci est un rappel concernant la facture <strong>#${invoiceNumber}</strong>.
        </p>

        <div style="padding:16px; border:1px solid #e5e7eb; border-radius:12px; background:#f9fafb; margin:16px 0;">
          <p style="margin:0 0 8px 0;"><strong>Entreprise :</strong> ${entrepreneurName}</p>
          <p style="margin:0 0 8px 0;"><strong>Échéance :</strong> ${dueDate}</p>
          <p style="margin:0 0 8px 0;"><strong>Total facture :</strong> ${money(total)}</p>
          <p style="margin:0 0 8px 0;"><strong>Montant déjà payé :</strong> ${money(amountPaid)}</p>
          <p style="margin:0;"><strong>Solde restant :</strong> ${money(balance)}</p>
        </div>

        <p>
          <strong>Mode de paiement :</strong> ${paymentMethod || "—"}
        </p>

        <p>
          <strong>Instructions de paiement :</strong><br />
          ${paymentInstructions ? String(paymentInstructions).replace(/\n/g, "<br />") : "Aucune instruction fournie."}
        </p>

        <p>
          Merci de régulariser la situation dès que possible.
        </p>

        <p>
          Cordialement,<br />
          ${entrepreneurName}
        </p>
      </div>
    `;

    const { data, error: resendError } = await resend.emails.send({
      from: process.env.REMINDER_FROM_EMAIL!,
      to: [clientEmail],
      subject,
      html,
    });

    if (resendError) {
      console.error("Resend error:", resendError);
      return NextResponse.json(
        { error: resendError.message || "Erreur Resend" },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("invoices")
      .update({
        last_reminder_sent_at: new Date().toISOString(),
        reminder_count: Number(invoice.reminder_count || 0) + 1,
      })
      .eq("id", invoiceId);

    return NextResponse.json({
      success: true,
      emailId: data?.id || null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erreur rappel inconnue";

    console.error("Reminder route error:", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}