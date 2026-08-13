import express from "express";
import { isAdmin, isAuthenticated } from "../../../helpers/authHelper";
import validateRequest from "../../middlewares/validateRequest";
import { SubscriptionPackageController } from "./subscriptionPackage.controller";
import { SubscriptionPackageValidation } from "./subscriptionPackage.validation";

const router = express.Router();

// Public / Authenticated read routes
router.get("/", isAuthenticated, SubscriptionPackageController.getAllPackages);
router.get(
  "/:id",
  isAuthenticated,
  SubscriptionPackageController.getSinglePackage,
);

// Admin-only management routes
router.post(
  "/",
  isAdmin,
  validateRequest(
    SubscriptionPackageValidation.createSubscriptionPackageSchema,
  ),
  SubscriptionPackageController.createPackage,
);

router.patch(
  "/:id",
  isAdmin,
  validateRequest(
    SubscriptionPackageValidation.updateSubscriptionPackageSchema,
  ),
  SubscriptionPackageController.updatePackage,
);

router.delete("/:id", isAdmin, SubscriptionPackageController.deletePackage);

router.patch(
  "/:id/status",
  isAdmin,
  validateRequest(
    SubscriptionPackageValidation.toggleSubscriptionPackageStatusSchema,
  ),
  SubscriptionPackageController.updatePackageStatus,
);

export const SubscriptionPackageRoutes = router;
