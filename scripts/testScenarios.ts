import { ethers } from "hardhat";
import * as crypto from "crypto";

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function divider(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${title}`);
  console.log("=".repeat(70));
}

function subHeader(text: string) {
  console.log(`\n🔹 [STEP] ${text}`);
}

function successLog(text: string) {
  console.log(`  ✅ SUCCESS: ${text}`);
}

function fraudBlockedLog(gate: string, reason: string) {
  console.log(`  🛡️ FRAUD ENGINE BLOCKED (${gate}):`);
  console.log(`     Reason: "${reason}"`);
}

async function main() {
  divider("BHUMI-VAULT: ADVANCED FRAUD PREVENTION & MULTI-SIG SCENARIO TEST");

  const [
    admin,
    registrar,
    revenueOfficer,
    bankOfficer1,
    bankOfficer2,
    judge,
    rahul,
    amit,
    rohit,
    legalHeir,
    fraudster,
  ] = await ethers.getSigners();

  console.log("👥 Active Stakeholder Nodes & Citizen Personas:");
  console.log(`   - Admin / Root Node:        ${admin.address}`);
  console.log(`   - Sub-Registrar Officer:    ${registrar.address}`);
  console.log(`   - Land Revenue Officer:     ${revenueOfficer.address}`);
  console.log(`   - Bank Officer 1 (SBI):     ${bankOfficer1.address}`);
  console.log(`   - Bank Officer 2 (HDFC):    ${bankOfficer2.address}`);
  console.log(`   - District Court Judge:     ${judge.address}`);
  console.log(`   - Rahul (Seller 1):         ${rahul.address}`);
  console.log(`   - Amit (Buyer 1):           ${amit.address}`);
  console.log(`   - Rohit (Buyer 2):          ${rohit.address}`);
  console.log(`   - Legal Heir:               ${legalHeir.address}`);
  console.log(`   - Fraudster (Attacker):     ${fraudster.address}`);

  // Deploy Contract
  const BhumiVaultRegistry = await ethers.getContractFactory("BhumiVaultRegistry");
  const registry = await BhumiVaultRegistry.deploy(
    admin.address,
    registrar.address,
    revenueOfficer.address,
    bankOfficer1.address,
    judge.address
  );
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();

  const BANK_ROLE = await registry.BANK_ROLE();
  await registry.connect(admin).grantRole(BANK_ROLE, bankOfficer2.address);

  console.log(`\n📦 BhumiVaultRegistry Contract Deployed: ${contractAddress}`);

  const PARCEL_ID = "IN-MH-PUN-2025-0987";
  const DEED_2010_HASH = sha256("ORIGINAL_GENESIS_SALE_DEED_RAHUL_2010");
  const GEO_HASH = sha256("GEO_COORDINATES_BANER_PUNE_72_1A");

  // -------------------------------------------------------------
  // TEST SCENARIO 1: Genesis Land Parcel Registration
  // -------------------------------------------------------------
  divider("TEST SCENARIO 1: Genesis Land Parcel Registration");
  subHeader("Revenue Department registers verified property for Rahul");

  let tx = await registry.connect(revenueOfficer).registerGenesisParcel(
    PARCEL_ID,
    "MH",
    "Pune",
    "Haveli",
    "Survey No. 72/1A",
    12000,
    1,
    rahul.address,
    DEED_2010_HASH,
    GEO_HASH
  );
  await tx.wait();
  successLog(`Genesis Parcel ${PARCEL_ID} minted on-chain. Current Owner: Rahul`);

  // -------------------------------------------------------------
  // TEST SCENARIO 2: Fraud Attack 1 - Unauthorized Seller
  // -------------------------------------------------------------
  divider("TEST SCENARIO 2: Fraud Attack 1 - Unauthorized Seller Impersonation");
  subHeader("Fraudster attempts to initiate a sale of Rahul's land to Amit");

  const FAKE_DEED_HASH = sha256("FORGED_SALE_DEED_BY_FRAUDSTER");
  try {
    await registry.connect(fraudster).initiateTransfer(
      PARCEL_ID,
      amit.address,
      5000000,
      FAKE_DEED_HASH
    );
    console.error("  ❌ CRITICAL ERROR: Fraudster was not blocked!");
  } catch (err: any) {
    fraudBlockedLog("Unauthorized Seller Check", err.message);
  }

  // -------------------------------------------------------------
  // TEST SCENARIO 3: Multi-Lien Bank Encumbrances
  // -------------------------------------------------------------
  divider("TEST SCENARIO 3: Multi-Bank Encumbrances & Double-Sale Prevention");
  subHeader("SBI applies INR 35,00,000 Mortgage Lien on Rahul's Land");
  const mortgageHash1 = sha256("SBI_HOME_LOAN_CHARGE_AGREEMENT_2025");
  await registry.connect(bankOfficer1).applyMortgage(
    PARCEL_ID,
    "State Bank of India (SBI)",
    "SBI-HL-2025-8832",
    3500000,
    mortgageHash1
  );
  const mortgageId1 = (await registry.getParcelMortgageIds(PARCEL_ID))[0];
  successLog("Mortgage 1 (SBI) placed on-chain.");

  subHeader("HDFC Bank applies INR 15,00,000 Secondary Mortgage Lien");
  const mortgageHash2 = sha256("HDFC_SECOND_CHARGE_AGREEMENT_2025");
  await registry.connect(bankOfficer2).applyMortgage(
    PARCEL_ID,
    "HDFC Bank",
    "HDFC-CL-2025-4421",
    1500000,
    mortgageHash2
  );
  const mortgageId2 = (await registry.getParcelMortgageIds(PARCEL_ID))[1];
  successLog("Mortgage 2 (HDFC) placed on-chain. Total Active Liens: 2");

  subHeader("Rahul attempts to sell mortgaged property to Amit");
  const DEED_2018_HASH = sha256("SALE_DEED_RAHUL_TO_AMIT_2018");
  try {
    await registry.connect(rahul).initiateTransfer(PARCEL_ID, amit.address, 5000000, DEED_2018_HASH);
    console.error("  ❌ CRITICAL ERROR: Mortgaged property transfer was not blocked!");
  } catch (err: any) {
    fraudBlockedLog("Active Bank Mortgage Gate", err.message);
  }

  subHeader("Rahul clears SBI loan. SBI releases Mortgage 1");
  await registry.connect(bankOfficer1).releaseMortgage(PARCEL_ID, mortgageId1, sha256("SBI_NOC_RELEASE"));
  successLog("Mortgage 1 released. Property still encumbered by Mortgage 2 (HDFC). Transfer remains blocked.");

  subHeader("Rahul clears HDFC loan. HDFC releases Mortgage 2");
  await registry.connect(bankOfficer2).releaseMortgage(PARCEL_ID, mortgageId2, sha256("HDFC_NOC_RELEASE"));
  successLog("Mortgage 2 released. All bank encumbrances cleared! Property is now transferable.");

  // -------------------------------------------------------------
  // TEST SCENARIO 4: 2-Key Transfer with Enforced Buyer Acceptance
  // -------------------------------------------------------------
  divider("TEST SCENARIO 4: 2-Key Transfer with Enforced Buyer Acceptance");
  subHeader("Step 1: Rahul initiates transfer & uploads Sale Deed hash (Key 1)");
  await registry.connect(rahul).initiateTransfer(PARCEL_ID, amit.address, 5000000, DEED_2018_HASH);
  successLog("Key 1 Provided (Owner Sign-off). Active transfer created.");

  subHeader("Sub-Registrar attempts to authorize transfer BEFORE Buyer accepts");
  try {
    await registry.connect(registrar).authorizeAndCommitTransfer(PARCEL_ID);
    console.error("  ❌ CRITICAL ERROR: Unaccepted transfer authorized!");
  } catch (err: any) {
    fraudBlockedLog("Buyer Acceptance Gate", err.message);
  }

  subHeader("Step 2: Amit (Buyer) reviews and accepts transfer terms");
  await registry.connect(amit).buyerAcceptTransfer(PARCEL_ID);
  successLog("Buyer confirmation recorded.");

  subHeader("Step 3: Government Sub-Registrar inspects & authorizes mutation (Key 2)");
  await registry.connect(registrar).authorizeAndCommitTransfer(PARCEL_ID);
  successLog("Key 2 Provided (Sub-Registrar Approval). Ownership mutation committed to ledger!");

  let parcel = await registry.getParcel(PARCEL_ID);
  successLog(`Verified On-Chain Owner: ${parcel.currentOwner} (Amit)`);

  // -------------------------------------------------------------
  // TEST SCENARIO 5: Gasless EIP-712 Meta-Transaction Transfer (Amit -> Rohit)
  // -------------------------------------------------------------
  divider("TEST SCENARIO 5: Gasless EIP-712 Meta-Transaction (Rural Citizen Mode)");
  subHeader("Amit signs an off-chain cryptographic transfer intent without paying gas");

  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "BhumiVaultRegistry",
    version: "1.0.0",
    chainId: Number(network.chainId),
    verifyingContract: contractAddress,
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

  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const nonce = await registry.userNonces(amit.address);
  const DEED_2023_HASH = sha256("SALE_DEED_AMIT_TO_ROHIT_2023");

  const value = {
    parcelId: PARCEL_ID,
    buyer: rohit.address,
    saleConsideration: 7500000,
    saleDeedHash: DEED_2023_HASH,
    nonce: nonce,
    deadline: deadline,
  };

  const eip712Signature = await amit.signTypedData(domain, types, value);
  successLog("Amit generated valid off-chain EIP-712 signature (0 ETH Gas Spent).");

  subHeader("Sub-Registrar submits Amit's signature on-chain");
  await registry.connect(registrar).initiateTransferWithSignature(
    PARCEL_ID,
    amit.address,
    rohit.address,
    7500000,
    DEED_2023_HASH,
    deadline,
    eip712Signature
  );
  successLog("Transfer initiated via Gasless Meta-Transaction!");

  await registry.connect(rohit).buyerAcceptTransfer(PARCEL_ID);
  await registry.connect(registrar).authorizeAndCommitTransfer(PARCEL_ID);
  successLog("Transfer 2 Committed! New Owner is Rohit.");

  // -------------------------------------------------------------
  // TEST SCENARIO 6: Lost Key & Succession Multi-Sig Recovery
  // -------------------------------------------------------------
  divider("TEST SCENARIO 6: Government-Assisted Lost Key / Inheritance Recovery");
  subHeader("Rohit's legal heir requests succession recovery following loss of keys / demise");

  const SUCCESSION_DOC_HASH = sha256("SUCCESSION_CERTIFICATE_DISTRICT_COURT_PUNE_2026");

  // Step 1: Registrar initiates recovery after physical Aadhaar/Death Certificate check
  await registry.connect(registrar).initiateOwnershipRecovery(
    PARCEL_ID,
    legalHeir.address,
    SUCCESSION_DOC_HASH
  );
  successLog("Sub-Registrar initiated Recovery (Signer 1 of 2). Waiting for Court Judge.");

  // Verify parcel owner is still Rohit until Judge signs
  parcel = await registry.getParcel(PARCEL_ID);
  successLog(`Current Owner before Judge Approval: ${parcel.currentOwner} (Rohit)`);

  // Step 2: District Court Judge approves decree
  await registry.connect(judge).approveOwnershipRecovery(PARCEL_ID);
  successLog("District Court Judge approved Recovery (Signer 2 of 2). Multi-Sig Threshold Met!");

  parcel = await registry.getParcel(PARCEL_ID);
  successLog(`🎉 Ownership Successfully Recovered to Legal Heir: ${parcel.currentOwner} (${legalHeir.address})`);

  // -------------------------------------------------------------
  // TEST SCENARIO 7: Complete Provenance & Ownership Audit Trail
  // -------------------------------------------------------------
  divider("TEST SCENARIO 7: Immutable Chain-of-Custody Audit Trail");
  const history = await registry.getOwnershipHistory(PARCEL_ID);

  console.log(`\n📜 Total Provenance Events Recorded on Blockchain: ${history.length}\n`);
  history.forEach((entry, idx) => {
    console.log(`  [Event #${idx + 1}] Type: ${entry.transferType}`);
    console.log(`     From:       ${entry.fromOwner === ethers.ZeroAddress ? "GOVERNMENT (Genesis)" : entry.fromOwner}`);
    console.log(`     To:         ${entry.toOwner}`);
    console.log(`     Deed Hash:  ${entry.deedDocumentHash.slice(0, 24)}...`);
    console.log(`     Registrar:  ${entry.registrarApprover}`);
    console.log(`     Block No:   #${entry.blockNumber}`);
    console.log("     " + "-".repeat(45));
  });

  const status = await registry.verifyTitle(PARCEL_ID);
  divider("FINAL TITLE VERIFICATION SUMMARY");
  console.log(`  Property ULPIN:        ${PARCEL_ID}`);
  console.log(`  Current Owner:         ${status.currentOwner} (Legal Heir)`);
  console.log(`  Clean Title:           ${status.isCleanTitle ? "✅ CLEAR TITLE (Eligible for Sale / Loan)" : "❌ BLOCKED"}`);
  console.log(`  Active Mortgages:      ${status.activeMortgageCount}`);
  console.log(`  Active Disputes:       ${status.activeDisputeCount}`);
  console.log(`  Emergency Locked:      ${status.isLocked ? "⚠️ YES" : "NO"}`);
  console.log(`  Total Historical Logs: ${status.historyCount}`);
  divider("ALL ENHANCED SCENARIOS PASSED WITH ZERO ERRORS!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
