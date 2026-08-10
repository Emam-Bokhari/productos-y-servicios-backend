import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { AdvertisementController } from "./advertisement.controller";
import { AdvertisementValidation } from "./advertisement.validation";
import {
  isAdmin,
  isSeller,
  isUser,
  isAuthenticated,
} from "../../../helpers/authHelper";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";

const router = express.Router();

// ====================================================
// ADMIN ROUTES
// ====================================================

router.get("/admin/bookings", isAdmin, AdvertisementController.getAllBookings);

// ====================================================
// SELLER / USER ROUTES
// ====================================================

router.get(
  "/user-ads",
  isUser,
  validateRequest(AdvertisementValidation.getUserAdsQuerySchema),
  AdvertisementController.getUserAdvertisements,
);

router.get(
  "/verify-seller",
  isAuthenticated,
  AdvertisementController.verifySellerForPosting,
);

router.get(
  "/availability",
  isSeller,
  AdvertisementController.getSlotAvailability,
);

router.post(
  "/",
  isSeller,
  fileUploadHandler(),
  parseFileData(
    { fieldName: "bannerImage", mode: "single" },
    { fieldName: "featuredImage", mode: "single" },
  ),
  validateRequest(AdvertisementValidation.createAdvertisementSchema),
  AdvertisementController.createAdvertisement,
);

router.get(
  "/my-advertisements",
  isSeller,
  AdvertisementController.getSellerAdvertisements,
);

router.get(
  "/my-advertisements/:id",
  isSeller,
  AdvertisementController.getSellerAdvertisementDetails,
);

router.patch(
  "/my-advertisements/:id",
  isSeller,
  fileUploadHandler(),
  parseFileData(
    { fieldName: "bannerImage", mode: "single" },
    { fieldName: "featuredImage", mode: "single" },
  ),
  validateRequest(AdvertisementValidation.updateAdvertisementSchema),
  AdvertisementController.updateAdvertisement,
);

router.patch(
  "/my-advertisements/:id/cancel",
  isSeller,
  AdvertisementController.cancelAdvertisement,
);

router.get(
  "/my-advertisements/:id/booking-info",
  isSeller,
  AdvertisementController.getAdvertisementBookingInfo,
);

export const AdvertisementRoutes = router;
