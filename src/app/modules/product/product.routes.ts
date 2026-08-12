import express from "express";
import fileUploadHandler from "../../middlewares/flieUploadHandler";
import { parseFileData } from "../../middlewares/parseFileData";
import validateRequest from "../../middlewares/validateRequest";
import { ProductController } from "./product.controller";
import { ProductValidation } from "./product.validation";
import { isSeller } from "../../../helpers/authHelper";

const router = express.Router();

router.post(
  "/",
  isSeller,
  fileUploadHandler(),
  parseFileData({ fieldName: "images", mode: "multiple" }),
  validateRequest(ProductValidation.createProductSchema),
  ProductController.createProduct,
);

router.get("/my-products", isSeller, ProductController.getMyProducts);

router.get("/", ProductController.getAllProducts);

router.get("/:id", ProductController.getSingleProduct);

router.patch(
  "/:id",
  isSeller,
  fileUploadHandler(),
  parseFileData({ fieldName: "images", mode: "multiple" }),
  validateRequest(ProductValidation.updateProductSchema),
  ProductController.updateProduct,
);

router.delete("/:id", isSeller, ProductController.deleteProduct);

export const ProductRoutes = router;
