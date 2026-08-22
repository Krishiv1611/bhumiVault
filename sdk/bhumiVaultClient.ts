import { ethers, Contract, JsonRpcProvider, Signer, Wallet } from "ethers";
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
  isMortgaged: boolean;
  isDisputed: boolean;
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
  completedTimestamp: number | bigint;
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
   * Helper utility to compute SHA-256 hash of a file buffer or string (Sale Deed / Land Title).
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
   * Step 1: Seller initiates land transfer with attached sale deed SHA-256 hash.
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
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(bankSigner) as any;
    const tx = await contractWithSigner.applyMortgage(
      parcelId,
      bankName,
      loanRef,
      loanAmount,
      mortgageDocHash
    );
    return await tx.wait();
  }

  /**
   * Bank releases mortgage lien upon loan clearance.
   */
  async releaseMortgage(
    parcelId: string,
    releaseDocHash: string,
    bankSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(bankSigner) as any;
    const tx = await contractWithSigner.releaseMortgage(parcelId, releaseDocHash);
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
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(judgeSigner) as any;
    const tx = await contractWithSigner.applyDisputeInjunction(
      parcelId,
      courtName,
      caseNumber,
      courtOrderHash,
      reason
    );
    return await tx.wait();
  }

  /**
   * Judiciary / Court lifts dispute injunction.
   */
  async liftDisputeInjunction(
    parcelId: string,
    judgmentDocHash: string,
    judgeSigner: Signer
  ): Promise<ethers.ContractTransactionReceipt | null> {
    const contractWithSigner = this.contract.connect(judgeSigner) as any;
    const tx = await contractWithSigner.liftDisputeInjunction(parcelId, judgmentDocHash);
    return await tx.wait();
  }

  // -------------------------------------------------------------
  // READ / VERIFICATION QUERIES
  // -------------------------------------------------------------

  /**
   * Get complete details of a registered land parcel.
   */
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
      isMortgaged: p.isMortgaged,
      isDisputed: p.isDisputed,
      isLocked: p.isLocked,
      exists: p.exists,
      creationTimestamp: Number(p.creationTimestamp),
      lastUpdatedTimestamp: Number(p.lastUpdatedTimestamp),
    };
  }

  /**
   * Get full chronological ownership chain of title.
   */
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

  /**
   * Fast public title verification (checks clean title, mortgage, dispute, freeze).
   */
  async verifyTitle(parcelId: string): Promise<TitleVerificationResult> {
    const result = await (this.contract as any).verifyTitle(parcelId);
    return {
      isCleanTitle: result[0],
      currentOwner: result[1],
      isMortgaged: result[2],
      isDisputed: result[3],
      isLocked: result[4],
      historyCount: Number(result[5]),
      currentDeedHash: result[6],
    };
  }

  /**
   * Verify if a document hash matches the recorded title deed.
   */
  async verifyDeedHash(parcelId: string, testHash: string): Promise<boolean> {
    return await (this.contract as any).verifyDeedHash(parcelId, testHash);
  }

  /**
   * Get active transfer request details.
   */
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
      completedTimestamp: Number(req.completedTimestamp),
      isActive: req.isActive,
    };
  }
}
