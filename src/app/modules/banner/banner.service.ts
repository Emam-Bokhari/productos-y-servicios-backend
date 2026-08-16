import { StatusCodes } from "http-status-codes";
import { Banner } from "./banner.model";
import unlinkFile from "../../../shared/unlinkFile";
import mongoose from "mongoose";
import { TBanner } from "./banner.interface";
import ApiError from "../../../errors/ApiErrors";

const createBannerToDB = async (payload: TBanner): Promise<TBanner> => {
  if (payload.status === undefined) {
    payload.status = "active";
  }

  const createBanner: any = await Banner.create(payload);
  if (!createBanner) {
    // safely unlink file only if path exists and is not empty
    if (payload.image) {
      unlinkFile(payload.image);
    }
    throw new ApiError(400, "Failed to create banner");
  }

  return createBanner;
};

const getBannerFromDB = async (): Promise<TBanner[]> => {
  return await Banner.find({ status: "active" });
};

const getAllBannerFromDB = async (): Promise<TBanner[]> => {
  return await Banner.find({});
};

const updateBannerToDB = async (id: string, payload: TBanner) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(StatusCodes.NOT_ACCEPTABLE, "Invalid ID");
  }

  const isBannerExist: any = await Banner.findById(id);

  if (!isBannerExist) {
    throw new ApiError(404, "Banner not found");
  }

  // if a new image is uploaded, delete the old one.
  if (payload.image && isBannerExist.image) {
    unlinkFile(isBannerExist.image);
  }

  const banner: any = await Banner.findByIdAndUpdate(id, payload, {
    new: true,
  });

  return banner;
};

const updateBannerStatusToDB = async (
  id: string,
  status: "active" | "inactive",
) => {
  if (status !== "active" && status !== "inactive") {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Invalid status. Status must be active or inactive",
    );
  }

  const banner = await Banner.findById(id);
  if (!banner) {
    throw new ApiError(404, "No banner found in the database");
  }

  const result = await Banner.findByIdAndUpdate(id, { status }, { new: true });
  if (!result) {
    throw new ApiError(400, "Failed to update status");
  }

  return result;
};

const deleteBannerToDB = async (id: string) => {
  const isBannerExist: any = await Banner.findById({ _id: id });

  // delete from folder
  if (isBannerExist) {
    unlinkFile(isBannerExist?.image);
  }

  // soft delete from database
  const result = await Banner.softDeleteById(id);

  return result;
};

export const BannerService = {
  createBannerToDB,
  getBannerFromDB,
  getAllBannerFromDB,
  updateBannerToDB,
  deleteBannerToDB,
  updateBannerStatusToDB,
};
