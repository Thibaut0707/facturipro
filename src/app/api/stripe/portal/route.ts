import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userId = body.userId as string | undefined;

    console.log("portal body:", body);

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (subError) {
      console.error("portal subscription error:", subError);
      return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: "Aucun client Stripe trouvé pour cet utilisateur." },
        { status: 400 }
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: unknown) {
    console.error("portal route fatal error:", error);

    const message =
      error instanceof Error ? error.message : "Erreur ouverture portail";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}