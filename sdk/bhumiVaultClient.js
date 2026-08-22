"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BhumiVaultClient = exports.LandType = void 0;
const ethers_1 = require("ethers");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Interface Definitions
var LandType;
(function (LandType) {
    LandType[LandType["AGRICULTURAL"] = 0] = "AGRICULTURAL";
    LandType[LandType["RESIDENTIAL"] = 1] = "RESIDENTIAL";
    LandType[LandType["COMMERCIAL"] = 2] = "COMMERCIAL";
    LandType[LandType["INDUSTRIAL"] = 3] = "INDUSTRIAL";
    LandType[LandType["GOVERNMENT_RESERVED"] = 4] = "GOVERNMENT_RESERVED";
})(LandType || (exports.LandType = LandType = {}));
class BhumiVaultClient {
    provider;
    contractAddress;
    contractAbi;
    contract;
    constructor(rpcUrl = "http://127.0.0.1:8545", contractAddress, customAbi) {
        this.provider = new ethers_1.JsonRpcProvider(rpcUrl);
        // Try loading from exported artifacts if not provided
        if (!contractAddress || !customAbi) {
            try {
                const artifactsPath = path.join(__dirname, "contractArtifacts.json");
                if (fs.existsSync(artifactsPath)) {
                    const artifacts = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
                    this.contractAddress = contractAddress || artifacts.contractAddress;
                    this.contractAbi = customAbi || artifacts.abi;
                }
                else {
                    this.contractAddress = contractAddress || "";
                    this.contractAbi = customAbi || [];
                }
            }
            catch {
                this.contractAddress = contractAddress || "";
                this.contractAbi = customAbi || [];
            }
        }
        else {
            this.contractAddress = contractAddress;
            this.contractAbi = customAbi;
        }
        this.contract = new ethers_1.Contract(this.contractAddress, this.contractAbi, this.provider);
    }
    /**
     * Helper utility to compute SHA-256 hash of a file buffer or string.
     */
    static computeSHA256(data) {
        return crypto.createHash("sha256").update(data).digest("hex");
    }
    /**
     * Returns a connected signer instance using a private key.
     */
    getSigner(privateKey) {
        return new ethers_1.Wallet(privateKey, this.provider);
    }
    // -------------------------------------------------------------
    // WRITE OPERATIONS
    // -------------------------------------------------------------
    /**
     * Register a new verified genesis land parcel (Revenue / Registrar only).
     */
    async registerGenesisParcel(params, signer) {
        const contractWithSigner = this.contract.connect(signer);
        const tx = await contractWithSigner.registerGenesisParcel(params.parcelId, params.stateCode, params.district, params.taluk, params.surveyNumber, params.areaSqMeters, params.landType, params.initialOwner, params.deedDocumentHash, params.boundaryCoordinatesHash);
        return await tx.wait();
    }
    /**
     * Step 1 (Standard): Owner initiates transfer on-chain with attached sale deed SHA-256 hash.
     */
    async initiateTransfer(parcelId, buyerAddress, saleConsideration, saleDeedHash, sellerSigner) {
        const contractWithSigner = this.contract.connect(sellerSigner);
        const tx = await contractWithSigner.initiateTransfer(parcelId, buyerAddress, saleConsideration, saleDeedHash);
        return await tx.wait();
    }
    /**
     * Generates off-chain EIP-712 signature for gasless transfer authorization (Rural citizen mode).
     */
    async signTransferIntent(parcelId, buyerAddress, saleConsideration, saleDeedHash, sellerWallet, deadline) {
        const network = await this.provider.getNetwork();
        const domain = {
            name: "BhumiVaultRegistry",
            version: "1.0.0",
            chainId: Number(network.chainId),
            verifyingContract: this.contractAddress,
        };
        const types = {
            TransferAuthorization: [
                { name: "parcelId", type: "string" },
                { name: "buyer", type: "address" },
                { name: "saleConsideration", type: "uint256" },
                { name: "saleDeedHash", type: "string" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const nonce = await this.contract.userNonces(sellerWallet.address);
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
    async initiateTransferWithSignature(parcelId, sellerAddress, buyerAddress, saleConsideration, saleDeedHash, deadline, sellerSignature, relayerSigner) {
        const contractWithSigner = this.contract.connect(relayerSigner);
        const tx = await contractWithSigner.initiateTransferWithSignature(parcelId, sellerAddress, buyerAddress, saleConsideration, saleDeedHash, deadline, sellerSignature);
        return await tx.wait();
    }
    /**
     * Step 2: Buyer accepts terms of transfer.
     */
    async buyerAcceptTransfer(parcelId, buyerSigner) {
        const contractWithSigner = this.contract.connect(buyerSigner);
        const tx = await contractWithSigner.buyerAcceptTransfer(parcelId);
        return await tx.wait();
    }
    /**
     * Generates off-chain EIP-712 signature for gasless buyer acceptance.
     */
    async signBuyerAcceptIntent(parcelId, sellerAddress, buyerWallet, deadline) {
        const network = await this.provider.getNetwork();
        const domain = {
            name: "BhumiVaultRegistry",
            version: "1.0.0",
            chainId: Number(network.chainId),
            verifyingContract: this.contractAddress,
        };
        const types = {
            TransferAcceptance: [
                { name: "parcelId", type: "string" },
                { name: "seller", type: "address" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const nonce = await this.contract.userNonces(buyerWallet.address);
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
    async buyerAcceptTransferWithSignature(parcelId, deadline, buyerSignature, relayerSigner) {
        const contractWithSigner = this.contract.connect(relayerSigner);
        const tx = await contractWithSigner.buyerAcceptTransferWithSignature(parcelId, deadline, buyerSignature);
        return await tx.wait();
    }
    /**
     * Step 3: Government Sub-Registrar authorizes and commits ownership mutation.
     */
    async authorizeAndCommitTransfer(parcelId, registrarSigner) {
        const contractWithSigner = this.contract.connect(registrarSigner);
        const tx = await contractWithSigner.authorizeAndCommitTransfer(parcelId);
        return await tx.wait();
    }
    /**
     * Cancel an active transfer request.
     */
    async cancelTransfer(parcelId, reason, signer) {
        const contractWithSigner = this.contract.connect(signer);
        const tx = await contractWithSigner.cancelTransferRequest(parcelId, reason);
        return await tx.wait();
    }
    /**
     * Bank places mortgage lien on property.
     */
    async applyMortgage(parcelId, bankName, loanRef, loanAmount, mortgageDocHash, bankSigner) {
        const contractWithSigner = this.contract.connect(bankSigner);
        const tx = await contractWithSigner.applyMortgage(parcelId, bankName, loanRef, loanAmount, mortgageDocHash);
        const receipt = await tx.wait();
        // Parse MortgageApplied event
        const event = receipt.logs.find((log) => {
            try {
                const parsed = this.contract.interface.parseLog(log);
                return parsed?.name === "MortgageApplied";
            }
            catch {
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
    async releaseMortgage(parcelId, mortgageId, releaseDocHash, bankSigner) {
        const contractWithSigner = this.contract.connect(bankSigner);
        const tx = await contractWithSigner.releaseMortgage(parcelId, mortgageId, releaseDocHash);
        return await tx.wait();
    }
    /**
     * Judiciary / Court places dispute injunction.
     */
    async applyDisputeInjunction(parcelId, courtName, caseNumber, courtOrderHash, reason, judgeSigner) {
        const contractWithSigner = this.contract.connect(judgeSigner);
        const tx = await contractWithSigner.applyDisputeInjunction(parcelId, courtName, caseNumber, courtOrderHash, reason);
        const receipt = await tx.wait();
        const event = receipt.logs.find((log) => {
            try {
                const parsed = this.contract.interface.parseLog(log);
                return parsed?.name === "DisputeInjunctionApplied";
            }
            catch {
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
    async liftDisputeInjunction(parcelId, disputeId, judgmentDocHash, judgeSigner) {
        const contractWithSigner = this.contract.connect(judgeSigner);
        const tx = await contractWithSigner.liftDisputeInjunction(parcelId, disputeId, judgmentDocHash);
        return await tx.wait();
    }
    /**
     * Initiate Government-Assisted Lost Key / Inheritance Recovery (Registrar or Court).
     */
    async initiateOwnershipRecovery(parcelId, proposedNewOwner, recoveryReasonDocHash, initiatorSigner) {
        const contractWithSigner = this.contract.connect(initiatorSigner);
        const tx = await contractWithSigner.initiateOwnershipRecovery(parcelId, proposedNewOwner, recoveryReasonDocHash);
        return await tx.wait();
    }
    /**
     * Approve Government-Assisted Recovery (Sub-Registrar or Court Judge).
     */
    async approveOwnershipRecovery(parcelId, approverSigner) {
        const contractWithSigner = this.contract.connect(approverSigner);
        const tx = await contractWithSigner.approveOwnershipRecovery(parcelId);
        return await tx.wait();
    }
    /**
     * Finalize Government-Assisted Recovery after 30-day challenge period.
     */
    async finalizeOwnershipRecovery(parcelId, finalizerSigner) {
        const contractWithSigner = this.contract.connect(finalizerSigner);
        const tx = await contractWithSigner.finalizeOwnershipRecovery(parcelId);
        return await tx.wait();
    }
    // -------------------------------------------------------------
    // READ / VERIFICATION QUERIES
    // -------------------------------------------------------------
    async getParcel(parcelId) {
        const p = await this.contract.getParcel(parcelId);
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
    async getOwnershipHistory(parcelId) {
        const entries = await this.contract.getOwnershipHistory(parcelId);
        return entries.map((e) => ({
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
    async verifyTitle(parcelId) {
        const res = await this.contract.verifyTitle(parcelId);
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
    async verifyDeedHash(parcelId, testHash) {
        return await this.contract.verifyDeedHash(parcelId, testHash);
    }
    async getActiveTransfer(parcelId) {
        const req = await this.contract.getActiveTransfer(parcelId);
        if (!req.isActive)
            return null;
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
    async getRecoveryRequest(parcelId) {
        const req = await this.contract.getRecoveryRequest(parcelId);
        if (!req.isActive && !req.isFinalized)
            return null;
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
exports.BhumiVaultClient = BhumiVaultClient;
