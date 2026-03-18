import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = body.userId as string;
    const plan = body.plan as "monthly" | "yearly";

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!plan || !["monthly", "yearly"].includes(plan)) {
      return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
    }

    const priceId =
      plan === "yearly"
        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY
        : process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return NextResponse.json(
        { error: "Price ID manquant dans .env.local" },
        { status: 500 }
      );
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        user_id: userId,
        plan,
      },
      ...(plan === "monthly"
        ? {
            subscription_data: {
              trial_period_days: 7,
            },
          }
        : {}),
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/invoices/new?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?canceled=true`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: unknown) {
    console.error("Stripe checkout error:", error);

    const message =
      error instanceof Error ? error.message : "Checkout failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}