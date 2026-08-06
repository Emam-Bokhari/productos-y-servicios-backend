import express from "express";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";
import validateRequest from "../../middlewares/validateRequest";
import { parseFileData } from "../../middlewares/parseFileData";

import {
  isAdmin,
  isAuthenticated,
  isSuperAdmin,
} from "../../../helpers/authHelper";
import fileUploadHandler from "../../middlewares/flieUploadHandler";

const router = express.Router();

/* ---------------------------- PROFILE ROUTES ---------------------------- */
router.route("/profile")
  .get(isAuthenticated, UserController.getMyProfile)
  .delete(isAuthenticated, UserController.deleteProfile);

/* ---------------------------- ADMIN CREATE ------------------------------ */
router.post(
  "/create-admin",
  isSuperAdmin,

  validateRequest(UserValidation.createAdminZodSchema),
  UserController.createAdmin,
);

/* ---------------------------- ADMINS LIST ------------------------------- */
router.get("/admins", isSuperAdmin, UserController.getAdmin);
router.delete("/admins/:id", isSuperAdmin, UserController.deleteAdmin);

/* ---------------------------- USER CREATE & UPDATE ---------------------- */
router
  .route("/")
  .post(UserController.createUser)

  .patch(
    isAuthenticated,
    fileUploadHandler(),
    parseFileData(
      {
        fieldName: "profileImage",
        mode: "single",
      },
      {
        fieldName: "coverImage",
        mode: "single",
      },
    ),
    UserController.updateProfile,
  );

/* ---------------------------- STATUS UPDATE ----------------------------- */
router.patch(
  "/admin/status/:id",
  isAdmin,
  UserController.updateAdminStatusById,
);
router.patch("/status/:id", isAdmin, UserController.updateUserStatusById);



/* ---------------------------- DYNAMIC USER ID ROUTES (KEEP LAST!) ------- */
router
  .route("/:id")
  .get(isAdmin, UserController.getUserById)
  .delete(isAdmin, UserController.deleteUserById);

export const UserRoutes = router;
