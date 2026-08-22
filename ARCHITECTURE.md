# BHUMI-VAULT: Core Blockchain Architecture & Logic Guide

This document details the exact logic, workflows, and fraud prevention mechanisms implemented in the `BhumiVaultRegistry.sol` smart contract (Phase 2). This is intended for backend and frontend teams to understand how to interact with the core engine using the provided TypeScript SDK (`sdk/bhumiVaultClient.ts`).

---

## 1. Role-Based Access Control (RBAC)

The system is governed by a decentralized consortium of nodes. No single entity has unilateral control over property mutations.

- **`REGISTRAR_ROLE`**: Government sub-registrars. Responsible for verifying physical identity and authorizing land transfers (Key 2 of 2) or initiating succession recovery.
- **`REVENUE_ROLE`**: Land revenue department. Responsible for minting (registering) genesis land parcels onto the blockchain.
- **`BANK_ROLE`**: Authorized financial institutions (e.g., SBI, HDFC). Responsible for placing and releasing mortgage encumbrances (liens) on properties.
- **`JUDICIARY_ROLE`**: District courts. Responsible for placing and lifting legal dispute injunctions and approving succession recovery.

---

## 2. The 2-Key Transfer Authorization Workflow

Transferring a property requires a strict 2-key authorization flow, enforcing consent from both the citizen and the state, along with the buyer's explicit acceptance.

1. **Owner Initiation (Key 1)**: The current recorded owner initiates the transfer, locking in the `buyer`, `saleConsideration`, and the `saleDeedHash` (SHA-256 of the registered document).
2. **Buyer Acceptance**: The designated buyer must explicitly accept the terms of the transfer.
3. **Fraud Gate Evaluation**: The contract automatically checks if the property is mortgaged, disputed, or frozen.
4. **Registrar Authorization (Key 2)**: The Sub-Registrar verifies the real-world execution of the deed and signs off on the transaction. The smart contract atomically mutates the ownership and logs it to the immutable history.

---

## 3. Gasless Meta-Transactions (EIP-712) for Rural Citizens

To ensure accessibility for citizens without cryptocurrency wallets or ETH to pay for gas, the contract supports **Gasless EIP-712 Meta-Transactions**.

- **`initiateTransferWithSignature`**: The seller signs a typed data payload off-chain on their mobile device. A relayer (e.g., the government portal) submits this signature to the blockchain on their behalf.
- **`buyerAcceptTransferWithSignature`**: Similarly, the buyer can accept the transfer using an off-chain signature, achieving a 100% gasless UX for the citizens.

---

## 4. Multi-Gate Fraud Prevention Engine

The core logic includes an automated, multi-layered fraud prevention engine that evaluates every transaction before it can be committed:

- 🛡️ **Active Bank Mortgage Gate**: Properties can have multiple concurrent liens from different banks (e.g., a primary loan and a top-up loan). If `activeMortgagesCount > 0`, the smart contract **hard blocks** any transfer.
- 🛡️ **Court Dispute Injunction Gate**: If a property is involved in litigation, a judge can place a dispute on-chain. If `activeDisputesCount > 0`, the property is frozen.
- 🛡️ **Unauthorized Seller / Double Spend Gate**: The contract verifies cryptographic signatures. If an attacker tries to sell land they don't own, the transaction reverts immediately.
- 🛡️ **Registrar Emergency Freeze**: The Sub-Registrar can explicitly freeze a property (`isLocked = true`) in suspected fraud cases, blocking all mutations and recovery attempts.

---

## 5. Multi-Sig Succession & Lost Key Recovery (Time-locked)

If an owner loses their private keys or passes away, the property is NOT lost forever. We implemented a decentralized, multi-sig recovery mechanism.

1. **Initiation**: The Sub-Registrar verifies physical KYC/Death Certificates and initiates a recovery request to the legal heir.
2. **Judicial Approval (Multi-Sig)**: A District Court Judge reviews the decree and approves the request.
3. **30-Day Challenge Period**: Ownership does **not** transfer immediately. The approval triggers a 30-day time-lock. This mimics real-world public notices in newspapers, giving relatives time to object.
4. **Finalization**: After 30 days, the Sub-Registrar calls `finalizeOwnershipRecovery` to execute the mutation.

---

## 6. Immutable Provenance Audit Trail

Every state change (Genesis, Transfer, Inheritance) is appended to an on-chain array (`_ownershipHistories`). 
The `getOwnershipHistory` function returns the entire chain of custody, including the exact block number, timestamp, Sub-Registrar who approved it, and the SHA-256 hash of the deed document for that specific epoch. 

## 7. Next Steps for Integration

- **Backend / Frontend**: Import the `BhumiVaultClient` from `sdk/bhumiVaultClient.ts`. It provides wrapper methods for all the logic described above.
- **Testing**: Run `npm run test:scenarios` to see the fraud engine dynamically block and allow transactions in real-time.
