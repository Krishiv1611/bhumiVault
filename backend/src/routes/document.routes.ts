import { Router } from "express";
import multer from "multer";
import {
  uploadDocument,
  getDocument,
  getDocumentsByParcel,
  downloadDocument
} from "../controllers/document.controller";
import { authenticate } from "../middleware/auth";
import fs from "fs";

const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE_MB || 15) * 1024 * 1024 }
});

const router = Router();

router.post("/upload", authenticate, upload.single("file"), uploadDocument);
router.get("/:id", authenticate, getDocument);
router.get("/parcel/:id", authenticate, getDocumentsByParcel);
router.get("/:id/download", authenticate, downloadDocument);

export default router;
