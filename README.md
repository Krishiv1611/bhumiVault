# 🏛️ BHUMI-VAULT: Secure Authorization & Fraud Prevention for Land Ownership Transactions

> **Smart India Hackathon (SIH 2025)**  
> **Theme:** GovTech / Cybersecurity / Blockchain  
> **Repository:** [https://github.com/Krishiv1611/bhumiVault](https://github.com/Krishiv1611/bhumiVault)

---

## 🌟 Overview

**BHUMI-VAULT** is a decentralized, multi-stakeholder land ownership authorization and fraud prevention architecture. It integrates with existing land-record frameworks (such as **DILRMP** and **NGDRS**) to add an immutable security and verification layer before any land ownership mutation is committed.

### Key Innovations:
1. **Unique Land Parcel ID (ULPIN)** anchoring every physical property on-chain.
2. **2-Key Authorization Engine**: Requires both the **Landowner (Private Key sign-off)** and the **Government Sub-Registrar (Authorization sign-off)** to commit an ownership transfer. Neither party alone can mutate title records.
3. **Multi-Gate Fraud Engine**:
   - **Seller Verification**: Confirms seller is the currently recorded on-chain owner.
   - **Document Integrity**: Validates the SHA-256 hash of the off-chain Sale Deed PDF.
   - **Bank Encumbrance Check**: Blocks transfer if an active Bank Mortgage lien exists.
   - **Judiciary Freeze Check**: Blocks transfer if a Court Dispute Injunction / Stay order is active.
   - **Emergency Authority Freeze**: Prevents unauthorized modifications during administrative inquiries.
4. **Immutable Multi-Hop Audit Trail**: Complete, tamper-evident chain of title (`Genesis -> Rahul -> Amit -> Rohit -> Current Owner`) with timestamps, block numbers, and registrar approvals.
5. **Instant Title & Hash Verification**: Publicly accessible verification helpers for citizens, banks, and buyers.

---

## 🏗️ Architecture & Stakeholder Flow

```
+-----------------------------------------------------------------------------------+
|                                 STAKEHOLDER NODES                                 |
|                                                                                   |
|  [Citizen / Owner]    [Sub-Registrar]     [Land Revenue]    [Bank Node]    [Court] |
+---------+--------------------+-------------------+---------------+------------+---+
          |                    |                   |               |            |
          v                    v                   v               v            v
+-----------------------------------------------------------------------------------+
|                          BHUMI-VAULT SMART CONTRACT ENGINE                        |
|                                                                                   |
|   1. Genesis Land Registration (ULPIN + Geo Hash + Deed SHA-256)                  |
|   2. 2-Key Transfer Initiation (Seller Key 1)                                     |
|   3. Automated Fraud Policy Checks:                                               |
|      - Is Seller == Current Owner?                                                |
|      - Is Property Mortgaged by Bank? [BLOCK IF TRUE]                             |
|      - Is Property Disputed in Court? [BLOCK IF TRUE]                             |
|      - Is Property Frozen by Registrar? [BLOCK IF TRUE]                           |
|   4. Government Sub-Registrar Review & Authorization (Govt Key 2)                 |
|   5. Atomic Ownership Mutation & Provenance Ledger Commit                         |
+-----------------------------------------------------------------------------------+
```

---

## 📁 Repository Structure

```
bhumi-vault/
├── contracts/
│   └── BhumiVaultRegistry.sol     # Core smart contract with 2-key auth & fraud engine
├── sdk/
│   ├── bhumiVaultClient.ts        # TypeScript SDK for Backend & Frontend integration
│   ├── demoApiServer.ts           # Plug-and-play Express.js REST API gateway
│   └── contractArtifacts.json     # Auto-exported ABI and deployment addresses
├── scripts/
│   ├── deploy.ts                  # Hardhat deployment script
│   └── seedDemoData.ts            # Realistic SIH demo data seeder
├── test/
│   └── BhumiVaultRegistry.test.ts # Comprehensive automated test suite
├── hardhat.config.ts              # Hardhat configuration (Solidity 0.8.24 + viaIR)
├── package.json
└── README.md
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js**: `v18+` or `v20+` (tested on Node v24)
- **npm**: `v9+`

### 2. Install Dependencies
```bash
npm install
```

### 3. Compile Smart Contracts
```bash
npm run compile
```

### 4. Run Automated Test Suite
```bash
npm test
```

### 5. Start Local Blockchain & Seed Demo Data
In terminal 1 (starts local node):
```bash
npx hardhat node
```

In terminal 2 (deploys and seeds SIH presentation data):
```bash
npm run deploy:local
npm run seed:local
```

---

## 👥 Integration Guide for Backend & Frontend Teams

### Option A: Using the TypeScript / Node.js SDK (`sdk/bhumiVaultClient.ts`)

Backend developers can import `BhumiVaultClient` directly into their Express/NestJS services:

```typescript
import { BhumiVaultClient, LandType } from "./sdk/bhumiVaultClient";

// 1. Initialize Client
const client = new BhumiVaultClient("http://127.0.0.1:8545");

// 2. Query Property Details
const property = await client.getParcel("IN-MH-PUN-2025-0987");
console.log(`Current Owner: ${property.currentOwner}`);
console.log(`Mortgage Status: ${property.isMortgaged}`);
console.log(`Dispute Status: ${property.isDisputed}`);

// 3. Check Complete Chain of Title History
const history = await client.getOwnershipHistory("IN-MH-PUN-2025-0987");
console.log(history);

// 4. Verify Document SHA-256 Hash
const pdfBuffer = fs.readFileSync("sale_deed.pdf");
const docHash = BhumiVaultClient.computeSHA256(pdfBuffer);
const isValid = await client.verifyDeedHash("IN-MH-PUN-2025-0987", docHash);
```

---

### Option B: Using the Demo REST API Server (`sdk/demoApiServer.ts`)

Start the pre-built REST API gateway:
```bash
npm run start:demo-api
```
Server will start on `http://localhost:5000`.

#### Key REST Endpoints:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Network status and block height |
| `GET` | `/api/property/:parcelId` | Get complete land parcel metadata |
| `GET` | `/api/property/:parcelId/history` | Get full chronological ownership chain |
| `GET` | `/api/property/:parcelId/verify` | Fast title verification (mortgage, dispute, clean title) |
| `POST` | `/api/property/verify-document` | Check if PDF deed matches on-chain hash |
| `POST` | `/api/property/register` | Genesis parcel minting (Revenue Dept) |
| `POST` | `/api/transfer/initiate` | Seller initiates transfer (Key 1) |
| `POST` | `/api/transfer/accept` | Buyer confirms acceptance |
| `POST` | `/api/transfer/authorize` | Sub-Registrar commits mutation (Key 2) |
| `POST` | `/api/mortgage/apply` | Bank applies mortgage lien |
| `POST` | `/api/mortgage/release` | Bank releases mortgage lien |
| `POST` | `/api/dispute/apply` | Court places dispute injunction |
| `POST` | `/api/dispute/lift` | Court lifts dispute injunction |

---

## 🛡️ Fraud Prevention Test Scenarios (Demonstrated in Seeder)

1. **Clean Multi-Hop Property (`IN-MH-PUN-2025-0987`)**:
   - `2010`: Government Revenue Department $\rightarrow$ Rahul
   - `2018`: Rahul $\rightarrow$ Amit (2-Key Authorized)
   - `2023`: Amit $\rightarrow$ Rohit (2-Key Authorized)
   - `2026`: Rohit (Current verified owner, clean title)
2. **Bank Encumbered Property (`IN-MH-MUM-2025-4512`)**:
   - Owner: Priya Sharma
   - Mortgaged to **State Bank of India (SBI)** for INR 85,00,000.
   - Any transfer attempt is automatically rejected by smart contract fraud gates until loan NOC is recorded.
3. **Disputed Property (`IN-MH-THN-2025-7821`)**:
   - Owner: Vikram Deshmukh
   - Injunction placed by **District Court Thane** (Case `CS/2025/1104`).
   - Transfer is automatically frozen by smart contract until judicial clearance.

---

## 📜 Smart Contract Security Features
- **OpenZeppelin AccessControl**: Strict role-based permissions (`REGISTRAR_ROLE`, `REVENUE_ROLE`, `BANK_ROLE`, `JUDICIARY_ROLE`).
- **OpenZeppelin ReentrancyGuard**: Protection against state-reentrancy exploits.
- **viaIR Enabled**: Highly optimized EVM bytecode.
- **Hash-Anchored Data**: Off-chain PDF storage with on-chain cryptographic SHA-256 verification.
