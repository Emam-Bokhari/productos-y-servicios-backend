import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { TransactionService } from "./transaction.service";

const getAllSubscriptionTransactions = catchAsync(async (req: Request, res: Response) => {
  const result = await TransactionService.getAllSubscriptionTransactions(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transactions retrieved successfully",
    data: result,
  });
});

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
  getAllSubscriptionTransactions,
  refundTransaction,
};
