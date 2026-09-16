import path from "path";
import fs from "fs";
import { invoiceService } from "../src/app/modules/invoice/invoice.service";
import { IInvoiceData } from "../src/app/modules/invoice/invoice.interface";

async function testInvoice() {
  console.log("Starting invoice generation test...");

  const sampleInvoice: IInvoiceData = {
    invoiceNumber: "INV-2026-TEST01",
    date: "Sep 16, 2026",
    paymentMethod: "Credit Card (Datafast)",
    paymentStatus: "PAID",
    trxId: "tx_datafast_test_987654321",
    currency: "USD",
    customer: {
      name: "Juan Perez",
      email: "juan.perez@example.com",
      phone: "+593 98 765 4321",
      address: "Av. Amazonas y Naciones Unidas, Quito",
    },
    store: {
      displayName: "Mega Store Quito",
      phone: "+593 98 765 4321",
      email: "contacto@megastore.ec",
      address: "Quito, Pichincha, Ecuador",
    },
    items: [
      {
        itemNumber: 1,
        description: "Featured Advertisement Slot - Quito",
        details: "City: Quito | Featured Slot #1 | High Visibility Campaign",
        type: "Advertisement",
        duration: "1 Month (30 Days)",
        unitPrice: 50.0,
        total: 50.0,
      },
      {
        itemNumber: 2,
        description: "Store Creation Membership Package",
        details: "Monthly Verified Seller Subscription",
        type: "Store Subscription",
        duration: "1 Month",
        unitPrice: 20.0,
        total: 20.0,
      },
    ],
    subtotal: 70.0,
    tax: 0.0,
    discount: 0.0,
    total: 70.0,
    notes:
      "Thank you for choosing Productos Y Servicios. Your active subscription guarantees full storefront exposure across our Ecuador marketplace network.",
  };

  try {
    const result = await invoiceService.generateInvoicePdf(sampleInvoice);
    console.log("Invoice generated successfully!");
    console.log("File Path:", result.filePath);
    console.log("Relative URL:", result.relativeUrl);
    console.log("Download URL:", result.downloadUrl);
    console.log("Preview URL:", result.previewUrl);

    if (fs.existsSync(result.filePath)) {
      const stats = fs.statSync(result.filePath);
      console.log("File exists on disk. Size in bytes:", stats.size);
      if (stats.size > 1000) {
        console.log("SUCCESS: PDF is valid and properly sized!");
      } else {
        console.error("WARNING: PDF file is suspiciously small.");
      }
    } else {
      console.error("ERROR: File was not found on disk.");
    }
  } catch (err: any) {
    console.error("Test failed with error:", err.message);
    console.error(err.stack);
  }
}

testInvoice();
