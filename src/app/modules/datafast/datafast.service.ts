import axios from "axios";
import config from "../../../config";
import ApiError from "../../../errors/ApiErrors";
import { StatusCodes } from "http-status-codes";

export interface IPrepareCheckoutPayload {
  amount: number;
  currency?: string;
  metadata?: Record<string, any>;
  userEmail?: string;
  userName?: string;
  isSubscription?: boolean;
  merchantTransactionId?: string;
}

export interface IDatafastPaymentResult {
  id: string;
  paymentType: string;
  paymentBrand?: string;
  amount: string;
  currency: string;
  registrationId?: string;
  result: {
    code: string;
    description: string;
  };
  card?: {
    bin: string;
    last4Digits: string;
    holder: string;
    expiryMonth: string;
    expiryYear: string;
  };
  [key: string]: any;
}

class DatafastService {
  /**
   * Helper to verify if an Oppwa/Datafast result code represents success
   */
  isSuccessCode(code: string): boolean {
    return /^(000\.000\.|000\.100\.1|000\.[36])/.test(code);
  }

  /**
   * 1. Prepare checkout session with card registration (tokenization)
   */
  async prepareCheckoutSession(
    payload: IPrepareCheckoutPayload,
  ): Promise<{ checkoutId: string; redirectUrl?: string; raw: any }> {
    const {
      amount,
      currency = "USD",
      metadata = {},
      userEmail,
      userName,
      isSubscription = false,
      merchantTransactionId,
    } = payload;

    const url = `${config.datafast.baseUrl}/v1/checkouts`;
    const params = new URLSearchParams();

    params.append("entityId", config.datafast.entityId);
    params.append("amount", amount.toFixed(2));
    params.append("currency", currency.toUpperCase());
    params.append("paymentType", "DB");

    // Tax & Merchant custom parameters required by Datafast
    params.append("customParameters[SHOPPER_MID]", config.datafast.mid);
    params.append("customParameters[SHOPPER_TID]", config.datafast.tid);
    params.append("customParameters[SHOPPER_ECI]", config.datafast.eci);
    params.append("customParameters[SHOPPER_PSERV]", config.datafast.pserv);
    params.append("customParameters[SHOPPER_VAL_BASE0]", amount.toFixed(2));
    params.append("customParameters[SHOPPER_VAL_BASEIMP]", "0.00");
    params.append("customParameters[SHOPPER_VAL_IVA]", "0.00");
    params.append("customParameters[SHOPPER_VERSIONDF]", "2");

    if (merchantTransactionId) {
      params.append("merchantTransactionId", merchantTransactionId);
    }

    if (userEmail) {
      params.append("customer.email", userEmail);
    }
    if (userName) {
      params.append("customer.givenName", userName);
    }

    // Tokenization for subscriptions (OneClick / Recurring)
    if (isSubscription) {
      params.append("createRegistration", "true");
      params.append("recurringType", "INITIAL");
      params.append("risk.parameters[USER_DATA1]", "INITIAL");
      params.append("risk.parameters[USER_DATA2]", "PagoRapidoDF");
    }

    // Pass metadata into custom parameters if supported
    if (metadata.packageId) {
      params.append("customParameters[SHOPPER_PKG_ID]", String(metadata.packageId));
    }
    if (metadata.userId) {
      params.append("customParameters[SHOPPER_USER_ID]", String(metadata.userId));
    }

    if (config.datafast.baseUrl.includes("test")) {
      params.append("testMode", "EXTERNAL");
    }

    try {
      const response = await axios.post(url, params.toString(), {
        headers: {
          Authorization: `Bearer ${config.datafast.bearerToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const data = response.data;
      if (!data.id) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          data.result?.description || "Failed to prepare Datafast checkout",
        );
      }

      return {
        checkoutId: data.id,
        redirectUrl: `${config.datafast.baseUrl}/v1/paymentWidgets.js?checkoutId=${data.id}`,
        raw: data,
      };
    } catch (error: any) {
      const message =
        error.response?.data?.result?.description ||
        error.message ||
        "Datafast checkout preparation failed";
      throw new ApiError(StatusCodes.BAD_REQUEST, message);
    }
  }

  /**
   * 2. Retrieve payment status and registration token from checkoutId
   */
  async getPaymentStatus(checkoutId: string): Promise<IDatafastPaymentResult> {
    const url = `${config.datafast.baseUrl}/v1/checkouts/${checkoutId}/payment?entityId=${config.datafast.entityId}`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${config.datafast.bearerToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.data?.result) {
        return error.response.data;
      }
      const message =
        error.response?.data?.result?.description ||
        error.message ||
        "Failed to query Datafast payment status";
      throw new ApiError(StatusCodes.BAD_REQUEST, message);
    }
  }

  /**
   * 3. Execute Recurring Payment using saved registration token
   */
  async executeRecurringPayment(
    token: string,
    amount: number,
    trxId: string,
  ): Promise<IDatafastPaymentResult> {
    const url = `${config.datafast.baseUrl}/v1/registrations/${token}/payments`;

    const params = new URLSearchParams();
    params.append("entityId", config.datafast.recurringEntityId);
    params.append("amount", amount.toFixed(2));
    params.append("currency", "USD");
    params.append("paymentType", "DB");
    params.append("recurringType", "REPEATED");
    params.append("risk.parameters[USER_DATA1]", "REPEATED");
    params.append("risk.parameters[USER_DATA2]", "PagoRapidoDF");
    params.append("merchantTransactionId", `transaction_${trxId}`);

    params.append("customParameters[SHOPPER_MID]", config.datafast.mid);
    params.append("customParameters[SHOPPER_TID]", config.datafast.tid);
    params.append("customParameters[SHOPPER_ECI]", config.datafast.eci);
    params.append("customParameters[SHOPPER_PSERV]", config.datafast.pserv);
    params.append("customParameters[SHOPPER_VAL_BASE0]", amount.toFixed(2));
    params.append("customParameters[SHOPPER_VAL_BASEIMP]", "0.00");
    params.append("customParameters[SHOPPER_VAL_IVA]", "0.00");
    params.append("customParameters[SHOPPER_VERSIONDF]", "2");

    if (config.datafast.baseUrl.includes("test")) {
      params.append("testMode", "EXTERNAL");
    }

    try {
      const response = await axios.post(url, params.toString(), {
        headers: {
          Authorization: `Bearer ${config.datafast.bearerToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.result?.description ||
        error.message ||
        "Datafast recurring payment request failed";
      throw new ApiError(StatusCodes.BAD_REQUEST, message);
    }
  }

  /**
   * 4. Refund Payment
   * 
   */
  async refundPayment(
    paymentId: string,
    amount?: number,
  ): Promise<IDatafastPaymentResult> {
    const url = `${config.datafast.baseUrl}/v1/payments/${paymentId}`;

    const params = new URLSearchParams();
    params.append("entityId", config.datafast.entityId);
    params.append("paymentType", "RF");
    params.append("currency", "USD");
    if (amount !== undefined) {
      params.append("amount", amount.toFixed(2));
    }

    try {
      const response = await axios.post(url, params.toString(), {
        headers: {
          Authorization: `Bearer ${config.datafast.bearerToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      return response.data;
    } catch (error: any) {
      const message =
        error.response?.data?.result?.description ||
        error.message ||
        "Datafast refund request failed";
      throw new ApiError(StatusCodes.BAD_REQUEST, message);
    }
  }
}

export default new DatafastService();