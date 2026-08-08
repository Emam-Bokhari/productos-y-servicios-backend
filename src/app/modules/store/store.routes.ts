import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { StoreController } from "./store.controller";
import { StoreValidation } from "./store.validation";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";

const router = express.Router();

router.post(
  "/",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
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
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
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
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  StoreController.getMyStore,
);

export const StoreRoutes = router;
