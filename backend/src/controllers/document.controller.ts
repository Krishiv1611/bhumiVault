import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { computeSHA256 } from "../lib/blockchain";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { logActivity } from "../services/activityLog.service";
import fs from "fs";

export const uploadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new BadRequestError("No file uploaded");
    }

    const file = req.file;
    const { parcelId, purpose } = req.body;

    const fileBuffer = fs.readFileSync(file.path);
    const sha256Hash = computeSHA256(fileBuffer);

    const document = await prisma.document.create({
      data: {
        parcelId: parcelId || null,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256Hash,
        filePath: file.path,
        purpose: purpose || "OTHER",
        uploadedByUserId: req.user!.userId
      }
    });

    await logActivity(
      req.user!.userId,
      req.user?.walletAddress || null,
      "DOCUMENT_UPLOADED",
      "DOCUMENT",
      document.id,
      {
        parcelId: parcelId || null,
        purpose: document.purpose,
        fileName: document.originalName,
        sha256Hash
      },
      req.ip,
      req.headers["user-agent"]
    );

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      data: document
    });
  } catch (error) {
    next(error);
  }
};

export const getDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const document = await prisma.document.findUnique({
      where: { id }
    });

    if (!document) throw new NotFoundError("Document not found");

    res.json({ success: true, data: document });
  } catch (error) {
    next(error);
  }
};

export const getDocumentsByParcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const documents = await prisma.document.findMany({
      where: { parcelId: id },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
};

export const downloadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const document = await prisma.document.findUnique({
      where: { id }
    });

    if (!document) throw new NotFoundError("Document not found");

    res.download(document.filePath, document.originalName);
  } catch (error) {
    next(error);
  }
};
