import { Types } from "mongoose";

export interface IGeoPoint {
  type: "Point";
  coordinates: [number, number];
}
