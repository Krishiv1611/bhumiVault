import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("=================================================");
  console.log("  BHUMI-VAULT: Smart Contract Deployment");
  console.log("=================================================");

  const [admin, registrar, revenueOfficer, bankOfficer, judge] = await ethers.getSigners();

  console.log(`Deployer / Admin:     ${admin.address}`);
  console.log(`Sub-Registrar Node:   ${registrar.address}`);
  console.log(`Revenue Officer Node: ${revenueOfficer.address}`);
  console.log(`Bank Node:            ${bankOfficer.address}`);
  console.log(`Judiciary Node:       ${judge.address}`);

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

  console.log(`\n✅ BhumiVaultRegistry deployed successfully at: ${contractAddress}`);

  // Export contract artifacts and deployment metadata for Backend & Frontend SDK
  const artifactPath = path.join(__dirname, "../artifacts/contracts/BhumiVaultRegistry.sol/BhumiVaultRegistry.json");
  let abi = [];
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    abi = artifact.abi;
  }

  const exportData = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contractAddress: contractAddress,
    deployedAt: new Date().toISOString(),
    roles: {
      admin: admin.address,
      registrar: registrar.address,
      revenueOfficer: revenueOfficer.address,
      bankOfficer: bankOfficer.address,
      judge: judge.address,
    },
    abi: abi,
  };

  const sdkDir = path.join(__dirname, "../sdk");
  if (!fs.existsSync(sdkDir)) {
    fs.mkdirSync(sdkDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(sdkDir, "contractArtifacts.json"),
    JSON.stringify(exportData, null, 2)
  );

  console.log(`📦 Exported SDK configuration to: sdk/contractArtifacts.json`);
  console.log("=================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
