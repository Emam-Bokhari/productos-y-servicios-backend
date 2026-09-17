import cron from "node-cron";
import { Subscription } from "../app/modules/subscription/subscription.model";
import { User } from "../app/modules/user/user.model";
import { Transaction } from "../app/modules/transaction/transaction.model";
import datafastService from "../app/modules/datafast/datafast.service";
import { calculateExpirationDate } from "../app/modules/datafast/datafast.controller";
import { sendNotifications } from "../helpers/notificationsHelper";
import { NOTIFICATION_TYPE } from "../app/modules/notification/notification.constant";
import { logger } from "../shared/logger";
import { invoiceService } from "../app/modules/invoice/invoice.service";
import { Advertisement } from "../app/modules/advertisement/advertisement.model";
import {
  PAYMENT_METHOD,
  TRANSACTION_TYPE,
} from "../app/modules/transaction/transaction.constant";

/**
 * Execute renewal check for all due store_creation subscriptions
 */
export const runSubscriptionRenewalCheck = async (): Promise<{
  processed: number;
  renewed: number;
  failed: number;
}> => {
  logger.info("[Subscription Cron] Starting renewal check...");
  const today = new Date();

  const dueSubscriptions = await Subscription.find({
    status: "active",
    packageType: "store_creation",
    expiresAt: { $lte: today },
  }).populate("packageId userId");

  let renewedCount = 0;
  let failedCount = 0;

  for (const sub of dueSubscriptions) {
    const pkg = sub.packageId as any;
    const user = sub.userId as any;
    const token = sub.datafastRegistrationToken;

    if (!pkg || !user) {
      logger.warn(
        `[Subscription Cron] Missing package or user for subscription ${sub._id}`,
      );
      continue;
    }

    if (!token) {
      logger.warn(
        `[Subscription Cron] No registration token found for subscription ${sub._id}. Marking expired.`,
      );
      sub.status = "expired";
      await sub.save();
      await User.findByIdAndUpdate(user._id, {
        subscriptionStatus: "inactive",
      });
      failedCount++;
      continue;
    }

    try {
      // Generate incremental transaction reference
      const count = await Transaction.countDocuments({
        transactionId: { $regex: "^INV-" },
      });
      const invoiceNumber = 1000 + count + 1;
      const invoiceTxId = `INV-${new Date().getFullYear()}-${invoiceNumber}`;

      logger.info(
        `[Subscription Cron] Processing renewal for user ${user._id}, package: ${pkg.name}, amount: $${pkg.price}`,
      );

      const result = await datafastService.executeRecurringPayment(
        token,
        pkg.price,
        sub._id.toString(),
      );

      const isSuccess = datafastService.isSuccessCode(result.result?.code);

      if (isSuccess) {
        // Calculate new expiration based on package duration
        const nextExpiration = calculateExpirationDate(
          pkg.duration,
          sub.expiresAt > today ? sub.expiresAt : today,
        );

        sub.expiresAt = nextExpiration;
        sub.amountPaid = Number(result.amount) || pkg.price;
        sub.trxId = result.id;
        sub.status = "active";
        await sub.save();

        await User.findByIdAndUpdate(user._id, {
          subscriptionStatus: "active",
          subscriptionExpiresAt: nextExpiration,
        });

        const safeInvoice = invoiceTxId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const invoiceUrl = `/uploads/invoices/${safeInvoice}.pdf`;

        // Record successful Transaction
        await Transaction.create({
          transactionId: invoiceTxId,
          userId: user._id,
          packageId: pkg._id,
          amount: Number(result.amount) || pkg.price,
          paymentMethod: PAYMENT_METHOD.DATAFAST,
          paymentStatus: "PAID",
          transactionType: TRANSACTION_TYPE.SUBSCRIPTION_RENEWAL,
          customerId: token,
          gatewayTransactionId: result.id,
          gatewayResponse: result,
          invoiceUrl,
        });

        sub.invoiceNumber = invoiceTxId;
        sub.invoiceUrl = invoiceUrl;
        await sub.save();

        invoiceService.autoGenerateInvoiceForTransaction(invoiceTxId);

        // Send renewal notification
        await sendNotifications({
          receiver: user._id.toString(),
          title: "Subscription Renewed",
          text: `Your subscription to "${pkg.name}" was successfully renewed until ${nextExpiration.toDateString()}.`,
          type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
          referenceId: sub._id,
          referenceModel: "Subscription",
        });

        renewedCount++;
        logger.info(
          `[Subscription Cron] Successfully renewed subscription ${sub._id}`,
        );
      } else {
        // Payment declined or failed
        logger.warn(
          `[Subscription Cron] Payment failed for subscription ${sub._id}: ${result.result?.description}`,
        );

        sub.status = "past_due";
        await sub.save();

        await User.findByIdAndUpdate(user._id, {
          subscriptionStatus: "past_due",
        });

        await sendNotifications({
          receiver: user._id.toString(),
          title: "Subscription Renewal Failed",
          text: `We were unable to renew your subscription to "${pkg.name}". Reason: ${result.result?.description || "Card declined"}`,
          type: NOTIFICATION_TYPE.SUBSCRIPTION_UPDATE,
          referenceId: sub._id,
          referenceModel: "Subscription",
        });

        failedCount++;
      }
    } catch (error: any) {
      logger.error(
        `[Subscription Cron] Error processing renewal for ${sub._id}:`,
        error,
      );

      sub.status = "past_due";
      await sub.save();

      await User.findByIdAndUpdate(user._id, {
        subscriptionStatus: "past_due",
      });

      failedCount++;
    }
  }

  // Expire past-due trialing subscriptions
  await Subscription.updateMany(
    {
      status: "trialing",
      expiresAt: { $lte: today },
    },
    { $set: { status: "expired" } },
  );

  // Expire past-due post_add subscriptions (legacy)
  await Subscription.updateMany(
    {
      packageType: "post_add",
      status: "active",
      expiresAt: { $lte: today },
    },
    { $set: { status: "expired" } },
  );

  // Expire past-due active advertisements
  await Advertisement.updateMany(
    {
      status: "active",
      endDate: { $lte: today },
    },
    { $set: { status: "expired" } },
  );

  logger.info(
    `[Subscription Cron] Finished renewal check. Processed: ${dueSubscriptions.length}, Renewed: ${renewedCount}, Failed: ${failedCount}`,
  );

  return {
    processed: dueSubscriptions.length,
    renewed: renewedCount,
    failed: failedCount,
  };
};

/**
 * Initialize automated daily cron job
 */
export const initSubscriptionCron = () => {
  // Run every day at 00:05 AM
  cron.schedule("5 0 * * *", async () => {
    try {
      await runSubscriptionRenewalCheck();
    } catch (err) {
      logger.error("[Subscription Cron] Error in cron execution:", err);
    }
  });

  logger.info("[Subscription Cron] Scheduled daily renewal cron at 00:05 AM");
};
