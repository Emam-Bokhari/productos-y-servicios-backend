import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { StoreController } from "./store.controller";
import { StoreValidation } from "./store.validation";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { isAdmin, isAuthenticated, isSeller } from "../../../helpers/authHelper";

const router = express.Router();

router.post(
  "/",
  isAuthenticated,
  fileUploadHandler(),
  parseFileData(
    {
      fieldName: "logo",
      mode: "single",
    },
    {
      fieldName: "coverImage",
      mode: "single",
    },
    {
      fieldName: "tradeLicense",
      mode: "single",
    },
  ),
  validateRequest(StoreValidation.createStoreSchema),
  StoreController.createStore,
);

router.patch(
  "/",
  isAuthenticated,
  fileUploadHandler(),
  parseFileData(
    {
      fieldName: "logo",
      mode: "single",
    },
    {
      fieldName: "coverImage",
      mode: "single",
    },
    {
      fieldName: "tradeLicense",
      mode: "single",
    },
  ),
  validateRequest(StoreValidation.updateStoreSchema),
  StoreController.updateStore,
);

router.get("/me", isAuthenticated, StoreController.getMyStore);

router.get("/", isAuthenticated, StoreController.getAllStores);

router.get("/seller/dashboard", isSeller, StoreController.getSellerDashboard);

router.get("/:id", isAuthenticated, StoreController.getStoreDetails);

router.patch(
  "/verify-identity",
  isAuthenticated,
  fileUploadHandler(),
  parseFileData(
    {
      fieldName: "documentFront",
      mode: "single",
    },
    {
      fieldName: "documentBack",
      mode: "single",
    },
  ),
  validateRequest(StoreValidation.verifyIdentitySchema),
  StoreController.verifyIdentity,
);

router.patch(
  "/verify/:id",
  isAdmin,
  validateRequest(StoreValidation.updateStoreVerificationSchema),
  StoreController.updateStoreVerification,
);

router.patch(
  "/status/:id",
  isAdmin,
  validateRequest(StoreValidation.updateStoreStatusSchema),
  StoreController.updateStoreStatus,
);

export const StoreRoutes = router;