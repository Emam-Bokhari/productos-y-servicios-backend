import Stripe from "stripe";
import stripe from "../../../config/stripe";
import { User } from "../user/user.model";
import ApiError from "../../../errors/ApiErrors";
import config from "../../../config";

class StripeService {
  // get or create customer helper
  async getOrCreateCustomer(
    userId: string,
    email: string,
    name: string,
  ): Promise<string> {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, "User not found");
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });

    user.stripeCustomerId = customer.id;
    await user.save();
    return customer.id;
  }

  // create checkout session helper
  async createCheckoutSession(
    amount: number,
    currency: string,
    metadata: Record<string, any>,
    stripeCustomerId?: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<Stripe.Checkout.Session> {
    const platformCurrency = "USD";
    const stripeCurrency = (
      currency ||
      platformCurrency ||
      "usd"
    ).toLowerCase();
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: stripeCurrency,
            product_data: {
              name:
                metadata.type === "wallet_topup"
                  ? "Productos Y Servicios Wallet Top-up"
                  : metadata.type === "cancellation_fee"
                    ? "Productos Y Servicios Ride Cancellation Fee"
                    : metadata.type === "driver_appreciation"
                      ? "Productos Y Servicios Driver Appreciation"
                      : "Productos Y Servicios Ride Payment",
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url:
        successUrl ||
        `${config.client_url || "http://localhost:3000"}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        cancelUrl ||
        `${config.client_url || "http://localhost:3000"}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`,
    };

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
    }

    return await stripe.checkout.sessions.create(sessionParams);
  }

  // retrieve payment intent
  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  }

  // retrieve checkout session
  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return await stripe.checkout.sessions.retrieve(sessionId);
  }

  // expire checkout session
  async expireSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return await stripe.checkout.sessions.expire(sessionId);
  }

  // refund payment helper
  async refundPayment(
    paymentIntentId: string,
    amount?: number,
  ): Promise<Stripe.Refund> {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };
    if (amount !== undefined) {
      refundParams.amount = Math.round(amount * 100);
    }
    return await stripe.refunds.create(refundParams);
  }

  // create a connected account for the vendor
  async createConnectedAccount(
    email: string,
    userId: string,
  ): Promise<Stripe.Account> {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: { userId },
    });
    return account;
  }

  // generate the account onboarding link for the vendor
  async createAccountLink(
    accountId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<string> {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return accountLink.url;
  }

  // Stripe Express Dashboard login link
  async createLoginLink(accountId: string): Promise<string> {
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return loginLink.url;
  }

  // retrieve account details
  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    const account = await stripe.accounts.retrieve(accountId);
    return account;
  }
}

export default new StripeService();
