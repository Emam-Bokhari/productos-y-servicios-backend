import fs from "fs";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer";
import mongoose, { Types } from "mongoose";
import { DateTime } from "luxon";
import { StatusCodes } from "http-status-codes";
import ApiError from "../../../errors/ApiErrors";
import { Transaction } from "../transaction/transaction.model";
import { Subscription } from "../subscription/subscription.model";
import { Store } from "../store/store.model";
import { CityAdConfiguration } from "../cityAdConfiguration/cityAdConfiguration.model";
import { Advertisement } from "../advertisement/advertisement.model";
import {
  IInvoiceData,
  IInvoiceItem,
  IGeneratedInvoiceResult,
} from "./invoice.interface";
import { logger } from "../../../shared/logger";

const INVOICE_DIR = path.join(process.cwd(), "uploads", "invoices");
const TEMPLATE_PATH = path.join(process.cwd(), "views", "invoice.ejs");

/**
 * Ensure storage directory exists
 */
const ensureDirectoryExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Format duration helper
 */
const formatDuration = (duration?: string): string => {
  switch (duration) {
    case "seven_days":
      return "7 Days";
    case "one_month":
      return "1 Month (30 Days)";
    case "three_month":
      return "3 Months";
    case "six_month":
      return "6 Months";
    case "one_year":
      return "1 Year";
    default:
      return duration ? duration.replace(/_/g, " ") : "30 Days";
  }
};

