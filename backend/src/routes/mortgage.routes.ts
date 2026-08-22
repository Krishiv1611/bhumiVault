import { Router } from "express";
import { applyMortgage, releaseMortgage, getMortgagesByParcel } from "../controllers/mortgage.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.post("/apply", authenticate, requireRole(["BANK"]), applyMortgage);
router.post("/:id/release", authenticate, requireRole(["BANK"]), releaseMortgage);
router.get("/parcel/:id", authenticate, getMortgagesByParcel);

export default router;
