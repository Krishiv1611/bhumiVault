import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getContractWithSigner, getRolePrivateKey } from "../lib/blockchain";
import { applyDisputeSchema } from "../lib/validators";
import { BadRequestError } from "../lib/errors";
import { syncParcelById } from "../services/blockchainSync.service";
import { logActivity } from "../services/activityLog.service";

export const applyDispute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = applyDisputeSchema.parse(req.body);

    const pk = getRolePrivateKey("JUDICIARY");
    const contract = getContractWithSigner(pk);

    const tx = await contract.applyDisputeInjunction(
      validatedData.parcelId,
      validatedData.courtName,
      validatedData.caseNumber,
      validatedData.courtOrderHash,
      validatedData.reason
    );

    const receipt = await tx.wait();

    await syncParcelById(validatedData.parcelId);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "DISPUTE_APPLIED",
      "DISPUTE",
      validatedData.parcelId,
      {
        courtName: validatedData.courtName,
        caseNumber: validatedData.caseNumber,
        courtOrderHash: validatedData.courtOrderHash,
        txHash: receipt.hash
      },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Dispute injunction applied and synced", txHash: receipt.hash });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      next(new BadRequestError("Validation failed"));
    } else {
      next(error);
    }
  }
};

export const liftDispute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // disputeIdOnChain
    const { parcelId, judgmentDocHash } = req.body;

    if (!parcelId || !judgmentDocHash) {
      throw new BadRequestError("parcelId and judgmentDocHash are required");
    }

    const pk = getRolePrivateKey("JUDICIARY");
    const contract = getContractWithSigner(pk);

    const tx = await contract.liftDisputeInjunction(parcelId, id, judgmentDocHash);
    const receipt = await tx.wait();

    await syncParcelById(parcelId);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "DISPUTE_LIFTED",
      "DISPUTE",
      parcelId,
      { disputeId: id, judgmentDocHash, txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Dispute injunction lifted and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const getDisputesByParcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // parcelId
    const disputes = await prisma.disputeRecord.findMany({
      where: { parcelId: id },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: disputes });
  } catch (error) {
    next(error);
  }
};
