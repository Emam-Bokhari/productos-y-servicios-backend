import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { ReviewController } from "./review.controller";
import { ReviewValidation } from "./review.validation";
import { isAuthenticated } from "../../../helpers/authHelper";

const router = express.Router();

// Get reviews of a store
router.get("/:storeId", isAuthenticated, ReviewController.getStoreReviews);

// Submit a new review
router.post(
  "/",
  isAuthenticated,
  validateRequest(ReviewValidation.createReviewSchema),
  ReviewController.createReview,
);

// Store owner reply to review
router.patch(
  "/:id/owner-reply",
  isAuthenticated,
  validateRequest(ReviewValidation.ownerReplySchema),
  ReviewController.replyAsStoreOwner,
);

// Reviewer reply to store owner's reply
router.patch(
  "/:id/user-reply",
  isAuthenticated,
  validateRequest(ReviewValidation.userReplySchema),
  ReviewController.replyAsReviewer,
);

export const ReviewRoutes = router;
