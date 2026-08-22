import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { getContractWithSigner, getRolePrivateKey } from "../lib/blockchain";
import { initiateTransferSchema } from "../lib/validators";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { syncParcelById } from "../services/blockchainSync.service";
import { logActivity } from "../services/activityLog.service";

export const initiateTransfer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = initiateTransferSchema.parse(req.body);

    const parcel = await prisma.landParcel.findUnique({ where: { parcelId: validatedData.parcelId } });
    if (!parcel) throw new NotFoundError("Parcel not found");

    if (!validatedData.sellerPrivateKey) {
      throw new BadRequestError("sellerPrivateKey required for manual signing");
    }

    const contract = getContractWithSigner(validatedData.sellerPrivateKey);
    const tx = await contract.initiateTransfer(
      validatedData.parcelId,
      validatedData.buyerAddress,
      validatedData.saleConsideration,
      validatedData.saleDeedHash
    );

    const receipt = await tx.wait();

    await syncParcelById(validatedData.parcelId);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "TRANSFER_INITIATED",
      "TRANSFER",
      validatedData.parcelId,
      {
        buyerAddress: validatedData.buyerAddress,
        saleConsideration: validatedData.saleConsideration,
        txHash: receipt.hash
      },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Transfer initiated and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const initiateGaslessTransfer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { parcelId, sellerAddress, buyerAddress, saleConsideration, saleDeedHash, deadline, signature } = req.body;
    
    if (!parcelId || !sellerAddress || !buyerAddress || !saleDeedHash || !deadline || !signature) {
      throw new BadRequestError("Missing required gasless transfer parameters");
    }

    // The relayer is the REGISTRAR
    const pk = getRolePrivateKey("REGISTRAR");
    const contract = getContractWithSigner(pk);

    const tx = await contract.initiateTransferWithSignature(
      parcelId,
      sellerAddress,
      buyerAddress,
      saleConsideration,
      saleDeedHash,
      deadline,
      signature
    );

    const receipt = await tx.wait();

    await syncParcelById(parcelId);

    await logActivity(
      req.user?.userId || null,
      sellerAddress,
      "GASLESS_TRANSFER_INITIATED",
      "TRANSFER",
      parcelId,
      { buyerAddress, saleConsideration, txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Gasless transfer initiated and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const acceptTransfer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { buyerPrivateKey } = req.body;

    if (!buyerPrivateKey) throw new BadRequestError("buyerPrivateKey required");

    const contract = getContractWithSigner(buyerPrivateKey);
    const tx = await contract.buyerAcceptTransfer(id);
    const receipt = await tx.wait();

    await syncParcelById(id);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "TRANSFER_ACCEPTED",
      "TRANSFER",
      id,
      { txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Transfer accepted and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const authorizeTransfer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    const pk = getRolePrivateKey("REGISTRAR");
    const contract = getContractWithSigner(pk);

    const tx = await contract.authorizeAndCommitTransfer(id);
    const receipt = await tx.wait();

    await syncParcelById(id);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "TRANSFER_AUTHORIZED",
      "TRANSFER",
      id,
      { txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Transfer authorized, committed, and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const cancelTransfer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { privateKey } = req.body;
    if (!privateKey) throw new BadRequestError("privateKey required");

    const contract = getContractWithSigner(privateKey);
    const tx = await contract.cancelTransferRequest(id);
    const receipt = await tx.wait();

    await syncParcelById(id);

    await logActivity(
      req.user?.userId || null,
      req.user?.walletAddress || null,
      "TRANSFER_CANCELLED",
      "TRANSFER",
      id,
      { txHash: receipt.hash },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, message: "Transfer cancelled and synced", txHash: receipt.hash });
  } catch (error) {
    next(error);
  }
};

export const getPendingTransfers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await prisma.transferRequest.findMany({
      where: { isActive: true, govtApproved: false },
      include: {
        parcel: {
          select: {
            stateCode: true,
            district: true,
            surveyNumber: true,
            areaSqMeters: true,
            landType: true
          }
        }
      }
    });
    res.json({ success: true, data: pending });
  } catch (error) {
    next(error);
  }
};

export const getTransferDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // parcelId
    const transfer = await prisma.transferRequest.findFirst({
      where: { parcelId: id, isActive: true },
      include: {
        parcel: true
      }
    });

    if (!transfer) {
      throw new NotFoundError("No active transfer found for this parcel");
    }

    res.json({ success: true, data: transfer });
  } catch (error) {
    next(error);
  }
};
