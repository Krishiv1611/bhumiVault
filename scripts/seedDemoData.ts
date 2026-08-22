import { ethers } from "hardhat";
import * as crypto from "crypto";

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function main() {
  console.log("=================================================");
  console.log("  BHUMI-VAULT: Seeding Realistic SIH Demo Data   ");
  console.log("=================================================");

  const [
    admin,
    registrar,
    revenueOfficer,
    bankOfficer,
    judge,
    rahul,
    amit,
    rohit,
    priya,
    vikram,
  ] = await ethers.getSigners();

  // 1. Deploy Contract
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
  console.log(`✅ BhumiVaultRegistry deployed at: ${contractAddress}\n`);

  // =========================================================================
  // SCENARIO 1: Multi-Hop Trusted Property History (from PPT Slide 5)
  // ULPIN: IN-MH-PUN-2025-0987
  // 2010 Gov -> Rahul -> 2018 Amit -> 2023 Rohit (Current Owner 2026)
  // =========================================================================
  console.log("--- 1. Seeding Property 1: IN-MH-PUN-2025-0987 (Multi-Hop Chain) ---");
  const parcel1Id = "IN-MH-PUN-2025-0987";
  const deed2010Hash = sha256("SALE_DEED_GOVT_TO_RAHUL_PUNE_HAVELI_2010");
  const geoCoordsHash1 = sha256("GEO_COORDS_PUNE_LAT_18.5204_LONG_73.8567");

  // Step 1: Genesis Registration (Govt -> Rahul)
  console.log("  [Step 1] Genesis Registration: Govt Revenue Dept -> Rahul (2010)");
  let tx = await registry.connect(revenueOfficer).registerGenesisParcel(
    parcel1Id,
    "MH",
    "Pune",
    "Haveli",
    "Survey No. 72/1A, Baner",
    12000,
    1, // Residential
    rahul.address,
    deed2010Hash,
    geoCoordsHash1
  );
  await tx.wait();

  // Step 2: Transfer 1 (Rahul -> Amit in 2018)
  console.log("  [Step 2] Transfer 1: Rahul -> Amit (2018) [2-Key Authorization + Buyer Acceptance]");
  const deed2018Hash = sha256("SALE_DEED_RAHUL_TO_AMIT_PUNE_2018_CONSIDERATION_45L");
  tx = await registry.connect(rahul).initiateTransfer(parcel1Id, amit.address, 4500000, deed2018Hash);
  await tx.wait();
  tx = await registry.connect(amit).buyerAcceptTransfer(parcel1Id);
  await tx.wait();
  tx = await registry.connect(registrar).authorizeAndCommitTransfer(parcel1Id);
  await tx.wait();

  // Step 3: Transfer 2 (Amit -> Rohit in 2023)
  console.log("  [Step 3] Transfer 2: Amit -> Rohit (2023) [2-Key Authorization + Buyer Acceptance]");
  const deed2023Hash = sha256("SALE_DEED_AMIT_TO_ROHIT_PUNE_2023_CONSIDERATION_75L");
  tx = await registry.connect(amit).initiateTransfer(parcel1Id, rohit.address, 7500000, deed2023Hash);
  await tx.wait();
  tx = await registry.connect(rohit).buyerAcceptTransfer(parcel1Id);
  await tx.wait();
  tx = await registry.connect(registrar).authorizeAndCommitTransfer(parcel1Id);
  await tx.wait();

  const history1 = await registry.getOwnershipHistory(parcel1Id);
  console.log(`  🎉 Property 1 Ready! Current Owner: ${rohit.address} (Rohit)`);
  console.log(`  📜 Total Immutable Provenance Entries: ${history1.length}`);

  // =========================================================================
  // SCENARIO 2: Bank Encumbered Property (Mortgage Hold)
  // ULPIN: IN-MH-MUM-2025-4512
  // Owner: Priya Sharma, Mortgaged to State Bank of India
  // =========================================================================
  console.log("\n--- 2. Seeding Property 2: IN-MH-MUM-2025-4512 (Bank Encumbrance) ---");
  const parcel2Id = "IN-MH-MUM-2025-4512";
  const deedPriyaHash = sha256("SALE_DEED_PRIYA_SHARMA_MUMBAI_ANDHERI_2022");
  const geoCoordsHash2 = sha256("GEO_COORDS_MUMBAI_LAT_19.0760_LONG_72.8777");

  tx = await registry.connect(revenueOfficer).registerGenesisParcel(
    parcel2Id,
    "MH",
    "Mumbai Suburban",
    "Andheri",
    "CTS 1044/B",
    8500,
    1, // Residential
    priya.address,
    deedPriyaHash,
    geoCoordsHash2
  );
  await tx.wait();

  console.log("  [Mortgage] State Bank of India places INR 85,00,000 Mortgage Lien...");
  const mortgageDocHash = sha256("SBI_HOME_LOAN_AGREEMENT_HL_2025_99812");
  tx = await registry.connect(bankOfficer).applyMortgage(
    parcel2Id,
    "State Bank of India (SBI)",
    "SBI-HL-2025-99812",
    8500000,
    mortgageDocHash
  );
  await tx.wait();
  console.log("  🔒 Property 2 Mortgaged & Transfer-Locked!");

  // =========================================================================
  // SCENARIO 3: Disputed Property (Judiciary Injunction Hold)
  // ULPIN: IN-MH-THN-2025-7821
  // Owner: Vikram Deshmukh, Injunction by District Court Thane
  // =========================================================================
  console.log("\n--- 3. Seeding Property 3: IN-MH-THN-2025-7821 (Court Dispute) ---");
  const parcel3Id = "IN-MH-THN-2025-7821";
  const deedVikramHash = sha256("SALE_DEED_VIKRAM_DESHMUKH_THANE_2020");
  const geoCoordsHash3 = sha256("GEO_COORDS_THANE_LAT_19.2183_LONG_72.9781");

  tx = await registry.connect(revenueOfficer).registerGenesisParcel(
    parcel3Id,
    "MH",
    "Thane",
    "Thane",
    "Plot No. 45/A, Majiwada",
    18000,
    2, // Commercial
    vikram.address,
    deedVikramHash,
    geoCoordsHash3
  );
  await tx.wait();

  console.log("  [Injunction] District Court Thane issues stay order on disputed boundary...");
  const courtOrderHash = sha256("COURT_ORDER_STAY_INJUNCTION_CS_2025_1104");
  tx = await registry.connect(judge).applyDisputeInjunction(
    parcel3Id,
    "District & Sessions Court, Thane",
    "CS/2025/1104",
    courtOrderHash,
    "Pending civil suit for title partition and boundary claim"
  );
  await tx.wait();
  console.log("  ⚖️ Property 3 Disputed & Frozen by Court Order!");

  console.log("\n=================================================");
  console.log("  Demo Data Seeding Complete!");
  console.log("  1. IN-MH-PUN-2025-0987: Clean Title, 3 Historical Transfers");
  console.log("  2. IN-MH-MUM-2025-4512: Mortgaged (SBI Home Loan)");
  console.log("  3. IN-MH-THN-2025-7821: Disputed (Court Injunction)");
  console.log("=================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
