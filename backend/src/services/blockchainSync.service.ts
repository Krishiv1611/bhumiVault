import { getContract } from "../lib/blockchain";
import { prisma } from "../lib/prisma";

const LAND_TYPE_NAMES: Record<number, "AGRICULTURAL" | "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL" | "GOVERNMENT_RESERVED"> = {
  0: "AGRICULTURAL",
  1: "RESIDENTIAL",
  2: "COMMERCIAL",
  3: "INDUSTRIAL",
  4: "GOVERNMENT_RESERVED",
};

/**
 * Sync a single parcel and all its related sub-records (History, Mortgages, Disputes, Transfers)
 * from the Ethereum smart contract into PostgreSQL.
 */
export const syncParcelById = async (parcelId: string) => {
  try {
    const contract = getContract();
    const parcelData = await contract.getParcel(parcelId);

    if (!parcelData || !parcelData.exists) {
      return null;
    }

    // Try linking with a registered User in DB if wallet matches
    const ownerUser = await prisma.user.findFirst({
      where: { walletAddress: { equals: parcelData.currentOwner, mode: "insensitive" } }
    });

    const landType = LAND_TYPE_NAMES[Number(parcelData.landType)] || "RESIDENTIAL";

    // 1. Upsert LandParcel mirror
    const parcel = await prisma.landParcel.upsert({
      where: { parcelId },
      update: {
        stateCode: parcelData.stateCode || "MH",
        district: parcelData.district || "Unknown",
        taluk: parcelData.taluk || "Unknown",
        surveyNumber: parcelData.surveyNumber || "Unknown",
        areaSqMeters: Number(parcelData.areaSqMeters),
        landType,
        currentOwnerAddress: parcelData.currentOwner,
        currentOwnerUserId: ownerUser?.id || null,
        deedDocumentHash: parcelData.deedDocumentHash,
        boundaryCoordinatesHash: parcelData.boundaryCoordinatesHash,
        activeMortgagesCount: Number(parcelData.activeMortgagesCount),
        activeDisputesCount: Number(parcelData.activeDisputesCount),
        isLocked: parcelData.isLocked,
        exists: parcelData.exists,
        creationTimestamp: BigInt(parcelData.creationTimestamp.toString()),
        lastUpdatedTimestamp: BigInt(parcelData.lastUpdatedTimestamp.toString()),
      },
      create: {
        parcelId,
        stateCode: parcelData.stateCode || "MH",
        district: parcelData.district || "Unknown",
        taluk: parcelData.taluk || "Unknown",
        surveyNumber: parcelData.surveyNumber || "Unknown",
        areaSqMeters: Number(parcelData.areaSqMeters),
        landType,
        currentOwnerAddress: parcelData.currentOwner,
        currentOwnerUserId: ownerUser?.id || null,
        deedDocumentHash: parcelData.deedDocumentHash,
        boundaryCoordinatesHash: parcelData.boundaryCoordinatesHash,
        activeMortgagesCount: Number(parcelData.activeMortgagesCount),
        activeDisputesCount: Number(parcelData.activeDisputesCount),
        isLocked: parcelData.isLocked,
        exists: parcelData.exists,
        creationTimestamp: BigInt(parcelData.creationTimestamp.toString()),
        lastUpdatedTimestamp: BigInt(parcelData.lastUpdatedTimestamp.toString()),
      }
    });

    // 2. Sync Ownership History
    try {
      const historyEntries = await contract.getOwnershipHistory(parcelId);
      for (const entry of historyEntries) {
        await prisma.ownershipHistory.upsert({
          where: {
            parcelId_historyIndex: {
              parcelId,
              historyIndex: Number(entry.historyIndex)
            }
          },
          update: {
            fromOwnerAddress: entry.fromOwner,
            toOwnerAddress: entry.toOwner,
            transferType: entry.transferType,
            deedDocumentHash: entry.deedDocumentHash,
            registrarApproverAddress: entry.registrarApprover,
            timestamp: BigInt(entry.timestamp.toString()),
            blockNumber: BigInt(entry.blockNumber.toString()),
          },
          create: {
            parcelId,
            historyIndex: Number(entry.historyIndex),
            fromOwnerAddress: entry.fromOwner,
            toOwnerAddress: entry.toOwner,
            transferType: entry.transferType,
            deedDocumentHash: entry.deedDocumentHash,
            registrarApproverAddress: entry.registrarApprover,
            timestamp: BigInt(entry.timestamp.toString()),
            blockNumber: BigInt(entry.blockNumber.toString()),
          }
        });
      }
    } catch (historyErr) {
      console.warn(`[Sync] Could not sync history for parcel ${parcelId}:`, historyErr);
    }

    // 3. Sync Active Transfer
    try {
      const activeTransfer = await contract.getActiveTransfer(parcelId);
      if (activeTransfer && activeTransfer.isActive) {
        const existingTransfer = await prisma.transferRequest.findFirst({
          where: { parcelId, isActive: true }
        });

        if (existingTransfer) {
          await prisma.transferRequest.update({
            where: { id: existingTransfer.id },
            data: {
              sellerAddress: activeTransfer.seller,
              buyerAddress: activeTransfer.buyer,
              saleConsideration: Number(activeTransfer.saleConsideration),
              saleDeedHash: activeTransfer.saleDeedHash,
              sellerApproved: activeTransfer.sellerApproved,
              buyerAccepted: activeTransfer.buyerAccepted,
              govtApproved: activeTransfer.govtApproved,
              registrarApproverAddress: activeTransfer.registrarApprover,
              initiatedTimestamp: BigInt(activeTransfer.initiatedTimestamp.toString()),
              expiryTimestamp: BigInt(activeTransfer.expiryTimestamp.toString()),
              completedTimestamp: BigInt(activeTransfer.completedTimestamp.toString()),
              isActive: activeTransfer.isActive,
            }
          });
        } else {
          await prisma.transferRequest.create({
            data: {
              parcelId,
              sellerAddress: activeTransfer.seller,
              buyerAddress: activeTransfer.buyer,
              saleConsideration: Number(activeTransfer.saleConsideration),
              saleDeedHash: activeTransfer.saleDeedHash,
              sellerApproved: activeTransfer.sellerApproved,
              buyerAccepted: activeTransfer.buyerAccepted,
              govtApproved: activeTransfer.govtApproved,
              registrarApproverAddress: activeTransfer.registrarApprover,
              initiatedTimestamp: BigInt(activeTransfer.initiatedTimestamp.toString()),
              expiryTimestamp: BigInt(activeTransfer.expiryTimestamp.toString()),
              completedTimestamp: BigInt(activeTransfer.completedTimestamp.toString()),
              isActive: activeTransfer.isActive,
            }
          });
        }
      }
    } catch (transferErr) {
      // No active transfer or error
    }

    // 4. Sync Mortgages
    try {
      const mortgageIds = await contract.getParcelMortgageIds(parcelId);
      for (const mId of mortgageIds) {
        const mRecord = await contract.getMortgage(mId);
        if (mRecord && mRecord.mortgageId) {
          await prisma.mortgageRecord.upsert({
            where: {
              parcelId_mortgageIdOnChain: {
                parcelId,
                mortgageIdOnChain: mId
              }
            },
            update: {
              bankName: mRecord.bankName,
              loanReferenceNumber: mRecord.loanReferenceNumber,
              loanAmount: Number(mRecord.loanAmount),
              mortgageDocHash: mRecord.mortgageDocHash,
              bankOfficerAddress: mRecord.bankOfficer,
              isActive: mRecord.isActive,
              timestamp: BigInt(mRecord.timestamp.toString()),
            },
            create: {
              parcelId,
              mortgageIdOnChain: mId,
              bankName: mRecord.bankName,
              loanReferenceNumber: mRecord.loanReferenceNumber,
              loanAmount: Number(mRecord.loanAmount),
              mortgageDocHash: mRecord.mortgageDocHash,
              bankOfficerAddress: mRecord.bankOfficer,
              isActive: mRecord.isActive,
              timestamp: BigInt(mRecord.timestamp.toString()),
            }
          });
        }
      }
    } catch (mortgageErr) {
      // ignore
    }

    // 5. Sync Disputes
    try {
      const disputeIds = await contract.getParcelDisputeIds(parcelId);
      for (const dId of disputeIds) {
        const dRecord = await contract.getDispute(dId);
        if (dRecord && dRecord.disputeId) {
          await prisma.disputeRecord.upsert({
            where: {
              parcelId_disputeIdOnChain: {
                parcelId,
                disputeIdOnChain: dId
              }
            },
            update: {
              courtName: dRecord.courtName,
              caseNumber: dRecord.caseNumber,
              courtOrderHash: dRecord.courtOrderHash,
              disputeReason: dRecord.disputeReason,
              judgeSignerAddress: dRecord.judgeSigner,
              isActive: dRecord.isActive,
              timestamp: BigInt(dRecord.timestamp.toString()),
            },
            create: {
              parcelId,
              disputeIdOnChain: dId,
              courtName: dRecord.courtName,
              caseNumber: dRecord.caseNumber,
              courtOrderHash: dRecord.courtOrderHash,
              disputeReason: dRecord.disputeReason,
              judgeSignerAddress: dRecord.judgeSigner,
              isActive: dRecord.isActive,
              timestamp: BigInt(dRecord.timestamp.toString()),
            }
          });
        }
      }
    } catch (disputeErr) {
      // ignore
    }

    // 6. Sync Ownership Recovery Requests
    try {
      const recoveryData = await contract.getRecoveryRequest(parcelId);
      if (recoveryData && recoveryData.parcelId && recoveryData.parcelId.length > 0) {
        const existingRecovery = await prisma.recoveryRequest.findFirst({
          where: { parcelId, isActive: true }
        });

        if (existingRecovery) {
          await prisma.recoveryRequest.update({
            where: { id: existingRecovery.id },
            data: {
              currentRecordedOwnerAddress: recoveryData.currentRecordedOwner,
              proposedNewOwnerAddress: recoveryData.proposedNewOwner,
              recoveryReasonDocHash: recoveryData.recoveryReasonDocHash,
              registrarApproved: recoveryData.registrarApproved,
              judiciaryApproved: recoveryData.judiciaryApproved,
              registrarSignerAddress: recoveryData.registrarSigner,
              judiciarySignerAddress: recoveryData.judiciarySigner,
              requestedTimestamp: BigInt(recoveryData.requestedTimestamp.toString()),
              challengeEndTime: BigInt(recoveryData.challengeEndTime.toString()),
              isFinalized: recoveryData.isFinalized,
              isActive: recoveryData.isActive,
            }
          });
        } else {
          await prisma.recoveryRequest.create({
            data: {
              parcelId,
              currentRecordedOwnerAddress: recoveryData.currentRecordedOwner,
              proposedNewOwnerAddress: recoveryData.proposedNewOwner,
              recoveryReasonDocHash: recoveryData.recoveryReasonDocHash,
              registrarApproved: recoveryData.registrarApproved,
              judiciaryApproved: recoveryData.judiciaryApproved,
              registrarSignerAddress: recoveryData.registrarSigner,
              judiciarySignerAddress: recoveryData.judiciarySigner,
              requestedTimestamp: BigInt(recoveryData.requestedTimestamp.toString()),
              challengeEndTime: BigInt(recoveryData.challengeEndTime.toString()),
              isFinalized: recoveryData.isFinalized,
              isActive: recoveryData.isActive,
            }
          });
        }
      }
    } catch (recoveryErr) {
      // ignore
    }

    return parcel;
  } catch (error) {
    console.error(`[Sync] Failed to sync parcel ${parcelId}:`, error);
    return null;
  }
};

/**
 * Service to sync full blockchain state to Prisma database.
 * Runs on server boot and can be triggered on a scheduled interval.
 */
export const syncBlockchainToDb = async () => {
  try {
    console.log("Starting blockchain to DB sync...");
    const contract = getContract();

    if (typeof contract.getTotalParcelsCount !== "function") {
      console.warn("Contract does not have getTotalParcelsCount function. Skipping sync.");
      return;
    }

    const totalParcelsCount = await contract.getTotalParcelsCount();
    console.log(`Found ${totalParcelsCount} parcels on chain.`);

    for (let i = 0; i < totalParcelsCount; i++) {
      const parcelId = await contract.getParcelIdByIndex(i);
      await syncParcelById(parcelId);
      console.log(`Synced parcel ${parcelId}`);
    }

    console.log("Blockchain to DB sync completed successfully.");
  } catch (error) {
    console.error("Error during blockchain sync:", error);
  }
};
