import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export async function GET() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const { data: invoices, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .in("status", ["unpaid", "partial"])
      .not("due_date", "is", null)
      .lte("due_date", todayStr);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let scanned = 0;
    let sent = 0;
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const invoice of invoices || []) {
      scanned++;

      const dueDate = new Date(invoice.due_date);
      const overdueDays = daysBetween(dueDate, today);

      const lastReminder = invoice.last_reminder_sent_at
        ? new Date(invoice.last_reminder_sent_at)
        : null;

      const daysSinceLastReminder = lastReminder
        ? daysBetween(lastReminder, today)
        : null;

      const hasClientEmail = !!invoice.client?.email;

      if (!hasClientEmail) {
        skipped.push({ id: invoice.id, reason: "client email missing" });
        continue;
      }

      // stratégie simple :
      // 1er rappel : dès que la facture est en retard
      // rappels suivants : tous les 7 jours max, jusqu'à 3 rappels
      const reminderCount = Number(invoice.reminder_count || 0);

      if (reminderCount >= 3) {
        skipped.push({ id: invoice.id, reason: "max reminders reached" });
        continue;
      }

      if (reminderCount === 0 && overdueDays < 0) {
        skipped.push({ id: invoice.id, reason: "not overdue yet" });
        continue;
      }

      if (reminderCount > 0 && daysSinceLastReminder !== null && daysSinceLastReminder < 7) {
        skipped.push({ id: invoice.id, reason: "recently reminded" });
        continue;
      }

      // Simulation d'envoi email
      console.log("AUTO REMINDER");
      console.log("Invoice ID:", invoice.id);
      console.log("Invoice number:", invoice.invoice_number);
      console.log("Client:", invoice.client?.name || "");
      console.log("Client email:", invoice.client?.email || "");
      console.log("Status:", invoice.status);
      console.log("Due date:", invoice.due_date);
      console.log("Reminder count:", reminderCount + 1);
      console.log("Total:", invoice.totals?.grandTotal);
      console.log("Amount paid:", invoice.amount_paid || 0);

      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update({
          last_reminder_sent_at: new Date().toISOString(),
          reminder_count: reminderCount + 1,
        })
        .eq("id", invoice.id);

      if (updateError) {
        skipped.push({ id: invoice.id, reason: updateError.message });
        continue;
      }

      sent++;
    }

    return NextResponse.json({
      success: true,
      scanned,
      sent,
      skipped,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Auto reminder failed";

    console.error("AUTO REMINDER ERROR:", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}