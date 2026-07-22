import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripe) stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
  return stripe;
}

export function getAppBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3005";
}
