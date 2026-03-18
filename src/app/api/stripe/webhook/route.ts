import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function toIsoOrNull(timestamp?: number | null) {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString();
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  console.log("Webhook called");
  console.log("Signature exists:", !!signature);

  if (!signature) {
    return new NextResponse("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log("Webhook event type:", event.type);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Invalid webhook signature";
    console.error("Webhook signature error:", message);
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.user_id;
        const plan = (session.metadata?.plan as "monthly" | "yearly") || "monthly";
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;

        console.log("checkout.session.completed", {
          userId,
          plan,
          customerId,
          subscriptionId,
        });

        if (!userId) {
          return NextResponse.json({ received: true });
        }

        let subscriptionStatus = "inactive";
        let currentPeriodEnd: string | null = null;
        let cancelAtPeriodEnd = false;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionStatus = subscription.status;
          currentPeriodEnd = toIsoOrNull(subscription.current_period_end);
          cancelAtPeriodEnd = subscription.cancel_at_period_end;
        }

        const { error } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id:
            plan === "yearly"
              ? process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY
              : process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
          status: subscriptionStatus,
          plan,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: cancelAtPeriodEnd,
        });

        if (error) {
          console.error("Supabase upsert error:", error);
          return new NextResponse(error.message, { status: 500 });
        }

        console.log("Supabase upsert success");
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        console.log("subscription update/delete:", subscription.id, subscription.status);

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({
            status: subscription.status,
            current_period_end: toIsoOrNull(subscription.current_period_end),
            cancel_at_period_end: subscription.cancel_at_period_end,
          })
          .eq("stripe_subscription_id", subscription.id);

        if (error) {
          console.error("Supabase update error:", error);
          return new NextResponse(error.message, { status: 500 });
        }

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : null;

        console.log("invoice.payment_failed", { customerId });

        if (customerId) {
          const { error } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("Supabase invoice.payment_failed error:", error);
            return new NextResponse(error.message, { status: 500 });
          }
        }

        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : null;

        console.log("invoice.payment_succeeded", { customerId });

        if (customerId) {
          const { error } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "active" })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("Supabase invoice.payment_succeeded error:", error);
            return new NextResponse(error.message, { status: 500 });
          }
        }

        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Webhook handler failed";
    console.error("Webhook handler error:", error);
    return new NextResponse(message, { status: 500 });
  }
}