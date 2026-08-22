import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getContractWithSigner, getRolePrivateKey } from "../lib/blockchain";
import { initiateRecoverySchema } from "../lib/validators";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { syncParcelById } from "../services/blockchainSync.service";
import { logActivity } from "../services/activityLog.service";

export const initiateRecovery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = initiateRecoverySchema.parse(req.body);

    const pk = getRolePrivateKey("REGISTRAR");
    const contract = getContractWithSigner(pk);

    const tx = await contract.initiateOwnershipRecovery(
      validatedData.parcelId,
      validatedData.proposedNewOwner,
      validatedData.recoveryReasonDocHash
    );
    const receipt = await tx.wait();

    await syncParcelById(validatedData.parcelId);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "RECOVERY_INITIATED",
      "RECOVERY",
      validatedData.parcelId,
      { proposedNewOwner: validatedData.proposedNewOwner, txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Recovery initiated and synced", txHash: receipt.hash });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      next(new BadRequestError("Validation failed"));
    } else {
      next(error);
    }
  }
};

export const approveRecovery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // parcelId

    const pk = getRolePrivateKey("JUDICIARY");
    const contract = getContractWithSigner(pk);

    const tx = await contract.approveOwnershipRecovery(id);
    const receipt = await tx.wait();

    await syncParcelById(id);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "RECOVERY_APPROVED",
      "RECOVERY",
      id,
      { txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Recovery approved and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const finalizeRecovery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // parcelId

    const pk = getRolePrivateKey("REGISTRAR");
    const contract = getContractWithSigner(pk);

    const tx = await contract.finalizeOwnershipRecovery(id);
    const receipt = await tx.wait();

    await syncParcelById(id);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "RECOVERY_FINALIZED",
      "RECOVERY",
      id,
      { txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Recovery finalized and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const getRecovery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // parcelId
    const recovery = await prisma.recoveryRequest.findFirst({
      where: { parcelId: id, isActive: true },
      include: {
        parcel: true
      }
    });

    if (!recovery) throw new NotFoundError("No active recovery request found for this parcel");

    res.json({ success: true, data: recovery });
  } catch (error) {
    next(error);
  }
};
