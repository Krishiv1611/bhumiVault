"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ethers_1 = require("ethers");
const bhumiVaultClient_1 = require("./bhumiVaultClient");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const client = new bhumiVaultClient_1.BhumiVaultClient(RPC_URL);
const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
// Default Hardhat Signer Private Keys for Demo / Prototype
const MOCK_KEYS = {
    admin: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    registrar: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    revenueOfficer: "0x5de4111afa1a4b939086698809337f92a4e8574d5386f68c3c13b2c286d9464e",
    bankOfficer: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    judge: "0x47e179ec197488593b100287e901656973a7b4612b5b3bee1460dd6e03f082c7",
};
// -------------------------------------------------------------
// 1. HEALTH & METADATA
// -------------------------------------------------------------
app.get("/api/health", async (req, res) => {
    try {
        const network = await provider.getNetwork();
        const blockNumber = await provider.getBlockNumber();
        res.json({
            status: "ONLINE",
            service: "BHUMI-VAULT Blockchain Gateway",
            network: network.name,
            chainId: Number(network.chainId),
            blockNumber,
        });
    }
    catch (err) {
        res.status(500).json({ status: "ERROR", message: err.message });
    }
});
// -------------------------------------------------------------
// 2. QUERY ENDPOINTS
// -------------------------------------------------------------
app.get("/api/property/:parcelId", async (req, res) => {
    try {
        const { parcelId } = req.params;
        const property = await client.getParcel(parcelId);
        res.json({ success: true, data: property });
    }
    catch (err) {
        res.status(404).json({ success: false, error: err.message });
    }
});
app.get("/api/property/:parcelId/history", async (req, res) => {
    try {
        const { parcelId } = req.params;
        const history = await client.getOwnershipHistory(parcelId);
        res.json({ success: true, data: history });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.get("/api/property/:parcelId/verify", async (req, res) => {
    try {
        const { parcelId } = req.params;
        const verification = await client.verifyTitle(parcelId);
        res.json({ success: true, data: verification });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.post("/api/property/verify-document", async (req, res) => {
    try {
        const { parcelId, documentText, documentHash } = req.body;
        let targetHash = documentHash;
        if (!targetHash && documentText) {
            targetHash = bhumiVaultClient_1.BhumiVaultClient.computeSHA256(documentText);
        }
        const isValid = await client.verifyDeedHash(parcelId, targetHash);
        res.json({ success: true, parcelId, documentHash: targetHash, isValid });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// -------------------------------------------------------------
// 3. REVENUE DEPARTMENT: GENESIS REGISTRATION
// -------------------------------------------------------------
app.post("/api/property/register", async (req, res) => {
    try {
        const { parcelId, stateCode, district, taluk, surveyNumber, areaSqMeters, landType, initialOwner, deedDocumentHash, boundaryCoordinatesHash, } = req.body;
        const signer = new ethers_1.Wallet(MOCK_KEYS.revenueOfficer, provider);
        const receipt = await client.registerGenesisParcel({
            parcelId,
            stateCode,
            district,
            taluk,
            surveyNumber,
            areaSqMeters,
            landType: Number(landType || 1),
            initialOwner,
            deedDocumentHash: deedDocumentHash || bhumiVaultClient_1.BhumiVaultClient.computeSHA256(`GENESIS_${parcelId}`),
            boundaryCoordinatesHash: boundaryCoordinatesHash || bhumiVaultClient_1.BhumiVaultClient.computeSHA256(`GEO_${parcelId}`),
        }, signer);
        res.json({
            success: true,
            message: `Parcel ${parcelId} registered successfully on blockchain`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// -------------------------------------------------------------
// 4. 2-KEY TRANSFER AUTHORIZATION ENGINE
// -------------------------------------------------------------
// Step 1: Owner initiates transfer (Standard Web3)
app.post("/api/transfer/initiate", async (req, res) => {
    try {
        const { parcelId, buyerAddress, saleConsideration, saleDeedHash, sellerPrivateKey } = req.body;
        const signer = new ethers_1.Wallet(sellerPrivateKey, provider);
        const receipt = await client.initiateTransfer(parcelId, buyerAddress, saleConsideration, saleDeedHash, signer);
        res.json({
            success: true,
            message: `Transfer initiated for ${parcelId} (Key 1 provided)`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// Step 1 (Gasless): Relayer submits off-chain EIP-712 signature for rural citizen
app.post("/api/transfer/initiate-gasless", async (req, res) => {
    try {
        const { parcelId, sellerAddress, buyerAddress, saleConsideration, saleDeedHash, deadline, sellerSignature } = req.body;
        const relayerSigner = new ethers_1.Wallet(MOCK_KEYS.registrar, provider);
        const receipt = await client.initiateTransferWithSignature(parcelId, sellerAddress, buyerAddress, saleConsideration, saleDeedHash, deadline, sellerSignature, relayerSigner);
        res.json({
            success: true,
            message: `Gasless Transfer initiated for ${parcelId} via EIP-712 signature`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// Step 2: Buyer accepts transfer
app.post("/api/transfer/accept", async (req, res) => {
    try {
        const { parcelId, buyerPrivateKey } = req.body;
        const signer = new ethers_1.Wallet(buyerPrivateKey, provider);
        const receipt = await client.buyerAcceptTransfer(parcelId, signer);
        res.json({
            success: true,
            message: `Buyer accepted transfer for ${parcelId}`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// Step 3: Sub-Registrar authorizes & commits transfer (Key 2)
app.post("/api/transfer/authorize", async (req, res) => {
    try {
        const { parcelId, registrarPrivateKey } = req.body;
        const signer = new ethers_1.Wallet(registrarPrivateKey || MOCK_KEYS.registrar, provider);
        const receipt = await client.authorizeAndCommitTransfer(parcelId, signer);
        res.json({
            success: true,
            message: `Transfer authorized by Government Sub-Registrar and committed to ledger!`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// -------------------------------------------------------------
// 5. BANK NODE: MORTGAGE LIENS
// -------------------------------------------------------------
app.post("/api/mortgage/apply", async (req, res) => {
    try {
        const { parcelId, bankName, loanReference, loanAmount, mortgageDocHash } = req.body;
        const signer = new ethers_1.Wallet(MOCK_KEYS.bankOfficer, provider);
        const mortgageId = await client.applyMortgage(parcelId, bankName, loanReference, loanAmount, mortgageDocHash || bhumiVaultClient_1.BhumiVaultClient.computeSHA256(`MORTGAGE_${loanReference}`), signer);
        res.json({
            success: true,
            message: `Bank mortgage lien placed on ${parcelId}. Transfers locked.`,
            mortgageId,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
app.post("/api/mortgage/release", async (req, res) => {
    try {
        const { parcelId, mortgageId, releaseDocHash } = req.body;
        const signer = new ethers_1.Wallet(MOCK_KEYS.bankOfficer, provider);
        const receipt = await client.releaseMortgage(parcelId, mortgageId, releaseDocHash || bhumiVaultClient_1.BhumiVaultClient.computeSHA256(`RELEASE_${parcelId}`), signer);
        res.json({
            success: true,
            message: `Bank mortgage NOC issued and lien released on ${parcelId}.`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// -------------------------------------------------------------
// 6. JUDICIARY NODE: COURT DISPUTE INJUNCTIONS
// -------------------------------------------------------------
app.post("/api/dispute/apply", async (req, res) => {
    try {
        const { parcelId, courtName, caseNumber, courtOrderHash, reason } = req.body;
        const signer = new ethers_1.Wallet(MOCK_KEYS.judge, provider);
        const disputeId = await client.applyDisputeInjunction(parcelId, courtName, caseNumber, courtOrderHash || bhumiVaultClient_1.BhumiVaultClient.computeSHA256(`COURT_ORDER_${caseNumber}`), reason, signer);
        res.json({
            success: true,
            message: `Judiciary Dispute Injunction applied on ${parcelId}. Property frozen.`,
            disputeId,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
app.post("/api/dispute/lift", async (req, res) => {
    try {
        const { parcelId, disputeId, judgmentDocHash } = req.body;
        const signer = new ethers_1.Wallet(MOCK_KEYS.judge, provider);
        const receipt = await client.liftDisputeInjunction(parcelId, disputeId, judgmentDocHash || bhumiVaultClient_1.BhumiVaultClient.computeSHA256(`JUDGMENT_${parcelId}`), signer);
        res.json({
            success: true,
            message: `Court dispute resolved and injunction lifted on ${parcelId}.`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// -------------------------------------------------------------
// 7. MULTI-SIG LOST KEY / INHERITANCE RECOVERY
// -------------------------------------------------------------
app.post("/api/recovery/initiate", async (req, res) => {
    try {
        const { parcelId, proposedNewOwner, recoveryReasonDocHash } = req.body;
        const signer = new ethers_1.Wallet(MOCK_KEYS.registrar, provider);
        const receipt = await client.initiateOwnershipRecovery(parcelId, proposedNewOwner, recoveryReasonDocHash || bhumiVaultClient_1.BhumiVaultClient.computeSHA256(`RECOVERY_${parcelId}`), signer);
        res.json({
            success: true,
            message: `Recovery initiated by Sub-Registrar (1 of 2 signatures). Waiting for District Court Judge approval.`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
app.post("/api/recovery/approve", async (req, res) => {
    try {
        const { parcelId } = req.body;
        const signer = new ethers_1.Wallet(MOCK_KEYS.judge, provider);
        const receipt = await client.approveOwnershipRecovery(parcelId, signer);
        res.json({
            success: true,
            message: `Recovery approved by District Court Judge (2 of 2 signatures). Ownership re-assigned on blockchain!`,
            transactionHash: receipt?.hash,
        });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});
// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 BhumiVault Blockchain REST Gateway running at http://localhost:${PORT}`);
    });
}
exports.default = app;
