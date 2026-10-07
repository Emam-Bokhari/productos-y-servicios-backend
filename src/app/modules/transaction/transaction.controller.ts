import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { TransactionService } from "./transaction.service";

/**
 * Get authenticated user's transactions (subscriptions + post ads)
 */
const getMyTransactions = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;
  const result = await TransactionService.getMyTransactionsFromDB(
    user.id || user._id,
    user.role,
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transactions retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

/**
 * Get single transaction details by ID or transaction number
 */
const getSingleTransaction = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user as any;
  const result = await TransactionService.getSingleTransactionFromDB(id, user);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transaction details retrieved successfully",
    data: result,
  });
});

/**
 * Admin: Get all transactions
 */
const getAllSubscriptionTransactions = catchAsync(
  async (req: Request, res: Response) => {
    const result = await TransactionService.getAllSubscriptionTransactions(
      req.query,
    );

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Transactions retrieved successfully",
      meta: result.meta,
      data: result.data,
    });
  },
);

/**
 * Admin: Refund transaction
 */
const refundTransaction = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await TransactionService.refundTransactionFromDB(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transaction refunded successfully",
    data: result,
  });
});

export const TransactionController = {
  getMyTransactions,
  getSingleTransaction,
  getAllSubscriptionTransactions,
  refundTransaction,
};
