import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { StoreController } from "./store.controller";
import { StoreValidation } from "./store.validation";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import { isAuthenticated } from "../../../helpers/authHelper";

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

router.get(
  "/me",
  isAuthenticated,
  StoreController.getMyStore,
);

router.get(
  "/",
  isAuthenticated,
  StoreController.getAllStores,
);

router.get(
  "/:id",
  isAuthenticated,
  StoreController.getStoreDetails,
);


router.patch(
  "/status/:id",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(StoreValidation.updateStoreStatusSchema),
  StoreController.updateStoreStatus,
);

export const StoreRoutes = router;
