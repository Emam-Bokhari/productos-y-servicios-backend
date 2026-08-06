import { logger } from "../../shared/logger";

/**
 * Stub handler for Stripe Webhook events.
 */
export const handleStripeWebhook = async (event: any): Promise<void> => {
  logger.info(`Stripe webhook event received in helper: ${event.type}`);
};
