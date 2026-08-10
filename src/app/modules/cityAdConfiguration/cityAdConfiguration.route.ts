import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { CityAdConfigurationController } from "./cityAdConfiguration.controller";
import { CityAdConfigurationValidation } from "./cityAdConfiguration.validation";
import { isAdmin, isSeller } from "../../../helpers/authHelper";

const router = express.Router();

// ====================================================
// ADMIN ROUTES
// ====================================================

router.post(
  "/admin",
  isAdmin,
  validateRequest(CityAdConfigurationValidation.createCityConfigSchema),
  CityAdConfigurationController.createCityAdConfig,
);

router.get("/admin", isAdmin, CityAdConfigurationController.getCityAdConfigs);

router.get(
  "/admin/availability",
  isAdmin,
  CityAdConfigurationController.getCityWiseAvailabilitySummary,
);

router.get(
  "/admin/:id",
  isAdmin,
  CityAdConfigurationController.getSingleCityConfig,
);

router.patch(
  "/admin/:id",
  isAdmin,
  validateRequest(CityAdConfigurationValidation.updateCityConfigSchema),
  CityAdConfigurationController.updateCityAdConfig,
);

router.get(
  "/admin/:id/statistics",
  isAdmin,
  CityAdConfigurationController.getCityBookingStatistics,
);

// ====================================================
// SELLER / USER ROUTES
// ====================================================

router.get(
  "/seller/active",
  isSeller,
  CityAdConfigurationController.getSellerActiveCities,
);

export const CityAdConfigurationRoutes = router;
