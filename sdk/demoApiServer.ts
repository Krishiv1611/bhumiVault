import express, { Request, Response } from "express";
import cors from "cors";
import { ethers, Wallet } from "ethers";
import { BhumiVaultClient } from "./bhumiVaultClient";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const client = new BhumiVaultClient(RPC_URL);
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Default Hardhat Signer Private Keys for Demo / Prototype
// In production, each stakeholder provides their own signature / private key
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
app.get("/api/health", async (req: Request, res: Response) => {
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
  } catch (err: any) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

// -------------------------------------------------------------
// 2. QUERY ENDPOINTS (PUBLIC & STAKEHOLDERS)
// -------------------------------------------------------------

// Get property details
app.get("/api/property/:parcelId", async (req: Request, res: Response) => {
  try {
    const { parcelId } = req.params;
    const property = await client.getParcel(parcelId);
    res.json({ success: true, data: property });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// Get chronological ownership audit trail
app.get("/api/property/:parcelId/history", async (req: Request, res: Response) => {
  try {
    const { parcelId } = req.params;
    const history = await client.getOwnershipHistory(parcelId);
    res.json({ success: true, data: history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fast public title verification (checks mortgage, dispute, freeze)
app.get("/api/property/:parcelId/verify", async (req: Request, res: Response) => {
  try {
    const { parcelId } = req.params;
    const verification = await client.verifyTitle(parcelId);
    res.json({ success: true, data: verification });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify document hash against on-chain title deed
app.post("/api/property/verify-document", async (req: Request, res: Response) => {
  try {
    const { parcelId, documentText, documentHash } = req.body;
    let targetHash = documentHash;
    if (!targetHash && documentText) {
      targetHash = BhumiVaultClient.computeSHA256(documentText);
    }
    const isValid = await client.verifyDeedHash(parcelId, targetHash);
    res.json({ success: true, parcelId, documentHash: targetHash, isValid });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. REVENUE DEPARTMENT: GENESIS REGISTRATION
// -------------------------------------------------------------
app.post("/api/property/register", async (req: Request, res: Response) => {
  try {
    const {
      parcelId,
      stateCode,
      district,
      taluk,
      surveyNumber,
      areaSqMeters,
      landType,
      initialOwner,
      deedDocumentHash,
      boundaryCoordinatesHash,
    } = req.body;

    const signer = new Wallet(MOCK_KEYS.revenueOfficer, provider);
    const receipt = await client.registerGenesisParcel(
      {
        parcelId,
        stateCode,
        district,
        taluk,
        surveyNumber,
        areaSqMeters,
        landType: Number(landType || 1),
        initialOwner,
        deedDocumentHash: deedDocumentHash || BhumiVaultClient.computeSHA256(`GENESIS_${parcelId}`),
        boundaryCoordinatesHash: boundaryCoordinatesHash || BhumiVaultClient.computeSHA256(`GEO_${parcelId}`),
      },
      signer
    );

    res.json({
      success: true,
      message: `Parcel ${parcelId} registered successfully on blockchain`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. 2-KEY TRANSFER AUTHORIZATION ENGINE
// -------------------------------------------------------------

// Step 1: Owner initiates transfer
app.post("/api/transfer/initiate", async (req: Request, res: Response) => {
  try {
    const { parcelId, buyerAddress, saleConsideration, saleDeedHash, sellerPrivateKey } = req.body;
    const signer = new Wallet(sellerPrivateKey, provider);

    const receipt = await client.initiateTransfer(
      parcelId,
      buyerAddress,
      saleConsideration,
      saleDeedHash,
      signer
    );

    res.json({
      success: true,
      message: `Transfer initiated for ${parcelId} (Key 1 provided)`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Step 2: Buyer accepts transfer
app.post("/api/transfer/accept", async (req: Request, res: Response) => {
  try {
    const { parcelId, buyerPrivateKey } = req.body;
    const signer = new Wallet(buyerPrivateKey, provider);

    const receipt = await client.buyerAcceptTransfer(parcelId, signer);
    res.json({
      success: true,
      message: `Buyer accepted transfer for ${parcelId}`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Step 3: Sub-Registrar authorizes & commits transfer (Key 2)
app.post("/api/transfer/authorize", async (req: Request, res: Response) => {
  try {
    const { parcelId, registrarPrivateKey } = req.body;
    const signer = new Wallet(registrarPrivateKey || MOCK_KEYS.registrar, provider);

    const receipt = await client.authorizeAndCommitTransfer(parcelId, signer);
    res.json({
      success: true,
      message: `Transfer authorized by Government Sub-Registrar and committed to ledger!`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 5. BANK NODE: MORTGAGE LIENS
// -------------------------------------------------------------
app.post("/api/mortgage/apply", async (req: Request, res: Response) => {
  try {
    const { parcelId, bankName, loanReference, loanAmount, mortgageDocHash } = req.body;
    const signer = new Wallet(MOCK_KEYS.bankOfficer, provider);

    const receipt = await client.applyMortgage(
      parcelId,
      bankName,
      loanReference,
      loanAmount,
      mortgageDocHash || BhumiVaultClient.computeSHA256(`MORTGAGE_${loanReference}`),
      signer
    );

    res.json({
      success: true,
      message: `Bank mortgage lien placed on ${parcelId}. Transfers locked.`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/mortgage/release", async (req: Request, res: Response) => {
  try {
    const { parcelId, releaseDocHash } = req.body;
    const signer = new Wallet(MOCK_KEYS.bankOfficer, provider);

    const receipt = await client.releaseMortgage(
      parcelId,
      releaseDocHash || BhumiVaultClient.computeSHA256(`RELEASE_${parcelId}`),
      signer
    );

    res.json({
      success: true,
      message: `Bank mortgage NOC issued and lien released on ${parcelId}.`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 6. JUDICIARY NODE: COURT DISPUTE INJUNCTIONS
// -------------------------------------------------------------
app.post("/api/dispute/apply", async (req: Request, res: Response) => {
  try {
    const { parcelId, courtName, caseNumber, courtOrderHash, reason } = req.body;
    const signer = new Wallet(MOCK_KEYS.judge, provider);

    const receipt = await client.applyDisputeInjunction(
      parcelId,
      courtName,
      caseNumber,
      courtOrderHash || BhumiVaultClient.computeSHA256(`COURT_ORDER_${caseNumber}`),
      reason,
      signer
    );

    res.json({
      success: true,
      message: `Judiciary Dispute Injunction applied on ${parcelId}. Property frozen.`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/dispute/lift", async (req: Request, res: Response) => {
  try {
    const { parcelId, judgmentDocHash } = req.body;
    const signer = new Wallet(MOCK_KEYS.judge, provider);

    const receipt = await client.liftDisputeInjunction(
      parcelId,
      judgmentDocHash || BhumiVaultClient.computeSHA256(`JUDGMENT_${parcelId}`),
      signer
    );

    res.json({
      success: true,
      message: `Court dispute resolved and injunction lifted on ${parcelId}.`,
      transactionHash: receipt?.hash,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 BhumiVault Blockchain REST Gateway running at http://localhost:${PORT}`);
  });
}

export default app;
