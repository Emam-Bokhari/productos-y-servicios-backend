import express from "express";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import validateRequest from "../../middlewares/validateRequest";
import { ServiceController } from "./service.controller";
import { ServiceValidation } from "./service.validation";
import { isSeller, isUserOrSeller } from "../../../helpers/authHelper";
import optionalAuth from "../../middlewares/optionalAuth";

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

router.get("/", optionalAuth(), ServiceController.getAllServices);

router.get("/:id", optionalAuth(), ServiceController.getSingleService);

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
