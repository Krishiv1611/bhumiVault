import { Router } from "express";
import {
  initiateRecovery,
  approveRecovery,
  finalizeRecovery,
  getRecovery
} from "../controllers/recovery.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.post("/initiate", authenticate, requireRole(["REGISTRAR", "JUDICIARY"]), initiateRecovery);
router.post("/:id/approve", authenticate, requireRole(["REGISTRAR", "JUDICIARY"]), approveRecovery);
router.post("/:id/finalize", authenticate, requireRole(["REGISTRAR"]), finalizeRecovery);
router.get("/:id", authenticate, getRecovery);

export default router;
