import express from "express";
import validateRequest from "../../middlewares/validateRequest";
import { StoreCategoryController } from "./storeCategory.controller";
import { StoreCategoryValidation } from "./storeCategory.validation";
import { isAdmin, isAuthenticated } from "../../../helpers/authHelper";

const router = express.Router();

router.post(
  "/",
  isAdmin,
  validateRequest(StoreCategoryValidation.createCategoryZodSchema),
  StoreCategoryController.createCategory,
);

router.get(
  "/",
  isAuthenticated,
  StoreCategoryController.getAllCategories,
);

router.get(
  "/:storeCategoryId",
  isAuthenticated,
  StoreCategoryController.getCategoryById,
);

router.patch(
  "/:storeCategoryId",
  isAdmin,
  validateRequest(StoreCategoryValidation.updateCategoryZodSchema),
  StoreCategoryController.updateCategory,
);

router.delete(
  "/:storeCategoryId",
  isAdmin,
  StoreCategoryController.deleteCategory,
);

export const StoreCategoryRoutes = router;
