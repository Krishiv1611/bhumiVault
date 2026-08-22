import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
  aadhaarNumber: z.string().optional(), // We'll hash this before storing
  role: z.enum(["ADMIN", "REGISTRAR", "REVENUE", "BANK", "JUDICIARY", "CITIZEN"]).default("CITIZEN"),
  organization: z.string().optional(),
  designation: z.string().optional(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address").optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const registerParcelSchema = z.object({
  parcelId: z.string().min(1),
  stateCode: z.string().min(2).max(2),
  district: z.string().min(1),
  taluk: z.string().min(1),
  surveyNumber: z.string().min(1),
  areaSqMeters: z.number().positive(),
  landType: z.enum(["AGRICULTURAL", "RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "GOVERNMENT_RESERVED"]),
  initialOwner: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  deedDocumentHash: z.string().min(64),
  boundaryCoordinatesHash: z.string().min(64),
});

export const initiateTransferSchema = z.object({
  parcelId: z.string().min(1),
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  saleConsideration: z.number().nonnegative(),
  saleDeedHash: z.string().min(64),
  sellerPrivateKey: z.string().min(64).optional(), // For manual testing via API
});

export const applyMortgageSchema = z.object({
  parcelId: z.string().min(1),
  bankName: z.string().min(1),
  loanReferenceNumber: z.string().min(1),
  loanAmount: z.number().positive(),
  mortgageDocHash: z.string().min(64),
});

export const applyDisputeSchema = z.object({
  parcelId: z.string().min(1),
  courtName: z.string().min(1),
  caseNumber: z.string().min(1),
  courtOrderHash: z.string().min(64),
  reason: z.string().min(1),
});

export const initiateRecoverySchema = z.object({
  parcelId: z.string().min(1),
  proposedNewOwner: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  recoveryReasonDocHash: z.string().min(64),
});
