import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { USER_ROLES } from "../../../enums/user";
import { StoreCategoryController } from "./storeCategory.controller";
import { StoreCategoryValidation } from "./storeCategory.validation";

const router = express.Router();

router.post(
  "/",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(StoreCategoryValidation.createCategoryZodSchema),
  StoreCategoryController.createCategory,
);

router.get(
  "/",
  auth(
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.USER,
    USER_ROLES.SELLER,
  ),
  StoreCategoryController.getAllCategories,
);

router.get(
  "/:storeCategoryId",
  auth(
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.USER,
    USER_ROLES.SELLER,
  ),
  StoreCategoryController.getCategoryById,
);

router.patch(
  "/:storeCategoryId",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  validateRequest(StoreCategoryValidation.updateCategoryZodSchema),
  StoreCategoryController.updateCategory,
);

router.delete(
  "/:storeCategoryId",
  auth(USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN),
  StoreCategoryController.deleteCategory,
);

export const StoreCategoryRoutes = router;
