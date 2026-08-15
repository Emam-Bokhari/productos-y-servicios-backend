import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { Subscription } from "./subscription.model";
import { Product } from "../product/product.model";
import { Service } from "../service/service.model";

/**
 * Validates whether the seller has an active store creation subscription
 * and checks if they have reached their package's listing limit.
 *
 * @param sellerId - The ID of the seller/user.
 * @param storeId - The ID of the seller's store.
 * @param type - Specifying whether they are trying to create a "product" or a "service" for custom error messages.
 */
export const validateStoreCreationSubscription = async (
  sellerId: string,
  storeId: string,
  type: "product" | "service",
): Promise<void> => {
  // Check active store creation subscription
  const activeSubscription = await Subscription.findOne({
    userId: sellerId,
    packageType: "store_creation",
    status: { $in: ["active", "trialing"] },
    expiresAt: { $gt: new Date() },
  }).populate("packageId");

  if (!activeSubscription) {
    throw new ApiError(
      StatusCodes.PAYMENT_REQUIRED,
      `You need an active store creation subscription to publish ${type}s.`,
    );
  }

  const packageInfo = activeSubscription.packageId as any;
  if (packageInfo && !packageInfo.isUnlimitedListings) {
    const productCount = await Product.countDocuments({ storeId });
    const serviceCount = await Service.countDocuments({ storeId });
    const currentTotal = productCount + serviceCount;

    if (currentTotal >= (packageInfo.listingLimit || 0)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `You have reached your listing limit of ${packageInfo.listingLimit} items for this store subscription.`,
      );
    }
  }
};
