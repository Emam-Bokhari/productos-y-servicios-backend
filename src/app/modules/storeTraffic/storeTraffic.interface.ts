import { Schema } from "mongoose";

export interface IStoreTraffic {
  storeId: Schema.Types.ObjectId;
  date: Date;
  count: number;
}
