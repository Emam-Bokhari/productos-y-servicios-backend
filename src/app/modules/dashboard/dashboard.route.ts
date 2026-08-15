import express from "express";
import { DashboardController } from "./dashboard.controller";
import { isAdmin } from "../../../helpers/authHelper";

const router = express.Router();

router.get("/overview", isAdmin, DashboardController.getOverviewData);

export const DashboardRoutes = router;
