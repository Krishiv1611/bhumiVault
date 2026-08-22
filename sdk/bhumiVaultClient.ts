import { ethers, Contract, JsonRpcProvider, Signer, Wallet, TypedDataDomain, TypedDataField } from "ethers";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// Interface Definitions
export enum LandType {
  AGRICULTURAL = 0,
  RESIDENTIAL = 1,
  COMMERCIAL = 2,
  INDUSTRIAL = 3,
  GOVERNMENT_RESERVED = 4,
}

export interface LandParcelData {
  parcelId: string;
  stateCode: string;
  district: string;
  taluk: string;
  surveyNumber: string;
  areaSqMeters: number | bigint;
  landType: LandType;
  currentOwner: string;
  deedDocumentHash: string;
  boundaryCoordinatesHash: string;
  activeMortgagesCount: number;
  activeDisputesCount: number;
  isLocked: boolean;
  exists: boolean;
  creationTimestamp: number | bigint;
  lastUpdatedTimestamp: number | bigint;
}

export interface TransferRequestData {
  parcelId: string;
  seller: string;
  buyer: string;
  saleConsideration: number | bigint;
  saleDeedHash: string;
  sellerApproved: boolean;
  buyerAccepted: boolean;
  govtApproved: boolean;
  registrarApprover: string;
  initiatedTimestamp: number | bigint;
  expiryTimestamp: number | bigint;
  completedTimestamp: number | bigint;
  isActive: boolean;
}

export interface OwnershipRecoveryRequestData {
  parcelId: string;
  currentRecordedOwner: string;
  proposedNewOwner: string;
  recoveryReasonDocHash: string;
  registrarApproved: boolean;
  judiciaryApproved: boolean;
  registrarSigner: string;
  judiciarySigner: string;
  requestedTimestamp: number;
  challengeEndTime: number;
  isFinalized: boolean;
  isActive: boolean;
}

export interface OwnershipHistoryData {
  historyIndex: number;
  parcelId: string;
  fromOwner: string;
  toOwner: string;
  transferType: string;
  deedDocumentHash: string;
  registrarApprover: string;
  timestamp: number;
  blockNumber: number;
}

export interface TitleVerificationResult {
  isCleanTitle: boolean;
  currentOwner: string;
  isMortgaged: boolean;
  isDisputed: boolean;
  isLocked: boolean;
  activeMortgageCount: number;
  activeDisputeCount: number;
  historyCount: number;
  currentDeedHash: string;
}

export class BhumiVaultClient {
  private provider: JsonRpcProvider;
  private contractAddress: string;
  private contractAbi: any[];
  private contract: Contract;

  constructor(
    rpcUrl: string = "http://127.0.0.1:8545",
    contractAddress?: string,
    customAbi?: any[]
  ) {
    this.provider = new JsonRpcProvider(rpcUrl);

    // Try loading from exported artifacts if not provided
    if (!contractAddress || !customAbi) {
      try {
        const artifactsPath = path.join(__dirname, "contractArtifacts.json");
        if (fs.existsSync(artifactsPath)) {
          const artifacts = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
          this.contractAddress = contractAddress || artifacts.contractAddress;
          this.contractAbi = customAbi || artifacts.abi;
        } else {
          this.contractAddress = contractAddress || "";
          this.contractAbi = customAbi || [];
        }
      } catch {
        this.contractAddress = contractAddress || "";
        this.contractAbi = customAbi || [];
      }
    } else {
      this.contractAddress = contractAddress;
      this.contractAbi = customAbi;
    }

    this.contract = new Contract(this.contractAddress, this.contractAbi, this.provider);
  }

