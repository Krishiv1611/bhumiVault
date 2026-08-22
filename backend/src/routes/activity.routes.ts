import { Router } from "express";
import { getActivities, getActivitiesByParcel } from "../controllers/activity.controller";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.get("/", authenticate, requireRole(["ADMIN"]), getActivities);
router.get("/parcel/:id", authenticate, getActivitiesByParcel);

export default router;
