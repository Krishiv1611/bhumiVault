import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getContractWithSigner, getRolePrivateKey } from "../lib/blockchain";
import { applyMortgageSchema } from "../lib/validators";
import { BadRequestError } from "../lib/errors";
import { syncParcelById } from "../services/blockchainSync.service";
import { logActivity } from "../services/activityLog.service";

export const applyMortgage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = applyMortgageSchema.parse(req.body);

    const pk = getRolePrivateKey("BANK");
    const contract = getContractWithSigner(pk);

    const tx = await contract.applyMortgage(
      validatedData.parcelId,
      validatedData.bankName,
      validatedData.loanReferenceNumber,
      validatedData.loanAmount,
      validatedData.mortgageDocHash
    );

    const receipt = await tx.wait();

    await syncParcelById(validatedData.parcelId);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "MORTGAGE_APPLIED",
      "MORTGAGE",
      validatedData.parcelId,
      {
        bankName: validatedData.bankName,
        loanReferenceNumber: validatedData.loanReferenceNumber,
        loanAmount: validatedData.loanAmount,
        txHash: receipt.hash
      },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Mortgage applied and synced successfully", txHash: receipt.hash });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      next(new BadRequestError("Validation failed"));
    } else {
      next(error);
    }
  }
};

export const releaseMortgage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // mortgageIdOnChain
    const { parcelId, releaseDocHash } = req.body;

    if (!parcelId || !releaseDocHash) {
      throw new BadRequestError("parcelId and releaseDocHash are required");
    }

    const pk = getRolePrivateKey("BANK");
    const contract = getContractWithSigner(pk);

    const tx = await contract.releaseMortgage(parcelId, id, releaseDocHash);
    const receipt = await tx.wait();

    await syncParcelById(parcelId);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "MORTGAGE_RELEASED",
      "MORTGAGE",
      parcelId,
      { mortgageId: id, txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Mortgage released and synced successfully", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const getMortgagesByParcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // parcelId
    const mortgages = await prisma.mortgageRecord.findMany({
      where: { parcelId: id },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: mortgages });
  } catch (error) {
    next(error);
  }
};
