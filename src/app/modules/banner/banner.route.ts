import express from "express";
import { BannerController } from "./banner.controller";
import validateRequest from "../../middlewares/validateRequest";
import { BannerZodValidation } from "./banner.validation";
import { isAdmin } from "../../../helpers/authHelper";
import { parseFileData } from "../../middlewares/parseFileData";
import fileUploadHandler from "../../middlewares/flieUploadHandler";

const router = express.Router();

router
  .route("/")
  .post(
    isAdmin,
    fileUploadHandler(),
    parseFileData({
      fieldName: "image",
      mode: "single",
    }),
    validateRequest(BannerZodValidation.createBannerValidationSchema),
    BannerController.createBanner,
  )
  .get(BannerController.getBannersFromDB);

router.patch("/status/:id", isAdmin, BannerController.updateBannerStatus);

router
  .route("/:id")
  .patch(
    isAdmin,
    fileUploadHandler(),
    parseFileData({ fieldName: "image", mode: "single" }),
    BannerController.updateBanner,
  )
  .delete(isAdmin, BannerController.deleteBanner);

router.get("/all", isAdmin, BannerController.getAllBanner);

export const BannerRoutes = router;