class InvoiceService {
  /**
   * Render HTML using EJS template and export pixel-perfect PDF via Puppeteer
   */
  async generateInvoicePdf(
    invoiceData: IInvoiceData,
  ): Promise<IGeneratedInvoiceResult> {
    ensureDirectoryExists(INVOICE_DIR);

    if (!fs.existsSync(TEMPLATE_PATH)) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Invoice template not found at ${TEMPLATE_PATH}`,
      );
    }

    const safeInvoiceNumber = invoiceData.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeInvoiceNumber}.pdf`;
    const filePath = path.join(INVOICE_DIR, filename);
    const relativeUrl = `/uploads/invoices/${filename}`;
    const downloadUrl = `/api/v1/invoices/download/${safeInvoiceNumber}`;
    const previewUrl = `/api/v1/invoices/preview/${safeInvoiceNumber}`;

    // Render HTML with EJS
    const html = await ejs.renderFile(TEMPLATE_PATH, {
      ...invoiceData,
      primaryColor: "#22843F",
      bgColor: "#FFFFFF",
      textColor: "#282B32",
    });

    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--font-render-hinting=none",
        ],
      });

      const page = await browser.newPage();
      await page.setContent(html, {
        waitUntil: "load",
        timeout: 30000,
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "10mm",
          bottom: "10mm",
          left: "12mm",
          right: "12mm",
        },
      });

      fs.writeFileSync(filePath, pdfBuffer);

      return {
        invoiceNumber: invoiceData.invoiceNumber,
        filename,
        filePath,
        relativeUrl,
        downloadUrl,
        previewUrl,
        buffer: Buffer.from(pdfBuffer),
      };
    } catch (error: any) {
      logger.error(`[InvoiceService] PDF generation failed: ${error.message}`);
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        `Failed to generate invoice PDF: ${error.message}`,
      );
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  /**
   * Build complete invoice data payload by querying Transaction, Subscription, User, Store, Package, and Ads
   */
  async buildInvoiceData(identifier: string): Promise<IInvoiceData> {
    const isObjectId = mongoose.Types.ObjectId.isValid(identifier);

    // 1. Try finding transaction
    const txQuery: Record<string, any>[] = [
      { transactionId: identifier },
      { stripePaymentIntentId: identifier },
      { gatewayTransactionId: identifier },
      { stripeCheckoutSessionId: identifier },
    ];
    if (isObjectId) {
      txQuery.push({ _id: new Types.ObjectId(identifier) });
    }

    let transaction = await Transaction.findOne({ $or: txQuery })
      .populate("userId")
      .populate("packageId");

    // 2. Try finding subscription if not found or to enrich details
    let subscription: any = null;
    if (!transaction && isObjectId) {
      subscription = await Subscription.findById(identifier)
        .populate("userId")
        .populate("packageId")
        .populate("cityConfigId");
    }

    if (!subscription && transaction) {
      const subQueries: any[] = [];
      if (transaction.stripeCheckoutSessionId) {
        subQueries.push({ stripeSessionId: transaction.stripeCheckoutSessionId });
      }
      if (transaction.stripePaymentIntentId) {
        subQueries.push({ trxId: transaction.stripePaymentIntentId });
      }
      if (transaction.gatewayTransactionId) {
        subQueries.push({ trxId: transaction.gatewayTransactionId });
      }
      if (transaction.userId && transaction.packageId) {
        subQueries.push({
          userId: (transaction.userId as any)._id || transaction.userId,
          packageId: (transaction.packageId as any)._id || transaction.packageId,
        });
      }
      if (subQueries.length > 0) {
        subscription = await Subscription.findOne({ $or: subQueries })
          .populate("packageId")
          .populate("cityConfigId");
      }
    }

    if (!transaction && !subscription) {
      // Last attempt: search subscription by trxId or invoiceNumber
      subscription = await Subscription.findOne({
        $or: [
          { invoiceNumber: identifier },
          { trxId: identifier },
          { stripeSessionId: identifier },
        ],
      })
        .populate("userId")
        .populate("packageId")
        .populate("cityConfigId");
    }

    if (!transaction && !subscription) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Invoice record not found");
    }

    // Resolve User
    const user: any = transaction?.userId || subscription?.userId;
    const pkg: any = transaction?.packageId || subscription?.packageId;

    // Resolve Store
    let store: any = null;
    if (user?._id) {
      store = await Store.findOne({ owner: user._id });
    }

    // Resolve City Ad Configuration if post_add
    let cityConfig: any = subscription?.cityConfigId;
    let advertisement: any = null;

    if (user?._id) {
      advertisement = await Advertisement.findOne({
        sellerId: user._id,
        isDeleted: { $ne: true },
      }).sort({ createdAt: -1 });
    }

    // Format Invoice Number
    let invoiceNumber =
      transaction?.transactionId ||
      subscription?.invoiceNumber ||
      `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Resolve Date
    const rawDate = transaction?.createdAt || subscription?.createdAt || new Date();
    const formattedDate = DateTime.fromJSDate(new Date(rawDate)).toFormat(
      "LLL d, yyyy",
    );

    // Resolve Payment Method & Status
    const paymentMethod =
      transaction?.paymentMethod || (subscription?.amountPaid === 0 ? "Free Trial" : "Card / Online");
    const paymentStatus =
      transaction?.paymentStatus || (subscription?.status === "active" ? "PAID" : "PAID");

    const trxId =
      transaction?.stripePaymentIntentId ||
      transaction?.gatewayTransactionId ||
      subscription?.trxId ||
      "";

    // Amount & Currency
    const totalAmount =
      transaction?.amount !== undefined
        ? transaction.amount
        : subscription?.amountPaid !== undefined
          ? subscription.amountPaid
          : pkg?.price || 0;

    const currency = transaction?.currency || "USD";

    // Build Line Items
    const items: IInvoiceItem[] = [];
    if (pkg) {
      const isPostAdd =
        pkg.packageType === "post_add" || subscription?.packageType === "post_add";

      let description = pkg.name || "Subscription Plan";
      let details = "";

      if (isPostAdd) {
        const slotPos = subscription?.position || advertisement?.position;
        const cityName =
          cityConfig?.city || advertisement?.city || "Selected City";
        details = `City: ${cityName}${slotPos ? ` | Featured Slot #${slotPos}` : ""}`;
      } else {
        details = `Store Creation & Vendor Membership Plan`;
      }

      items.push({
        itemNumber: 1,
        description,
        details,
        type: isPostAdd ? "Advertisement" : "Store Subscription",
        duration: formatDuration(pkg.duration),
        unitPrice: totalAmount,
        total: totalAmount,
      });
    } else {
      items.push({
        itemNumber: 1,
        description: "Productos Y Servicios Platform Service",
        details: "Digital subscription & advertisement service",
        type: "Service",
        duration: "30 Days",
        unitPrice: totalAmount,
        total: totalAmount,
      });
    }

    const safeInvoiceNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");

    return {
      invoiceNumber,
      date: formattedDate,
      paymentMethod,
      paymentStatus,
      trxId,
      currency,
      customer: {
        name: user?.name || "Customer",
        email: user?.email || "",
        phone: user?.phone || "",
        address: store?.streetAddress || "",
      },
      store: store
        ? {
            displayName: store.displayName,
            logo: store.logo,
            phone: store.phone,
            email: store.email,
            address: store.streetAddress,
          }
        : null,
      items,
      subtotal: totalAmount,
      tax: 0,
      discount: 0,
      total: totalAmount,
      notes: "Thank you for partnering with Productos Y Servicios. Your active subscription contributes directly to your store's visibility across our marketplace.",
      downloadUrl: `/api/v1/invoices/download/${safeInvoiceNumber}`,
      previewUrl: `/api/v1/invoices/preview/${safeInvoiceNumber}`,
      pdfUrl: `/uploads/invoices/${safeInvoiceNumber}.pdf`,
    };
  }

  /**
   * Get existing cached PDF or generate one dynamically on the fly
   */
  async getOrCreateInvoicePdf(
    identifier: string,
  ): Promise<IGeneratedInvoiceResult> {
    ensureDirectoryExists(INVOICE_DIR);

    const invoiceData = await this.buildInvoiceData(identifier);
    const safeInvoiceNumber = invoiceData.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeInvoiceNumber}.pdf`;
    const filePath = path.join(INVOICE_DIR, filename);
    const relativeUrl = `/uploads/invoices/${filename}`;
    const downloadUrl = `/api/v1/invoices/download/${safeInvoiceNumber}`;
    const previewUrl = `/api/v1/invoices/preview/${safeInvoiceNumber}`;

    // If PDF already exists on disk, return it immediately
    if (fs.existsSync(filePath)) {
      return {
        invoiceNumber: invoiceData.invoiceNumber,
        filename,
        filePath,
        relativeUrl,
        downloadUrl,
        previewUrl,
      };
    }

    // Generate new PDF
    const result = await this.generateInvoicePdf(invoiceData);

    // Save invoiceUrl back to Transaction and Subscription if found
    try {
      await Transaction.updateMany(
        {
          $or: [
            { transactionId: invoiceData.invoiceNumber },
            { stripePaymentIntentId: invoiceData.trxId },
            { gatewayTransactionId: invoiceData.trxId },
          ],
        },
        { $set: { invoiceUrl: relativeUrl } },
      );

      await Subscription.updateMany(
        {
          $or: [
            { invoiceNumber: invoiceData.invoiceNumber },
            { trxId: invoiceData.trxId },
          ],
        },
        {
          $set: {
            invoiceNumber: invoiceData.invoiceNumber,
            invoiceUrl: relativeUrl,
          },
        },
      );
    } catch (err: any) {
      logger.warn(`[InvoiceService] Failed to update DB invoiceUrl: ${err.message}`);
    }

    return result;
  }

  /**
   * Background trigger to pre-generate PDF for a transaction
   */
  async autoGenerateInvoiceForTransaction(
    identifier: string,
  ): Promise<IGeneratedInvoiceResult | null> {
    try {
      return await this.getOrCreateInvoicePdf(identifier);
    } catch (err: any) {
      logger.error(
        `[InvoiceService] Auto-generation failed for ${identifier}: ${err.message}`,
      );
      return null;
    }
  }
}

export const invoiceService = new InvoiceService();
