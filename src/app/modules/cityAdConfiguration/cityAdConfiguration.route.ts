import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { CityAdConfigurationController } from "./cityAdConfiguration.controller";
import { CityAdConfigurationValidation } from "./cityAdConfiguration.validation";
import {
  isAdmin,
  isAuthenticated,
  isSeller,
} from "../../../helpers/authHelper";

import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";

const router = express.Router();

const parseCityAdBody = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  if (typeof req.body.featuredPositionPricing === "string") {
    try {
      req.body.featuredPositionPricing = JSON.parse(
        req.body.featuredPositionPricing,
      );
    } catch {
      // let validation schema catch invalid format
    }
  }
  if (typeof req.body.featuredCapacity === "string") {
    const num = Number(req.body.featuredCapacity);
    if (!isNaN(num)) req.body.featuredCapacity = num;
  }
  if (typeof req.body.latitude === "string") {
    const num = Number(req.body.latitude);
    if (!isNaN(num)) req.body.latitude = num;
  }
  if (typeof req.body.longitude === "string") {
    const num = Number(req.body.longitude);
    if (!isNaN(num)) req.body.longitude = num;
  }
  if (typeof req.body.featuredEnabled === "string") {
    req.body.featuredEnabled = req.body.featuredEnabled === "true";
  }
  next();
};

// ====================================================
// ADMIN ROUTES
// ====================================================

router.post(
  "/admin",
  isAdmin,
  fileUploadHandler(),
  parseFileData({ fieldName: "defaultFeaturedImage", mode: "single" }),
  parseCityAdBody,
  validateRequest(CityAdConfigurationValidation.createCityConfigSchema),
  CityAdConfigurationController.createCityAdConfig,
);

router.get(
  "/admin",
  isAuthenticated,
  CityAdConfigurationController.getCityAdConfigs,
);

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
  fileUploadHandler(),
  parseFileData({ fieldName: "defaultFeaturedImage", mode: "single" }),
  parseCityAdBody,
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
  isAuthenticated,
  CityAdConfigurationController.getSellerActiveCities,
);

export const CityAdConfigurationRoutes = router;
