import { expect } from "chai";
import { ethers } from "hardhat";
import { BhumiVaultRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("BHUMI-VAULT: Secure Authorization & Fraud Prevention Smart Contract", function () {
  let registry: BhumiVaultRegistry;
  let admin: SignerWithAddress;
  let registrar: SignerWithAddress;
  let revenueOfficer: SignerWithAddress;
  let bankOfficer: SignerWithAddress;
  let judge: SignerWithAddress;
  let rahul: SignerWithAddress; // Genesis Owner
  let amit: SignerWithAddress;  // Buyer 1
  let rohit: SignerWithAddress; // Buyer 2
  let fraudster: SignerWithAddress;

  const SAMPLE_PARCEL_ID = "IN-MH-PUN-2025-0987";
  const GENESIS_DEED_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const GEO_COORDS_HASH = "8f480322d2cde93b9d0b64d9f67a2707b99c7546d1bf5f43da0c2a514d3fdf2a";
  const SALE_DEED_HASH_1 = "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f";
  const SALE_DEED_HASH_2 = "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a";

  beforeEach(async function () {
    [
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

    const BhumiVaultRegistryFactory = await ethers.getContractFactory("BhumiVaultRegistry");
    registry = await BhumiVaultRegistryFactory.deploy(
      admin.address,
      registrar.address,
      revenueOfficer.address,
      bankOfficer.address,
      judge.address
    );
    await registry.waitForDeployment();
  });

  describe("1. Deployment & Multi-Stakeholder Role Access Control", function () {
    it("Should properly assign initial roles to government, bank, and judiciary nodes", async function () {
      const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
      const REVENUE_ROLE = await registry.REVENUE_ROLE();
      const BANK_ROLE = await registry.BANK_ROLE();
      const JUDICIARY_ROLE = await registry.JUDICIARY_ROLE();

      expect(await registry.hasRole(REGISTRAR_ROLE, registrar.address)).to.be.true;
      expect(await registry.hasRole(REVENUE_ROLE, revenueOfficer.address)).to.be.true;
      expect(await registry.hasRole(BANK_ROLE, bankOfficer.address)).to.be.true;
      expect(await registry.hasRole(JUDICIARY_ROLE, judge.address)).to.be.true;
    });

    it("Should prevent unauthorized users from registering genesis land parcels", async function () {
      await expect(
        registry.connect(fraudster).registerGenesisParcel(
          SAMPLE_PARCEL_ID,
          "MH",
          "Pune",
          "Haveli",
          "72/1A",
          10000,
          1, // RESIDENTIAL
          rahul.address,
          GENESIS_DEED_HASH,
          GEO_COORDS_HASH
        )
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("2. Genesis Land Parcel Registration", function () {
    it("Should successfully register a new verified land parcel with ULPIN and deed hash", async function () {
      await expect(
        registry.connect(revenueOfficer).registerGenesisParcel(
          SAMPLE_PARCEL_ID,
          "MH",
          "Pune",
          "Haveli",
          "72/1A",
          10000,
          1, // RESIDENTIAL
          rahul.address,
          GENESIS_DEED_HASH,
          GEO_COORDS_HASH
        )
      )
        .to.emit(registry, "ParcelRegistered")
        .withArgs(SAMPLE_PARCEL_ID, rahul.address, "72/1A", "Pune", GENESIS_DEED_HASH, (val: any) => true);

      const parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.parcelId).to.equal(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(rahul.address);
      expect(parcel.deedDocumentHash).to.equal(GENESIS_DEED_HASH);
      expect(parcel.isMortgaged).to.be.false;
      expect(parcel.isDisputed).to.be.false;

      // Check initial history
      const history = await registry.getOwnershipHistory(SAMPLE_PARCEL_ID);
      expect(history.length).to.equal(1);
      expect(history[0].toOwner).to.equal(rahul.address);
      expect(history[0].transferType).to.equal("GENESIS_REGISTRATION");
    });

    it("Should prevent duplicate parcel registration with same ULPIN", async function () {
      await registry.connect(revenueOfficer).registerGenesisParcel(
        SAMPLE_PARCEL_ID,
        "MH",
        "Pune",
        "Haveli",
        "72/1A",
        10000,
        1,
        rahul.address,
        GENESIS_DEED_HASH,
        GEO_COORDS_HASH
      );

      await expect(
        registry.connect(revenueOfficer).registerGenesisParcel(
          SAMPLE_PARCEL_ID,
          "MH",
          "Pune",
          "Haveli",
          "72/1A",
          10000,
          1,
          rahul.address,
          GENESIS_DEED_HASH,
          GEO_COORDS_HASH
        )
      ).to.be.revertedWith("BHUMI: Parcel ID already exists");
    });
  });

  describe("3. 2-Key Transfer Authorization (Happy Path Flow)", function () {
    beforeEach(async function () {
      await registry.connect(revenueOfficer).registerGenesisParcel(
        SAMPLE_PARCEL_ID,
        "MH",
        "Pune",
        "Haveli",
        "72/1A",
        10000,
        1,
        rahul.address,
        GENESIS_DEED_HASH,
        GEO_COORDS_HASH
      );
    });

    it("Should complete 2-key transfer from Rahul to Amit with Sub-Registrar approval", async function () {
      // Step 1: Owner (Rahul) initiates transfer (Key 1)
      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000, // 50 Lakhs INR
          SALE_DEED_HASH_1
        )
      )
        .to.emit(registry, "TransferInitiated")
        .withArgs(SAMPLE_PARCEL_ID, rahul.address, amit.address, SALE_DEED_HASH_1, 5000000, (val: any) => true);

      // Step 2: Buyer (Amit) accepts terms
      await expect(registry.connect(amit).buyerAcceptTransfer(SAMPLE_PARCEL_ID))
        .to.emit(registry, "TransferBuyerAccepted")
        .withArgs(SAMPLE_PARCEL_ID, amit.address, (val: any) => true);

      // Step 3: Sub-Registrar authorizes and commits (Key 2)
      await expect(registry.connect(registrar).authorizeAndCommitTransfer(SAMPLE_PARCEL_ID))
        .to.emit(registry, "TransferCommitted")
        .withArgs(
          SAMPLE_PARCEL_ID,
          rahul.address,
          amit.address,
          SALE_DEED_HASH_1,
          registrar.address,
          (val: any) => true
        );

      // Verify on-chain owner is now Amit
      const parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(amit.address);
      expect(parcel.deedDocumentHash).to.equal(SALE_DEED_HASH_1);

      // Verify ownership history has 2 entries
      const history = await registry.getOwnershipHistory(SAMPLE_PARCEL_ID);
      expect(history.length).to.equal(2);
      expect(history[1].fromOwner).to.equal(rahul.address);
      expect(history[1].toOwner).to.equal(amit.address);
      expect(history[1].transferType).to.equal("SALE_TRANSFER");
      expect(history[1].registrarApprover).to.equal(registrar.address);
    });
  });

  describe("4. Fraud Prevention & Conflict Checks", function () {
    beforeEach(async function () {
      await registry.connect(revenueOfficer).registerGenesisParcel(
        SAMPLE_PARCEL_ID,
        "MH",
        "Pune",
        "Haveli",
        "72/1A",
        10000,
        1,
        rahul.address,
        GENESIS_DEED_HASH,
        GEO_COORDS_HASH
      );
    });

    it("FRAUD GATE 1: Fraudster attempting to sell Rahul's property must be blocked", async function () {
      await expect(
        registry.connect(fraudster).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.be.revertedWith("BHUMI: FRAUD_DETECTED - Caller is not the recorded owner");
    });

    it("FRAUD GATE 2: Transfer must be blocked if Bank Mortgage is active", async function () {
      // Bank places mortgage lien
      await expect(
        registry.connect(bankOfficer).applyMortgage(
          SAMPLE_PARCEL_ID,
          "State Bank of India",
          "SBI-HL-2025-8832",
          3500000,
          "0x123456789abcdef"
        )
      ).to.emit(registry, "MortgageApplied");

      // Verify property is marked mortgaged
      const parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.isMortgaged).to.be.true;

      // Rahul attempts to sell mortgaged land -> BLOCKED
      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.be.revertedWith("BHUMI: FRAUD_DETECTED - Active Bank Mortgage Hold exists");

      // Bank releases mortgage NOC
      await registry.connect(bankOfficer).releaseMortgage(SAMPLE_PARCEL_ID, "0xreleasehash");

      // Now Rahul can initiate transfer
      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.emit(registry, "TransferInitiated");
    });

    it("FRAUD GATE 3: Transfer must be blocked if Judiciary Court Dispute is active", async function () {
      // District Court issues injunction order
      await expect(
        registry.connect(judge).applyDisputeInjunction(
          SAMPLE_PARCEL_ID,
          "District Court Pune",
          "CS/2025/4410",
          "0xinjunctionorderhash",
          "Title ownership boundary dispute pending trial"
        )
      ).to.emit(registry, "DisputeInjunctionApplied");

      // Rahul attempts to sell disputed land -> BLOCKED
      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.be.revertedWith("BHUMI: FRAUD_DETECTED - Property has active Court Dispute Injunction");

      // Court resolves dispute and lifts injunction
      await registry.connect(judge).liftDisputeInjunction(SAMPLE_PARCEL_ID, "0xjudgmenthash");

      // Transfer can now proceed
      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.emit(registry, "TransferInitiated");
    });

    it("FRAUD GATE 4: Transfer authorization without Registrar role must fail", async function () {
      await registry.connect(rahul).initiateTransfer(
        SAMPLE_PARCEL_ID,
        amit.address,
        5000000,
        SALE_DEED_HASH_1
      );

      // Fraudster tries to bypass government and authorize transfer
      await expect(
        registry.connect(fraudster).authorizeAndCommitTransfer(SAMPLE_PARCEL_ID)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("5. Multi-Hop Provenance & Title Verification", function () {
    it("Should trace complete ownership chain: Gov -> Rahul -> Amit -> Rohit", async function () {
      // 1. Genesis: Gov -> Rahul
      await registry.connect(revenueOfficer).registerGenesisParcel(
        SAMPLE_PARCEL_ID,
        "MH",
        "Pune",
        "Haveli",
        "72/1A",
        10000,
        1,
        rahul.address,
        GENESIS_DEED_HASH,
        GEO_COORDS_HASH
      );

      // 2. Transfer 1: Rahul -> Amit
      await registry.connect(rahul).initiateTransfer(
        SAMPLE_PARCEL_ID,
        amit.address,
        5000000,
        SALE_DEED_HASH_1
      );
      await registry.connect(registrar).authorizeAndCommitTransfer(SAMPLE_PARCEL_ID);

      // 3. Transfer 2: Amit -> Rohit
      await registry.connect(amit).initiateTransfer(
        SAMPLE_PARCEL_ID,
        rohit.address,
        7500000,
        SALE_DEED_HASH_2
      );
      await registry.connect(registrar).authorizeAndCommitTransfer(SAMPLE_PARCEL_ID);

      // Current Owner check
      const parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(rohit.address);
      expect(parcel.deedDocumentHash).to.equal(SALE_DEED_HASH_2);

      // Full History Trail check
      const history = await registry.getOwnershipHistory(SAMPLE_PARCEL_ID);
      expect(history.length).to.equal(3);

      expect(history[0].toOwner).to.equal(rahul.address);
      expect(history[0].transferType).to.equal("GENESIS_REGISTRATION");

      expect(history[1].fromOwner).to.equal(rahul.address);
      expect(history[1].toOwner).to.equal(amit.address);
      expect(history[1].deedDocumentHash).to.equal(SALE_DEED_HASH_1);

      expect(history[2].fromOwner).to.equal(amit.address);
      expect(history[2].toOwner).to.equal(rohit.address);
      expect(history[2].deedDocumentHash).to.equal(SALE_DEED_HASH_2);

      // Public Title Verification helper
      const [isClean, owner, isMortgaged, isDisputed, isLocked, count, deedHash] =
        await registry.verifyTitle(SAMPLE_PARCEL_ID);

      expect(isClean).to.be.true;
      expect(owner).to.equal(rohit.address);
      expect(isMortgaged).to.be.false;
      expect(isDisputed).to.be.false;
      expect(count).to.equal(3n);
      expect(deedHash).to.equal(SALE_DEED_HASH_2);

      // Deed Document Hash Verification helper
      expect(await registry.verifyDeedHash(SAMPLE_PARCEL_ID, SALE_DEED_HASH_2)).to.be.true;
      expect(await registry.verifyDeedHash(SAMPLE_PARCEL_ID, "0xfakehash")).to.be.false;
    });
  });
});
