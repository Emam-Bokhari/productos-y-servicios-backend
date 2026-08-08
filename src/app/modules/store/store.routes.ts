import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { StoreController } from "./store.controller";
import { StoreValidation } from "./store.validation";

const router = express.Router();

router.post(
  "/",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  validateRequest(StoreValidation.createStoreSchema),
  StoreController.createStore,
);

router.patch(
  "/",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  validateRequest(StoreValidation.updateStoreSchema),
  StoreController.updateStore,
);

router.get(
  "/me",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  StoreController.getMyStore,
);

export const StoreRoutes = router;
