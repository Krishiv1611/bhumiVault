import { ethers, JsonRpcProvider, Wallet } from "ethers";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

// Load contract ABI from the sdk artifacts
function loadContractArtifacts(): { abi: any[]; contractAddress: string } {
  const artifactsPath = path.join(__dirname, "../../../sdk/contractArtifacts.json");
  if (fs.existsSync(artifactsPath)) {
    const artifacts = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));
    return { abi: artifacts.abi, contractAddress: artifacts.contractAddress };
  }
  throw new Error("Contract artifacts not found at " + artifactsPath);
}

let _provider: JsonRpcProvider | null = null;
let _contract: ethers.Contract | null = null;
let _artifacts: { abi: any[]; contractAddress: string } | null = null;

function getArtifacts() {
  if (!_artifacts) {
    _artifacts = loadContractArtifacts();
  }
  return _artifacts;
}

export function getProvider(): JsonRpcProvider {
  if (!_provider) {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
    _provider = new JsonRpcProvider(rpcUrl);
  }
  return _provider;
}

export function getContract(): ethers.Contract {
  if (!_contract) {
    const { abi, contractAddress } = getArtifacts();
    const address = process.env.CONTRACT_ADDRESS || contractAddress;
    _contract = new ethers.Contract(address, abi, getProvider());
  }
  return _contract;
}

export function getContractWithSigner(privateKey: string): ethers.Contract {
  const { abi, contractAddress } = getArtifacts();
  const address = process.env.CONTRACT_ADDRESS || contractAddress;
  const wallet = new Wallet(privateKey, getProvider());
  return new ethers.Contract(address, abi, wallet);
}

export function getSignerWallet(privateKey: string): Wallet {
  return new Wallet(privateKey, getProvider());
}

/**
 * Get the appropriate private key for a given on-chain role.
 * In production, these would come from a vault / KMS.
 */
export function getRolePrivateKey(role: string): string {
  const keyMap: Record<string, string | undefined> = {
    ADMIN: process.env.ADMIN_PRIVATE_KEY,
    REGISTRAR: process.env.REGISTRAR_PRIVATE_KEY,
    REVENUE: process.env.REVENUE_PRIVATE_KEY,
    BANK: process.env.BANK_PRIVATE_KEY,
    JUDICIARY: process.env.JUDICIARY_PRIVATE_KEY,
  };
  const key = keyMap[role];
  if (!key) {
    throw new Error(`No private key configured for role: ${role}`);
  }
  return key;
}

/**
 * Compute SHA-256 hash of a buffer or string.
 */
export function computeSHA256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
