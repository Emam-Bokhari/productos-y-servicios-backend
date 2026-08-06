import express from "express";
import { SupportControllers } from "./support.controller";
import { isAdmin, isAuthenticated } from "../../../helpers/authHelper";

const router = express.Router();

router
  .route("/")
  .post(isAuthenticated, SupportControllers.submitSupportRequest)
  .get(
    isAdmin,
    SupportControllers.getAllSupports,
  );

router
  .route("/:id")
  .get(
    isAdmin,
    SupportControllers.getSupportById,
  )
  .delete(
    isAdmin,
    SupportControllers.deleteSupportById,
  );

export const SupportRoutes = router;
