import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getContractWithSigner, getRolePrivateKey } from "../lib/blockchain";
import { registerParcelSchema } from "../lib/validators";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { syncParcelById } from "../services/blockchainSync.service";
import { logActivity } from "../services/activityLog.service";

export const getParcels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 10, district, stateCode, currentOwnerAddress, landType, isLocked } = req.query;
    
    const where: any = {};
    if (district) where.district = { contains: String(district), mode: "insensitive" };
    if (stateCode) where.stateCode = { equals: String(stateCode), mode: "insensitive" };
    if (currentOwnerAddress) where.currentOwnerAddress = { equals: String(currentOwnerAddress), mode: "insensitive" };
    if (landType) where.landType = landType;
    if (isLocked !== undefined) where.isLocked = isLocked === "true";
    
    const parcels = await prisma.landParcel.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        currentOwnerUser: {
          select: { fullName: true, email: true }
        }
      }
    });

    const total = await prisma.landParcel.count({ where });

    res.json({
      success: true,
      data: {
        parcels,
        total,
        page: Number(page),
        limit: Number(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getParcelById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const parcel = await prisma.landParcel.findUnique({
      where: { parcelId: id },
      include: {
        currentOwnerUser: {
          select: { fullName: true, email: true, phone: true }
        },
        mortgages: { where: { isActive: true } },
        disputes: { where: { isActive: true } },
        documents: true,
        history: { orderBy: { historyIndex: "asc" } }
      }
    });

    if (!parcel) throw new NotFoundError("Parcel not found");

    res.json({ success: true, data: parcel });
  } catch (error) {
    next(error);
  }
};

export const registerGenesisParcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = registerParcelSchema.parse(req.body);
    
    // Check if parcel already exists in DB
    const existing = await prisma.landParcel.findUnique({
      where: { parcelId: validatedData.parcelId }
    });
    if (existing) {
      throw new BadRequestError("Parcel already exists");
    }

    const landTypeMapping: Record<string, number> = {
      AGRICULTURAL: 0,
      RESIDENTIAL: 1,
      COMMERCIAL: 2,
      INDUSTRIAL: 3,
      GOVERNMENT_RESERVED: 4
    };

    // Get Revenue Officer private key and contract instance
    const pk = getRolePrivateKey("REVENUE");
    const contract = getContractWithSigner(pk);

    // Write to blockchain
    const tx = await contract.registerGenesisParcel(
      validatedData.parcelId,
      validatedData.stateCode,
      validatedData.district,
      validatedData.taluk,
      validatedData.surveyNumber,
      validatedData.areaSqMeters,
      landTypeMapping[validatedData.landType],
      validatedData.initialOwner,
      validatedData.deedDocumentHash,
      validatedData.boundaryCoordinatesHash
    );

    const receipt = await tx.wait();

    // Trigger on-demand sync
    const syncedParcel = await syncParcelById(validatedData.parcelId);

    // Log Activity
    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "GENESIS_REGISTERED",
      "PARCEL",
      validatedData.parcelId,
      { txHash: receipt.hash, initialOwner: validatedData.initialOwner },
      req.ip,
      req.headers["user-agent"]
    );

    res.status(201).json({
      success: true,
      message: "Genesis parcel registered on-chain and synced to database",
      txHash: receipt.hash,
      data: syncedParcel
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      next(new BadRequestError("Validation failed"));
    } else {
      next(error);
    }
  }
};

export const searchParcels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.json({ success: true, data: [] });
    }

    const parcels = await prisma.landParcel.findMany({
      where: {
        OR: [
          { parcelId: { contains: q, mode: "insensitive" } },
          { district: { contains: q, mode: "insensitive" } },
          { surveyNumber: { contains: q, mode: "insensitive" } },
          { taluk: { contains: q, mode: "insensitive" } },
          { currentOwnerAddress: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 20
    });

    res.json({ success: true, data: parcels });
  } catch (error) {
    next(error);
  }
};

export const freezeParcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const pk = getRolePrivateKey("REGISTRAR");
    const contract = getContractWithSigner(pk);

    if (typeof contract.freezeProperty !== "function") {
      throw new Error("Smart contract does not support freezeProperty yet");
    }

    const tx = await contract.freezeProperty(id);
    const receipt = await tx.wait();

    await syncParcelById(id);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "PARCEL_FROZEN",
      "PARCEL",
      id,
      { txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Property frozen successfully", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const unfreezeParcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const pk = getRolePrivateKey("REGISTRAR");
    const contract = getContractWithSigner(pk);

    if (typeof contract.unfreezeProperty !== "function") {
      throw new Error("Smart contract does not support unfreezeProperty yet");
    }

    const tx = await contract.unfreezeProperty(id);
    const receipt = await tx.wait();

    await syncParcelById(id);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "PARCEL_UNFROZEN",
      "PARCEL",
      id,
      { txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Property unfrozen successfully", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const verifyDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { documentHash } = req.body;

    if (!documentHash) {
      throw new BadRequestError("documentHash is required");
    }

    const parcel = await prisma.landParcel.findUnique({
      where: { parcelId: id }
    });

    if (!parcel) {
      throw new NotFoundError("Parcel not found");
    }

    const isMatch = parcel.deedDocumentHash.toLowerCase() === documentHash.toLowerCase();

    res.json({
      success: true,
      data: {
        isMatch,
        parcelId: id,
        storedHash: parcel.deedDocumentHash,
        providedHash: documentHash
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getOwnershipHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const history = await prisma.ownershipHistory.findMany({
      where: { parcelId: id },
      orderBy: { historyIndex: "asc" }
    });

    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};

export const verifyTitle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const parcel = await prisma.landParcel.findUnique({
      where: { parcelId: id },
      include: {
        currentOwnerUser: { select: { fullName: true } }
      }
    });

    if (!parcel) {
      throw new NotFoundError("Parcel not found");
    }

    const isCleanTitle = parcel.activeMortgagesCount === 0 && parcel.activeDisputesCount === 0 && !parcel.isLocked;

    res.json({
      success: true,
      data: {
        parcelId: id,
        isCleanTitle,
        isMortgaged: parcel.activeMortgagesCount > 0,
        isDisputed: parcel.activeDisputesCount > 0,
        isLocked: parcel.isLocked,
        currentOwnerAddress: parcel.currentOwnerAddress,
        currentOwnerName: parcel.currentOwnerUser?.fullName || null
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const totalParcels = await prisma.landParcel.count();
    const mortgagedCount = await prisma.landParcel.count({ where: { activeMortgagesCount: { gt: 0 } } });
    const disputedCount = await prisma.landParcel.count({ where: { activeDisputesCount: { gt: 0 } } });
    const cleanCount = await prisma.landParcel.count({
      where: {
        activeMortgagesCount: 0,
        activeDisputesCount: 0,
        isLocked: false
      }
    });

    res.json({
      success: true,
      data: {
        totalParcels,
        mortgagedCount,
        disputedCount,
        cleanCount
      }
    });
  } catch (error) {
    next(error);
  }
};
