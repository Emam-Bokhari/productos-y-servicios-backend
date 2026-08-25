import { Router } from "express";
import { BroadcastControllers } from "./broadcast.controller";
import { BroadcastValidation } from "./broadcast.validation";
import validateRequest from "../../middlewares/validateRequest";
import { isAdmin } from "../../../helpers/authHelper";

const router = Router();

router
  .route("/")
  .post(
    isAdmin,
    validateRequest(BroadcastValidation.createBroadcastZodSchema),
    BroadcastControllers.createBroadcast,
  )
  .get(isAdmin, BroadcastControllers.getBroadcasts);

router.route("/:id").delete(isAdmin, BroadcastControllers.deleteBroadcast);

export const BroadcastRoutes = router;