import { Router } from "express";
import { RuleControllers } from "./rule.controller";
import { isAdmin } from "../../../helpers/authHelper";

const router = Router();

router.post("/", isAdmin, RuleControllers.upsertRule);

router.get("/:type", RuleControllers.getRule);

router.patch("/:type", isAdmin, RuleControllers.updateRule);

router.delete("/:type", isAdmin, RuleControllers.deleteRule);

export const RuleRoutes = router;
