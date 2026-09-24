export interface IInvoiceItem {
  itemNumber?: number;
  description: string;
  details?: string;
  type?: string;
  duration?: string;
  unitPrice: number;
  total: number;
}

export interface IInvoiceCustomer {
  name: string;
  email: string;
  phone?: string;
  address?: string;
}

export interface IInvoiceStore {
  displayName?: string;
  logo?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface IInvoiceData {
  invoiceNumber: string;
  date: string;
  paymentMethod: string;
  paymentStatus: string;
  trxId?: string;
  currency: string;
  customer: IInvoiceCustomer;
  store?: IInvoiceStore | null;
  items: IInvoiceItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
  downloadUrl?: string;
  previewUrl?: string;
  pdfUrl?: string;
}

export interface IGeneratedInvoiceResult {
  invoiceNumber: string;
  filename: string;
  filePath: string;
  relativeUrl: string;
  downloadUrl: string;
  previewUrl: string;
  buffer?: Buffer;
}