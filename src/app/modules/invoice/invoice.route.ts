import express from "express";
import { InvoiceController } from "./invoice.controller";

const router = express.Router();

router.get("/download/:identifier", InvoiceController.downloadInvoice);
router.get("/preview/:identifier", InvoiceController.previewInvoice);
router.get("/:identifier", InvoiceController.getInvoiceDetails);

export const InvoiceRoutes = router;
