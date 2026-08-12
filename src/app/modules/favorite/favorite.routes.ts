import express from "express";
import { isAuthenticated } from "../../../helpers/authHelper";
import validateRequest from "../../middlewares/validateRequest";
import { FavoriteController } from "./favorite.controller";
import { FavoriteValidation } from "./favorite.validation";

const router = express.Router();

// Toggle favorite (Add if not present, remove if already present)
router.post(
  "/toggle",
  isAuthenticated,
  validateRequest(FavoriteValidation.toggleFavoriteSchema),
  FavoriteController.toggleFavorite,
);

// Check if specific target is favorited
router.get("/check", isAuthenticated, FavoriteController.checkIsFavorited);

// Get user's favorites list (can filter by ?targetType=Store or Product or Service)
router.get("/", isAuthenticated, FavoriteController.getMyFavorites);

// Remove specific favorite by ID
router.delete("/:id", isAuthenticated, FavoriteController.deleteFavorite);

export const FavoriteRoutes = router;