  /**
   * Helper utility to compute SHA-256 hash of a file buffer or string.
   */
  public static computeSHA256(data: Buffer | string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Returns a connected signer instance using a private key.
   */
  public getSigner(privateKey: string): Wallet {
    return new Wallet(privateKey, this.provider);
  }

  // -------------------------------------------------------------
  // WRITE OPERATIONS
  // -------------------------------------------------------------

  /**
   * Register a new verified genesis land parcel (Revenue / Registrar only).
   */
  async registerGenesisParcel(
    params: {
      parcelId: string;
      stateCode: string;
      district: string;
      taluk: string;
      surveyNumber: string;
      areaSqMeters: number;
      landType: LandType;
      initialOwner: string;
      deedDocumentHash: string;
      boundaryCoordinatesHash: string;
    },
    signer: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(signer) as any;
    const tx = await contractWithSigner.registerGenesisParcel(
      params.parcelId,
      params.stateCode,
      params.district,
      params.taluk,
      params.surveyNumber,
      params.areaSqMeters,
      params.landType,
      params.initialOwner,
      params.deedDocumentHash,
      params.boundaryCoordinatesHash
    );
    return await tx.wait();
  }

  /**
   * Step 1 (Standard): Owner initiates transfer on-chain with attached sale deed SHA-256 hash.
   */
  async initiateTransfer(
    parcelId: string,
    buyerAddress: string,
    saleConsideration: number,
    saleDeedHash: string,
    sellerSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(sellerSigner) as any;
    const tx = await contractWithSigner.initiateTransfer(
      parcelId,
      buyerAddress,
      saleConsideration,
      saleDeedHash
    );
    return await tx.wait();
  }

  /**
   * Generates off-chain EIP-712 signature for gasless transfer authorization (Rural citizen mode).
   */
  async signTransferIntent(
    parcelId: string,
    buyerAddress: string,
    saleConsideration: number,
    saleDeedHash: string,
    sellerWallet: Wallet,
    deadline: number
  ): Promise<string> {
    const network = await this.provider.getNetwork();
    const domain: TypedDataDomain = {
      name: "BhumiVaultRegistry",
      version: "1.0.0",
      chainId: Number(network.chainId),
      verifyingContract: this.contractAddress,
    };

    const types: Record<string, TypedDataField[]> = {
      TransferAuthorization: [
        { name: "parcelId", type: "string" },
        { name: "buyer", type: "address" },
        { name: "saleConsideration", type: "uint256" },
        { name: "saleDeedHash", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const nonce = await (this.contract as any).userNonces(sellerWallet.address);

    const value = {
      parcelId,
      buyer: buyerAddress,
      saleConsideration,
      saleDeedHash,
      nonce: Number(nonce),
      deadline,
    };

    return await sellerWallet.signTypedData(domain, types, value);
  }

  /**
   * Step 1 (Gasless Relayer): Submits owner's off-chain EIP-712 signature.
   */
  async initiateTransferWithSignature(
    parcelId: string,
    sellerAddress: string,
    buyerAddress: string,
    saleConsideration: number,
    saleDeedHash: string,
    deadline: number,
    sellerSignature: string,
    relayerSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(relayerSigner) as any;
    const tx = await contractWithSigner.initiateTransferWithSignature(
      parcelId,
      sellerAddress,
      buyerAddress,
      saleConsideration,
      saleDeedHash,
      deadline,
      sellerSignature
    );
    return await tx.wait();
  }

  /**
   * Step 2: Buyer accepts terms of transfer.
   */
  async buyerAcceptTransfer(
    parcelId: string,
    buyerSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(buyerSigner) as any;
    const tx = await contractWithSigner.buyerAcceptTransfer(parcelId);
    return await tx.wait();
  }

  /**
   * Generates off-chain EIP-712 signature for gasless buyer acceptance.
   */
  async signBuyerAcceptIntent(
    parcelId: string,
    sellerAddress: string,
    buyerWallet: Wallet,
    deadline: number
  ): Promise<string> {
    const network = await this.provider.getNetwork();
    const domain: TypedDataDomain = {
      name: "BhumiVaultRegistry",
      version: "1.0.0",
      chainId: Number(network.chainId),
      verifyingContract: this.contractAddress,
    };

    const types: Record<string, TypedDataField[]> = {
      TransferAcceptance: [
        { name: "parcelId", type: "string" },
        { name: "seller", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const nonce = await (this.contract as any).userNonces(buyerWallet.address);

    const value = {
      parcelId,
      seller: sellerAddress,
      nonce: Number(nonce),
      deadline,
    };

    return await buyerWallet.signTypedData(domain, types, value);
  }

  /**
   * Step 2 (Gasless Relayer): Submits buyer's off-chain EIP-712 signature.
   */
  async buyerAcceptTransferWithSignature(
    parcelId: string,
    deadline: number,
    buyerSignature: string,
    relayerSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(relayerSigner) as any;
    const tx = await contractWithSigner.buyerAcceptTransferWithSignature(
      parcelId,
      deadline,
      buyerSignature
    );
    return await tx.wait();
  }

  /**
   * Step 3: Government Sub-Registrar authorizes and commits ownership mutation.
   */
  async authorizeAndCommitTransfer(
    parcelId: string,
    registrarSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(registrarSigner) as any;
    const tx = await contractWithSigner.authorizeAndCommitTransfer(parcelId);
    return await tx.wait();
  }

  /**
   * Cancel an active transfer request.
   */
  async cancelTransfer(
    parcelId: string,
    reason: string,
    signer: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(signer) as any;
    const tx = await contractWithSigner.cancelTransferRequest(parcelId, reason);
    return await tx.wait();
  }

  /**
   * Bank places mortgage lien on property.
   */
  async applyMortgage(
    parcelId: string,
    bankName: string,
    loanRef: string,
    loanAmount: number,
    mortgageDocHash: string,
    bankSigner: Signer
  ): Promise<string> {
    const contractWithSigner = this.contract.connect(bankSigner) as any;
    const tx = await contractWithSigner.applyMortgage(
      parcelId,
      bankName,
      loanRef,
      loanAmount,
      mortgageDocHash
    );
    const receipt = await tx.wait();
    // Parse MortgageApplied event
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        return parsed?.name === "MortgageApplied";
      } catch {
        return false;
      }
    });
    if (event) {
      const parsed = this.contract.interface.parseLog(event);
      return parsed?.args.mortgageId;
    }
    return "";
  }

  /**
   * Bank releases mortgage lien upon loan clearance.
   */
  async releaseMortgage(
    parcelId: string,
    mortgageId: string,
    releaseDocHash: string,
    bankSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(bankSigner) as any;
    const tx = await contractWithSigner.releaseMortgage(parcelId, mortgageId, releaseDocHash);
    return await tx.wait();
  }

  /**
   * Judiciary / Court places dispute injunction.
   */
  async applyDisputeInjunction(
    parcelId: string,
    courtName: string,
    caseNumber: string,
    courtOrderHash: string,
    reason: string,
    judgeSigner: Signer
  ): Promise<string> {
    const contractWithSigner = this.contract.connect(judgeSigner) as any;
    const tx = await contractWithSigner.applyDisputeInjunction(
      parcelId,
      courtName,
      caseNumber,
      courtOrderHash,
      reason
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        return parsed?.name === "DisputeInjunctionApplied";
      } catch {
        return false;
      }
    });
    if (event) {
      const parsed = this.contract.interface.parseLog(event);
      return parsed?.args.disputeId;
    }
    return "";
  }

  /**
   * Judiciary / Court lifts dispute injunction.
   */
  async liftDisputeInjunction(
    parcelId: string,
    disputeId: string,
    judgmentDocHash: string,
    judgeSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(judgeSigner) as any;
    const tx = await contractWithSigner.liftDisputeInjunction(parcelId, disputeId, judgmentDocHash);
    return await tx.wait();
  }

  /**
   * Initiate Government-Assisted Lost Key / Inheritance Recovery (Registrar or Court).
   */
  async initiateOwnershipRecovery(
    parcelId: string,
    proposedNewOwner: string,
    recoveryReasonDocHash: string,
    initiatorSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(initiatorSigner) as any;
    const tx = await contractWithSigner.initiateOwnershipRecovery(
      parcelId,
      proposedNewOwner,
      recoveryReasonDocHash
    );
    return await tx.wait();
  }

  /**
   * Approve Government-Assisted Recovery (Sub-Registrar or Court Judge).
   */
  async approveOwnershipRecovery(
    parcelId: string,
    approverSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(approverSigner) as any;
    const tx = await contractWithSigner.approveOwnershipRecovery(parcelId);
    return await tx.wait();
  }

  /**
   * Finalize Government-Assisted Recovery after 30-day challenge period.
   */
  async finalizeOwnershipRecovery(
    parcelId: string,
    finalizerSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(finalizerSigner) as any;
    const tx = await contractWithSigner.finalizeOwnershipRecovery(parcelId);
    return await tx.wait();
  }

  // -------------------------------------------------------------
  // READ / VERIFICATION QUERIES
  // -------------------------------------------------------------

  async getParcel(parcelId: string): Promise<LandParcelData> {
    const p = await (this.contract as any).getParcel(parcelId);
    return {
      parcelId: p.parcelId,
      stateCode: p.stateCode,
      district: p.district,
      taluk: p.taluk,
      surveyNumber: p.surveyNumber,
      areaSqMeters: Number(p.areaSqMeters),
      landType: Number(p.landType),
      currentOwner: p.currentOwner,
      deedDocumentHash: p.deedDocumentHash,
      boundaryCoordinatesHash: p.boundaryCoordinatesHash,
      activeMortgagesCount: Number(p.activeMortgagesCount),
      activeDisputesCount: Number(p.activeDisputesCount),
      isLocked: p.isLocked,
      exists: p.exists,
      creationTimestamp: Number(p.creationTimestamp),
      lastUpdatedTimestamp: Number(p.lastUpdatedTimestamp),
    };
  }

  async getOwnershipHistory(parcelId: string): Promise<OwnershipHistoryData[]> {
    const entries = await (this.contract as any).getOwnershipHistory(parcelId);
    return entries.map((e: any) => ({
      historyIndex: Number(e.historyIndex),
      parcelId: e.parcelId,
      fromOwner: e.fromOwner,
      toOwner: e.toOwner,
      transferType: e.transferType,
      deedDocumentHash: e.deedDocumentHash,
      registrarApprover: e.registrarApprover,
      timestamp: Number(e.timestamp),
      blockNumber: Number(e.blockNumber),
    }));
  }

  async verifyTitle(parcelId: string): Promise<TitleVerificationResult> {
    const res = await (this.contract as any).verifyTitle(parcelId);
    return {
      isCleanTitle: res.isCleanTitle,
      currentOwner: res.currentOwner,
      isMortgaged: res.isMortgaged,
      isDisputed: res.isDisputed,
      isLocked: res.isLocked,
      activeMortgageCount: Number(res.activeMortgageCount),
      activeDisputeCount: Number(res.activeDisputeCount),
      historyCount: Number(res.historyCount),
      currentDeedHash: res.currentDeedHash,
    };
  }

  async verifyDeedHash(parcelId: string, testHash: string): Promise<boolean> {
    return await (this.contract as any).verifyDeedHash(parcelId, testHash);
  }

  async getActiveTransfer(parcelId: string): Promise<TransferRequestData | null> {
    const req = await (this.contract as any).getActiveTransfer(parcelId);
    if (!req.isActive) return null;
    return {
      parcelId: req.parcelId,
      seller: req.seller,
      buyer: req.buyer,
      saleConsideration: Number(req.saleConsideration),
      saleDeedHash: req.saleDeedHash,
      sellerApproved: req.sellerApproved,
      buyerAccepted: req.buyerAccepted,
      govtApproved: req.govtApproved,
      registrarApprover: req.registrarApprover,
      initiatedTimestamp: Number(req.initiatedTimestamp),
      expiryTimestamp: Number(req.expiryTimestamp),
      completedTimestamp: Number(req.completedTimestamp),
      isActive: req.isActive,
    };
  }

  async getRecoveryRequest(parcelId: string): Promise<OwnershipRecoveryRequestData | null> {
    const req = await (this.contract as any).getRecoveryRequest(parcelId);
    if (!req.isActive && !req.isFinalized) return null;
    return {
      parcelId: req.parcelId,
      currentRecordedOwner: req.currentRecordedOwner,
      proposedNewOwner: req.proposedNewOwner,
      recoveryReasonDocHash: req.recoveryReasonDocHash,
      registrarApproved: req.registrarApproved,
      judiciaryApproved: req.judiciaryApproved,
      registrarSigner: req.registrarSigner,
      judiciarySigner: req.judiciarySigner,
      requestedTimestamp: Number(req.requestedTimestamp),
      challengeEndTime: Number(req.challengeEndTime),
      isFinalized: req.isFinalized,
      isActive: req.isActive,
    };
  }
}
