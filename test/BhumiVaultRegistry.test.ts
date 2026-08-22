import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { BhumiVaultRegistry } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("BHUMI-VAULT: Secure Authorization & Fraud Prevention Smart Contract", function () {
  let registry: BhumiVaultRegistry;
  let admin: SignerWithAddress;
  let registrar: SignerWithAddress;
  let revenueOfficer: SignerWithAddress;
  let bankOfficer1: SignerWithAddress;
  let bankOfficer2: SignerWithAddress;
  let judge: SignerWithAddress;
  let rahul: SignerWithAddress; // Genesis Owner
  let amit: SignerWithAddress;  // Buyer 1
  let rohit: SignerWithAddress; // Buyer 2
  let legalHeir: SignerWithAddress;
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
      bankOfficer1,
      bankOfficer2,
      judge,
      rahul,
      amit,
      rohit,
      legalHeir,
      fraudster,
    ] = await ethers.getSigners();

    const BhumiVaultRegistryFactory = await ethers.getContractFactory("BhumiVaultRegistry");
    registry = await BhumiVaultRegistryFactory.deploy(
      admin.address,
      registrar.address,
      revenueOfficer.address,
      bankOfficer1.address,
      judge.address
    );
    await registry.waitForDeployment();

    // Grant BANK_ROLE to bankOfficer2
    const BANK_ROLE = await registry.BANK_ROLE();
    await registry.connect(admin).grantRole(BANK_ROLE, bankOfficer2.address);
  });

  describe("1. Deployment & Multi-Stakeholder Role Access Control", function () {
    it("Should properly assign initial roles to government, bank, and judiciary nodes", async function () {
      const REGISTRAR_ROLE = await registry.REGISTRAR_ROLE();
      const REVENUE_ROLE = await registry.REVENUE_ROLE();
      const BANK_ROLE = await registry.BANK_ROLE();
      const JUDICIARY_ROLE = await registry.JUDICIARY_ROLE();

      expect(await registry.hasRole(REGISTRAR_ROLE, registrar.address)).to.be.true;
      expect(await registry.hasRole(REVENUE_ROLE, revenueOfficer.address)).to.be.true;
      expect(await registry.hasRole(BANK_ROLE, bankOfficer1.address)).to.be.true;
      expect(await registry.hasRole(BANK_ROLE, bankOfficer2.address)).to.be.true;
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
      expect(parcel.activeMortgagesCount).to.equal(0n);
      expect(parcel.activeDisputesCount).to.equal(0n);

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

  describe("3. 2-Key Transfer Authorization & Enforced Buyer Acceptance", function () {
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

    it("Should enforce Buyer Acceptance before Sub-Registrar can commit transfer", async function () {
      // Step 1: Owner (Rahul) initiates transfer (Key 1)
      await registry.connect(rahul).initiateTransfer(
        SAMPLE_PARCEL_ID,
        amit.address,
        5000000,
        SALE_DEED_HASH_1
      );

      // Sub-Registrar attempts to commit BEFORE buyer accepts -> REVERT
      await expect(
        registry.connect(registrar).authorizeAndCommitTransfer(SAMPLE_PARCEL_ID)
      ).to.be.revertedWith("BHUMI: Buyer must accept transfer before registrar authorization");

      // Step 2: Buyer accepts
      await registry.connect(amit).buyerAcceptTransfer(SAMPLE_PARCEL_ID);

      // Step 3: Sub-Registrar commits (Key 2)
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

      const parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(amit.address);
    });

    it("Should support Gasless EIP-712 Meta-Transaction authorization for rural citizens", async function () {
      const contractAddress = await registry.getAddress();
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
      const nonce = await registry.userNonces(rahul.address);

      const value = {
        parcelId: SAMPLE_PARCEL_ID,
        buyer: amit.address,
        saleConsideration: 5000000,
        saleDeedHash: SALE_DEED_HASH_1,
        nonce: nonce,
        deadline: deadline,
      };

      // Rahul signs off-chain EIP-712 message
      const signature = await rahul.signTypedData(domain, types, value);

      // Relayer (or Registrar) submits transaction on-chain on behalf of Rahul
      await expect(
        registry.connect(registrar).initiateTransferWithSignature(
          SAMPLE_PARCEL_ID,
          rahul.address,
          amit.address,
          5000000,
          SALE_DEED_HASH_1,
          deadline,
          signature
        )
      ).to.emit(registry, "TransferInitiated");

      // Verify transfer request is active
      const activeTransfer = await registry.getActiveTransfer(SAMPLE_PARCEL_ID);
      expect(activeTransfer.seller).to.equal(rahul.address);
      expect(activeTransfer.sellerApproved).to.be.true;
    });

    it("Should support Gasless EIP-712 Meta-Transaction for Buyer Acceptance", async function () {
      // Step 1: Owner (Rahul) initiates transfer normally
      await registry.connect(rahul).initiateTransfer(
        SAMPLE_PARCEL_ID,
        amit.address,
        5000000,
        SALE_DEED_HASH_1
      );

      const contractAddress = await registry.getAddress();
      const network = await ethers.provider.getNetwork();

      const domain = {
        name: "BhumiVaultRegistry",
        version: "1.0.0",
        chainId: Number(network.chainId),
        verifyingContract: contractAddress,
      };

      const types = {
        TransferAcceptance: [
          { name: "parcelId", type: "string" },
          { name: "seller", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await registry.userNonces(amit.address);

      const value = {
        parcelId: SAMPLE_PARCEL_ID,
        seller: rahul.address,
        nonce: nonce,
        deadline: deadline,
      };

      // Buyer (Amit) signs off-chain EIP-712 message
      const signature = await amit.signTypedData(domain, types, value);

      // Relayer (or Registrar) submits transaction on-chain on behalf of Amit
      await expect(
        registry.connect(registrar).buyerAcceptTransferWithSignature(
          SAMPLE_PARCEL_ID,
          deadline,
          signature
        )
      ).to.emit(registry, "TransferBuyerAccepted")
        .withArgs(SAMPLE_PARCEL_ID, amit.address, (val: any) => true);

      // Verify transfer request is active and buyer accepted
      const activeTransfer = await registry.getActiveTransfer(SAMPLE_PARCEL_ID);
      expect(activeTransfer.buyerAccepted).to.be.true;
    });
  });

  describe("4. Multi-Lien Bank Mortgages & Multi-Dispute Court Injunctions", function () {
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

    it("Should track multiple simultaneous bank mortgages and block transfers until all are released", async function () {
      // Bank 1 applies Mortgage 1
      const tx1 = await registry.connect(bankOfficer1).applyMortgage(
        SAMPLE_PARCEL_ID,
        "State Bank of India",
        "SBI-HL-2025-8832",
        3500000,
        "0xmortgagehash1"
      );
      const receipt1 = await tx1.wait();
      const mortgageId1 = (await registry.getParcelMortgageIds(SAMPLE_PARCEL_ID))[0];

      // Bank 2 applies Mortgage 2 (Consortium Loan)
      await registry.connect(bankOfficer2).applyMortgage(
        SAMPLE_PARCEL_ID,
        "HDFC Bank",
        "HDFC-CL-2025-1102",
        2000000,
        "0xmortgagehash2"
      );
      const mortgageId2 = (await registry.getParcelMortgageIds(SAMPLE_PARCEL_ID))[1];

      let parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.activeMortgagesCount).to.equal(2n);

      // Attempt sale -> BLOCKED
      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.be.revertedWith("BHUMI: FRAUD_DETECTED - Active Bank Mortgage Hold exists");

      // Bank 1 releases Mortgage 1 -> Still has Mortgage 2 active -> Sale still BLOCKED
      await registry.connect(bankOfficer1).releaseMortgage(SAMPLE_PARCEL_ID, mortgageId1, "0xrelease1");
      parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.activeMortgagesCount).to.equal(1n);

      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.be.revertedWith("BHUMI: FRAUD_DETECTED - Active Bank Mortgage Hold exists");

      // Bank 2 releases Mortgage 2 -> Clean title -> Sale UNLOCKED
      await registry.connect(bankOfficer2).releaseMortgage(SAMPLE_PARCEL_ID, mortgageId2, "0xrelease2");
      parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.activeMortgagesCount).to.equal(0n);

      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.emit(registry, "TransferInitiated");
    });

    it("Should track court dispute injunctions and block transfers", async function () {
      await registry.connect(judge).applyDisputeInjunction(
        SAMPLE_PARCEL_ID,
        "District Court Pune",
        "CS/2025/4410",
        "0xinjunctionhash",
        "Boundary title claim"
      );

      const disputeId = (await registry.getParcelDisputeIds(SAMPLE_PARCEL_ID))[0];

      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.be.revertedWith("BHUMI: FRAUD_DETECTED - Property has active Court Dispute Injunction");

      await registry.connect(judge).liftDisputeInjunction(SAMPLE_PARCEL_ID, disputeId, "0xjudgmenthash");

      await expect(
        registry.connect(rahul).initiateTransfer(
          SAMPLE_PARCEL_ID,
          amit.address,
          5000000,
          SALE_DEED_HASH_1
        )
      ).to.emit(registry, "TransferInitiated");
    });
  });

  describe("5. Government-Assisted Lost Private Key & Succession Multi-Sig Recovery", function () {
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

    it("Should require Multi-Sig (Sub-Registrar + District Court Judge) to recover ownership for legal heir and respect 30-day challenge period", async function () {
      const SUCCESSION_CERT_HASH = "0x89abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678";

      // Step 1: Sub-Registrar initiates recovery based on verified physical Aadhaar KYC & Death Certificate
      await expect(
        registry.connect(registrar).initiateOwnershipRecovery(
          SAMPLE_PARCEL_ID,
          legalHeir.address,
          SUCCESSION_CERT_HASH
        )
      ).to.emit(registry, "OwnershipRecoveryInitiated");

      // Verify ownership is NOT changed yet (waiting for Judge approval)
      let parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(rahul.address);

      // Step 2: District Court Judge verifies decree and approves, starting challenge period
      await expect(registry.connect(judge).approveOwnershipRecovery(SAMPLE_PARCEL_ID))
        .to.emit(registry, "OwnershipRecoveryChallengeStarted");

      // Verify ownership is STILL NOT changed yet
      parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(rahul.address);

      // Attempt to finalize early -> should revert
      await expect(
        registry.connect(registrar).finalizeOwnershipRecovery(SAMPLE_PARCEL_ID)
      ).to.be.revertedWith("BHUMI: 30-day Challenge period is still active");

      // Fast forward time by 30 days
      await time.increase(30 * 24 * 60 * 60 + 1);

      // Step 3: Finalize recovery after challenge period
      await expect(registry.connect(registrar).finalizeOwnershipRecovery(SAMPLE_PARCEL_ID))
        .to.emit(registry, "OwnershipRecoveryApproved")
        .withArgs(SAMPLE_PARCEL_ID, legalHeir.address, registrar.address, judge.address, (val: any) => true);

      // Verify ownership has now updated to Legal Heir
      parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(legalHeir.address);

      // Verify audit trail logged INHERITANCE_RECOVERY event
      const history = await registry.getOwnershipHistory(SAMPLE_PARCEL_ID);
      expect(history.length).to.equal(2);
      expect(history[1].transferType).to.equal("INHERITANCE_RECOVERY");
      expect(history[1].toOwner).to.equal(legalHeir.address);
    });
  });

  describe("6. Multi-Hop Provenance & Title Verification", function () {
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
      await registry.connect(amit).buyerAcceptTransfer(SAMPLE_PARCEL_ID);
      await registry.connect(registrar).authorizeAndCommitTransfer(SAMPLE_PARCEL_ID);

      // 3. Transfer 2: Amit -> Rohit
      await registry.connect(amit).initiateTransfer(
        SAMPLE_PARCEL_ID,
        rohit.address,
        7500000,
        SALE_DEED_HASH_2
      );
      await registry.connect(rohit).buyerAcceptTransfer(SAMPLE_PARCEL_ID);
      await registry.connect(registrar).authorizeAndCommitTransfer(SAMPLE_PARCEL_ID);

      // Current Owner check
      const parcel = await registry.getParcel(SAMPLE_PARCEL_ID);
      expect(parcel.currentOwner).to.equal(rohit.address);
      expect(parcel.deedDocumentHash).to.equal(SALE_DEED_HASH_2);

      // Fast Title Verification Struct check
      const status = await registry.verifyTitle(SAMPLE_PARCEL_ID);
      expect(status.isCleanTitle).to.be.true;
      expect(status.currentOwner).to.equal(rohit.address);
      expect(status.isMortgaged).to.be.false;
      expect(status.isDisputed).to.be.false;
      expect(status.historyCount).to.equal(3n);
      expect(status.currentDeedHash).to.equal(SALE_DEED_HASH_2);
    });
  });
});
