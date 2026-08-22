-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REGISTRAR', 'REVENUE', 'BANK', 'JUDICIARY', 'CITIZEN');

-- CreateEnum
CREATE TYPE "LandType" AS ENUM ('AGRICULTURAL', 'RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'GOVERNMENT_RESERVED');

-- CreateEnum
CREATE TYPE "DocumentPurpose" AS ENUM ('SALE_DEED', 'GENESIS_DEED', 'MORTGAGE_DOC', 'MORTGAGE_NOC', 'COURT_ORDER', 'COURT_JUDGMENT', 'RECOVERY_DOC', 'SUCCESSION_CERTIFICATE', 'CADASTRAL_MAP', 'IDENTITY_PROOF', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "aadhaarHash" TEXT,
    "walletAddress" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CITIZEN',
    "organization" TEXT,
    "designation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandParcel" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "taluk" TEXT NOT NULL,
    "surveyNumber" TEXT NOT NULL,
    "areaSqMeters" DOUBLE PRECISION NOT NULL,
    "landType" "LandType" NOT NULL DEFAULT 'RESIDENTIAL',
    "currentOwnerAddress" TEXT NOT NULL,
    "currentOwnerUserId" TEXT,
    "deedDocumentHash" TEXT NOT NULL,
    "boundaryCoordinatesHash" TEXT NOT NULL,
    "activeMortgagesCount" INTEGER NOT NULL DEFAULT 0,
    "activeDisputesCount" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "exists" BOOLEAN NOT NULL DEFAULT true,
    "creationTimestamp" BIGINT NOT NULL DEFAULT 0,
    "lastUpdatedTimestamp" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipHistory" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "historyIndex" INTEGER NOT NULL,
    "fromOwnerAddress" TEXT NOT NULL,
    "toOwnerAddress" TEXT NOT NULL,
    "transferType" TEXT NOT NULL,
    "deedDocumentHash" TEXT NOT NULL,
    "registrarApproverAddress" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferRequest" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "buyerAddress" TEXT NOT NULL,
    "saleConsideration" DOUBLE PRECISION NOT NULL,
    "saleDeedHash" TEXT NOT NULL,
    "sellerApproved" BOOLEAN NOT NULL DEFAULT true,
    "buyerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "govtApproved" BOOLEAN NOT NULL DEFAULT false,
    "registrarApproverAddress" TEXT,
    "initiatedTimestamp" BIGINT NOT NULL,
    "expiryTimestamp" BIGINT NOT NULL,
    "completedTimestamp" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MortgageRecord" (
    "id" TEXT NOT NULL,
    "mortgageIdOnChain" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "loanReferenceNumber" TEXT NOT NULL,
    "loanAmount" DOUBLE PRECISION NOT NULL,
    "mortgageDocHash" TEXT NOT NULL,
    "bankOfficerAddress" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" BIGINT NOT NULL,
    "releaseDocHash" TEXT,
    "releasedTimestamp" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MortgageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeRecord" (
    "id" TEXT NOT NULL,
    "disputeIdOnChain" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "courtName" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "courtOrderHash" TEXT NOT NULL,
    "disputeReason" TEXT NOT NULL,
    "judgeSignerAddress" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" BIGINT NOT NULL,
    "judgmentDocHash" TEXT,
    "liftedTimestamp" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisputeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryRequest" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "currentRecordedOwnerAddress" TEXT NOT NULL,
    "proposedNewOwnerAddress" TEXT NOT NULL,
    "recoveryReasonDocHash" TEXT NOT NULL,
    "registrarApproved" BOOLEAN NOT NULL DEFAULT false,
    "judiciaryApproved" BOOLEAN NOT NULL DEFAULT false,
    "registrarSignerAddress" TEXT,
    "judiciarySignerAddress" TEXT,
    "requestedTimestamp" BIGINT NOT NULL,
    "challengeEndTime" BIGINT NOT NULL DEFAULT 0,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "purpose" "DocumentPurpose" NOT NULL DEFAULT 'OTHER',
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "walletAddress" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "LandParcel_parcelId_key" ON "LandParcel"("parcelId");

-- CreateIndex
CREATE INDEX "LandParcel_district_idx" ON "LandParcel"("district");

-- CreateIndex
CREATE INDEX "LandParcel_stateCode_idx" ON "LandParcel"("stateCode");

-- CreateIndex
CREATE INDEX "LandParcel_currentOwnerAddress_idx" ON "LandParcel"("currentOwnerAddress");

-- CreateIndex
CREATE INDEX "LandParcel_landType_idx" ON "LandParcel"("landType");

-- CreateIndex
CREATE INDEX "LandParcel_isLocked_idx" ON "LandParcel"("isLocked");

-- CreateIndex
CREATE INDEX "OwnershipHistory_parcelId_idx" ON "OwnershipHistory"("parcelId");

-- CreateIndex
CREATE INDEX "OwnershipHistory_toOwnerAddress_idx" ON "OwnershipHistory"("toOwnerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipHistory_parcelId_historyIndex_key" ON "OwnershipHistory"("parcelId", "historyIndex");

-- CreateIndex
CREATE INDEX "TransferRequest_parcelId_idx" ON "TransferRequest"("parcelId");

-- CreateIndex
CREATE INDEX "TransferRequest_sellerAddress_idx" ON "TransferRequest"("sellerAddress");

-- CreateIndex
CREATE INDEX "TransferRequest_buyerAddress_idx" ON "TransferRequest"("buyerAddress");

-- CreateIndex
CREATE INDEX "TransferRequest_isActive_idx" ON "TransferRequest"("isActive");

-- CreateIndex
CREATE INDEX "MortgageRecord_parcelId_idx" ON "MortgageRecord"("parcelId");

-- CreateIndex
CREATE INDEX "MortgageRecord_bankName_idx" ON "MortgageRecord"("bankName");

-- CreateIndex
CREATE INDEX "MortgageRecord_isActive_idx" ON "MortgageRecord"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MortgageRecord_parcelId_mortgageIdOnChain_key" ON "MortgageRecord"("parcelId", "mortgageIdOnChain");

-- CreateIndex
CREATE INDEX "DisputeRecord_parcelId_idx" ON "DisputeRecord"("parcelId");

-- CreateIndex
CREATE INDEX "DisputeRecord_caseNumber_idx" ON "DisputeRecord"("caseNumber");

-- CreateIndex
CREATE INDEX "DisputeRecord_isActive_idx" ON "DisputeRecord"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DisputeRecord_parcelId_disputeIdOnChain_key" ON "DisputeRecord"("parcelId", "disputeIdOnChain");

-- CreateIndex
CREATE INDEX "RecoveryRequest_parcelId_idx" ON "RecoveryRequest"("parcelId");

-- CreateIndex
CREATE INDEX "RecoveryRequest_proposedNewOwnerAddress_idx" ON "RecoveryRequest"("proposedNewOwnerAddress");

-- CreateIndex
CREATE INDEX "RecoveryRequest_isActive_idx" ON "RecoveryRequest"("isActive");

-- CreateIndex
CREATE INDEX "Document_parcelId_idx" ON "Document"("parcelId");

-- CreateIndex
CREATE INDEX "Document_sha256Hash_idx" ON "Document"("sha256Hash");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_idx" ON "ActivityLog"("entityType");

-- CreateIndex
CREATE INDEX "ActivityLog_entityId_idx" ON "ActivityLog"("entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "LandParcel" ADD CONSTRAINT "LandParcel_currentOwnerUserId_fkey" FOREIGN KEY ("currentOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipHistory" ADD CONSTRAINT "OwnershipHistory_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "LandParcel"("parcelId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "LandParcel"("parcelId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageRecord" ADD CONSTRAINT "MortgageRecord_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "LandParcel"("parcelId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeRecord" ADD CONSTRAINT "DisputeRecord_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "LandParcel"("parcelId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "LandParcel"("parcelId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "LandParcel"("parcelId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
