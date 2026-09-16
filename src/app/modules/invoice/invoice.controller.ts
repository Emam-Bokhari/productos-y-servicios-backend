import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import ApiError from "../../../errors/ApiErrors";
import { invoiceService } from "./invoice.service";

/**
 * Download invoice PDF as file attachment
 */
const downloadInvoice = catchAsync(async (req: Request, res: Response) => {
  const identifier = req.params.identifier || req.params.id;
  if (!identifier) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Invoice identifier is required.",
    );
  }

  const result = await invoiceService.getOrCreateInvoicePdf(identifier);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="invoice-${result.invoiceNumber}.pdf"`,
  );
  res.setHeader("Content-Type", "application/pdf");
  return res.sendFile(result.filePath);
});

/**
 * Preview invoice PDF in browser (inline view)
 */
const previewInvoice = catchAsync(async (req: Request, res: Response) => {
  const identifier = req.params.identifier || req.params.id;
  if (!identifier) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Invoice identifier is required.",
    );
  }

  const result = await invoiceService.getOrCreateInvoicePdf(identifier);

  res.setHeader(
    "Content-Disposition",
    `inline; filename="invoice-${result.invoiceNumber}.pdf"`,
  );
  res.setHeader("Content-Type", "application/pdf");
  return res.sendFile(result.filePath);
});

/**
 * Retrieve invoice JSON details & downloadable links
 */
const getInvoiceDetails = catchAsync(async (req: Request, res: Response) => {
  const identifier = req.params.identifier || req.params.id;
  if (!identifier) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Invoice identifier is required.",
    );
  }

  const invoiceData = await invoiceService.buildInvoiceData(identifier);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Invoice details retrieved successfully",
    data: invoiceData,
  });
});

export const InvoiceController = {
  downloadInvoice,
  previewInvoice,
  getInvoiceDetails,
};
