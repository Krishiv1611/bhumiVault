import { Router } from "express";
import {
  initiateTransfer,
  initiateGaslessTransfer,
  acceptTransfer,
  authorizeTransfer,
  cancelTransfer,
  getPendingTransfers,
  getTransferDetails
} from "../controllers/transfer.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.post("/initiate", authenticate, requireRole(["CITIZEN"]), initiateTransfer);
router.post("/initiate-gasless", authenticate, requireRole(["REGISTRAR"]), initiateGaslessTransfer);
router.post("/:id/accept", authenticate, requireRole(["CITIZEN"]), acceptTransfer);
router.post("/:id/authorize", authenticate, requireRole(["REGISTRAR"]), authorizeTransfer);
router.post("/:id/cancel", authenticate, requireRole(["CITIZEN", "REGISTRAR"]), cancelTransfer);

router.get("/pending", authenticate, requireRole(["REGISTRAR"]), getPendingTransfers);
router.get("/:id", authenticate, getTransferDetails);

export default router;
