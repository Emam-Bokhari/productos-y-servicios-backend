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
  StoreController.createDraftStore
);

router.get(
  "/draft",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  StoreController.getDraftStore
);

router.patch(
  "/step-1",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  validateRequest(StoreValidation.updateStep1Schema),
  StoreController.updateStep1
);

router.patch(
  "/step-2",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  validateRequest(StoreValidation.updateStep2Schema),
  StoreController.updateStep2
);

router.patch(
  "/step-3",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  validateRequest(StoreValidation.updateStep3Schema),
  StoreController.updateStep3
);

router.patch(
  "/step-4",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  validateRequest(StoreValidation.updateStep4Schema),
  StoreController.updateStep4
);

router.post(
  "/publish",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  StoreController.publishStore
);

router.get(
  "/me",
  auth(USER_ROLES.USER, USER_ROLES.SELLER),
  StoreController.getMyStore
);

export const StoreRoutes = router;
