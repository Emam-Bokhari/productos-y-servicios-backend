import express from "express";
import { USER_ROLES } from "../../../enums/user";
import auth from "../../middlewares/auth";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import validateRequest from "../../middlewares/validateRequest";
import { ServiceController } from "./service.controller";
import { ServiceValidation } from "./service.validation";
import { isSeller, isUserOrSeller } from "../../../helpers/authHelper";

const router = express.Router();

router.post(
  "/",
  isSeller,
  fileUploadHandler(),
  parseFileData({ fieldName: "images", mode: "multiple" }),
  validateRequest(ServiceValidation.createServiceSchema),
  ServiceController.createService,
);

router.get("/my-services", isSeller, ServiceController.getMyServices);

router.get("/", ServiceController.getAllServices);

router.get("/:id", ServiceController.getSingleService);

router.patch(
  "/:id",
  isSeller,
  fileUploadHandler(),
  parseFileData({ fieldName: "images", mode: "multiple" }),
  validateRequest(ServiceValidation.updateServiceSchema),
  ServiceController.updateService,
);

router.delete("/:id", isSeller, ServiceController.deleteService);

export const ServiceRoutes = router;
