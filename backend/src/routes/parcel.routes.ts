import { Router } from "express";
import { 
  getParcels, 
  getParcelById, 
  registerGenesisParcel, 
  searchParcels, 
  freezeParcel, 
  unfreezeParcel,
  verifyDocument,
  getOwnershipHistory,
  verifyTitle,
  getStats
} from "../controllers/parcel.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

// Public / Authenticated reads
router.get("/", authenticate, getParcels);
router.get("/search", authenticate, searchParcels);
router.get("/stats", authenticate, getStats);
router.get("/:id", authenticate, getParcelById);
router.get("/:id/history", authenticate, getOwnershipHistory);
router.get("/:id/verify", authenticate, verifyTitle);
router.post("/:id/verify-document", authenticate, verifyDocument);

// Authorized writes
router.post("/register", authenticate, requireRole(["REVENUE"]), registerGenesisParcel);
router.post("/:id/freeze", authenticate, requireRole(["REGISTRAR"]), freezeParcel);
router.post("/:id/unfreeze", authenticate, requireRole(["REGISTRAR"]), unfreezeParcel);

export default router;
