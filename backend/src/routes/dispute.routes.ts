import { Router } from "express";
import { applyDispute, liftDispute, getDisputesByParcel } from "../controllers/dispute.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.post("/apply", authenticate, requireRole(["JUDICIARY"]), applyDispute);
router.post("/:id/lift", authenticate, requireRole(["JUDICIARY"]), liftDispute);
router.get("/parcel/:id", authenticate, getDisputesByParcel);

export default router;
