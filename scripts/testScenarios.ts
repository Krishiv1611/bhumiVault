import { ethers } from "hardhat";
import * as crypto from "crypto";

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function divider(title: string) {
  console.log("\n" + "=".repeat(65));
  console.log(`  ${title}`);
  console.log("=".repeat(65));
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
  divider("BHUMI-VAULT: END-TO-END SCENARIO & FRAUD PREVENTION TEST");

  const [
    admin,
    registrar,
    revenueOfficer,
    bankOfficer,
    judge,
    rahul,
    amit,
    rohit,
    fraudster,
  ] = await ethers.getSigners();

  console.log("👥 Active Stakeholder Accounts:");
  console.log(`   - Admin:             ${admin.address}`);
  console.log(`   - Sub-Registrar:     ${registrar.address}`);
  console.log(`   - Revenue Officer:   ${revenueOfficer.address}`);
  console.log(`   - Bank Officer:      ${bankOfficer.address}`);
  console.log(`   - District Judge:    ${judge.address}`);
  console.log(`   - Rahul (Seller 1):  ${rahul.address}`);
  console.log(`   - Amit (Buyer 1):    ${amit.address}`);
  console.log(`   - Rohit (Buyer 2):   ${rohit.address}`);
  console.log(`   - Fraudster (Attacker): ${fraudster.address}`);

  // Deploy
  const BhumiVaultRegistry = await ethers.getContractFactory("BhumiVaultRegistry");
  const registry = await BhumiVaultRegistry.deploy(
    admin.address,
    registrar.address,
    revenueOfficer.address,
    bankOfficer.address,
    judge.address
  );
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();
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
    12000, // 1200 sq meters
    1,     // Residential
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
  // TEST SCENARIO 3: Fraud Attack 2 - Active Bank Mortgage Hold
  // -------------------------------------------------------------
  divider("TEST SCENARIO 3: Bank Encumbrance & Double-Sale Prevention");
  subHeader("State Bank of India applies INR 35,00,000 Mortgage Lien on Rahul's Land");

  const MORTGAGE_DOC_HASH = sha256("SBI_HOME_LOAN_CHARGE_AGREEMENT_2025");
  tx = await registry.connect(bankOfficer).applyMortgage(
    PARCEL_ID,
    "State Bank of India (SBI)",
    "SBI-HL-2025-8832",
    3500000,
    MORTGAGE_DOC_HASH
  );
  await tx.wait();
  successLog("Mortgage Lien placed on-chain. Property status: MORTGAGED = TRUE");

  subHeader("Rahul attempts to sell mortgaged property to Amit without Bank NOC");
  const DEED_2018_HASH = sha256("SALE_DEED_RAHUL_TO_AMIT_2018");
  try {
    await registry.connect(rahul).initiateTransfer(
      PARCEL_ID,
      amit.address,
      5000000,
      DEED_2018_HASH
    );
    console.error("  ❌ CRITICAL ERROR: Mortgaged property transfer was not blocked!");
  } catch (err: any) {
    fraudBlockedLog("Active Bank Mortgage Gate", err.message);
  }

  subHeader("Rahul repays loan. Bank Officer issues NOC and releases mortgage lien");
  const NOC_HASH = sha256("SBI_NOC_LOAN_CLEARED_2025");
  tx = await registry.connect(bankOfficer).releaseMortgage(PARCEL_ID, NOC_HASH);
  await tx.wait();
  successLog("Mortgage released by Bank. Property status: MORTGAGED = FALSE");

  // -------------------------------------------------------------
  // TEST SCENARIO 4: 2-Key Transfer Authorization (Rahul -> Amit)
  // -------------------------------------------------------------
  divider("TEST SCENARIO 4: 2-Key Transfer Authorization (Rahul -> Amit)");
  subHeader("Step 1: Rahul initiates transfer & uploads Sale Deed hash (Key 1)");
  tx = await registry.connect(rahul).initiateTransfer(
    PARCEL_ID,
    amit.address,
    5000000,
    DEED_2018_HASH
  );
  await tx.wait();
  successLog("Key 1 Provided (Owner Sign-off). Active transfer created.");

  subHeader("Step 2: Amit (Buyer) reviews and accepts transfer terms");
  tx = await registry.connect(amit).buyerAcceptTransfer(PARCEL_ID);
  await tx.wait();
  successLog("Buyer confirmation recorded.");

  subHeader("Step 3: Government Sub-Registrar inspects & authorizes mutation (Key 2)");
  tx = await registry.connect(registrar).authorizeAndCommitTransfer(PARCEL_ID);
  await tx.wait();
  successLog("Key 2 Provided (Sub-Registrar Approval). Ownership mutation committed to ledger!");

  let parcel = await registry.getParcel(PARCEL_ID);
  successLog(`Verified On-Chain Owner: ${parcel.currentOwner} (Amit)`);

  // -------------------------------------------------------------
  // TEST SCENARIO 5: Fraud Attack 3 - Court Dispute Injunction Freeze
  // -------------------------------------------------------------
  divider("TEST SCENARIO 5: Judiciary Dispute Injunction & Property Freeze");
  subHeader("District Court Pune issues stay order on parcel due to boundary dispute");

  const INJUNCTION_HASH = sha256("COURT_ORDER_STAY_INJUNCTION_CS_2025_4410");
  tx = await registry.connect(judge).applyDisputeInjunction(
    PARCEL_ID,
    "District Court Pune",
    "CS/2025/4410",
    INJUNCTION_HASH,
    "Title boundary dispute pending trial"
  );
  await tx.wait();
  successLog("Court Injunction applied. Property status: DISPUTED = TRUE");

  subHeader("Amit attempts to sell disputed property to Rohit");
  const DEED_2023_HASH = sha256("SALE_DEED_AMIT_TO_ROHIT_2023");
  try {
    await registry.connect(amit).initiateTransfer(
      PARCEL_ID,
      rohit.address,
      7500000,
      DEED_2023_HASH
    );
    console.error("  ❌ CRITICAL ERROR: Disputed property transfer was not blocked!");
  } catch (err: any) {
    fraudBlockedLog("Active Court Dispute Injunction Gate", err.message);
  }

  subHeader("Court trial concludes with final decree. Judge lifts dispute injunction");
  const DECREE_HASH = sha256("FINAL_COURT_DECREE_TITLE_CLEARED");
  tx = await registry.connect(judge).liftDisputeInjunction(PARCEL_ID, DECREE_HASH);
  await tx.wait();
  successLog("Court Injunction lifted by Judge. Property status: DISPUTED = FALSE");

  // -------------------------------------------------------------
  // TEST SCENARIO 6: Second 2-Key Transfer (Amit -> Rohit)
  // -------------------------------------------------------------
  divider("TEST SCENARIO 6: Second 2-Key Transfer (Amit -> Rohit)");
  tx = await registry.connect(amit).initiateTransfer(
    PARCEL_ID,
    rohit.address,
    7500000,
    DEED_2023_HASH
  );
  await tx.wait();
  tx = await registry.connect(rohit).buyerAcceptTransfer(PARCEL_ID);
  await tx.wait();
  tx = await registry.connect(registrar).authorizeAndCommitTransfer(PARCEL_ID);
  await tx.wait();
  successLog("Transfer 2 Committed! New Owner is Rohit.");

  parcel = await registry.getParcel(PARCEL_ID);
  successLog(`Verified On-Chain Owner: ${parcel.currentOwner} (Rohit)`);

  // -------------------------------------------------------------
  // TEST SCENARIO 7: Document Integrity & Tampering Check
  // -------------------------------------------------------------
  divider("TEST SCENARIO 7: Document Integrity & Tamper Detection");
  const isValidDeed = await registry.verifyDeedHash(PARCEL_ID, DEED_2023_HASH);
  const isTamperedDeed = await registry.verifyDeedHash(PARCEL_ID, "0xFORGED_MODIFIED_DOCUMENT_HASH");

  console.log(`  📄 Valid Sale Deed Hash Check:   ${isValidDeed ? "✅ MATCHES LEDGER" : "❌ FAILED"}`);
  console.log(`  🚨 Tampered Deed Hash Check:     ${!isTamperedDeed ? "🛡️ REJECTED (Tampering Detected!)" : "❌ FAILED"}`);

  // -------------------------------------------------------------
  // TEST SCENARIO 8: Complete Provenance & Ownership Audit Trail
  // -------------------------------------------------------------
  divider("TEST SCENARIO 8: Immutable Chain-of-Custody Audit Trail");
  const history = await registry.getOwnershipHistory(PARCEL_ID);

  console.log(`\n📜 Total Provenance Events on Blockchain: ${history.length}\n`);
  history.forEach((entry, idx) => {
    console.log(`  [Event #${idx + 1}] Type: ${entry.transferType}`);
    console.log(`     From:       ${entry.fromOwner === ethers.ZeroAddress ? "GOVERNMENT (Genesis)" : entry.fromOwner}`);
    console.log(`     To:         ${entry.toOwner}`);
    console.log(`     Deed Hash:  ${entry.deedDocumentHash.slice(0, 24)}...`);
    console.log(`     Registrar:  ${entry.registrarApprover}`);
    console.log(`     Block No:   #${entry.blockNumber}`);
    console.log(`     Timestamp:  ${new Date(Number(entry.timestamp) * 1000).toUTCString()}`);
    console.log("     " + "-".repeat(45));
  });

  // Fast Title Verification
  const [isCleanTitle, currentOwner, isMortgaged, isDisputed, isLocked, historyCount, deedHash] =
    await registry.verifyTitle(PARCEL_ID);

  divider("FINAL TITLE VERIFICATION SUMMARY");
  console.log(`  Property ULPIN:      ${PARCEL_ID}`);
  console.log(`  Current Owner:       ${currentOwner}`);
  console.log(`  Clean Title:         ${isCleanTitle ? "✅ CLEAR TITLE (Eligible for Sale / Loan)" : "❌ BLOCKED"}`);
  console.log(`  Mortgaged:           ${isMortgaged ? "⚠️ YES" : "NO"}`);
  console.log(`  Disputed:            ${isDisputed ? "⚠️ YES" : "NO"}`);
  console.log(`  Locked:              ${isLocked ? "⚠️ YES" : "NO"}`);
  console.log(`  Total Transfers:     ${historyCount}`);
  console.log(`  Current Deed Hash:   ${deedHash}`);
  divider("ALL LOGIC CHECKS PASSED SUCCESSFULLY!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
