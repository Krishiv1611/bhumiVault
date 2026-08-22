import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

import authRoutes from "./routes/auth.routes";
import parcelRoutes from "./routes/parcel.routes";
import transferRoutes from "./routes/transfer.routes";
import mortgageRoutes from "./routes/mortgage.routes";
import disputeRoutes from "./routes/dispute.routes";
import recoveryRoutes from "./routes/recovery.routes";
import documentRoutes from "./routes/document.routes";
import activityRoutes from "./routes/activity.routes";
import { errorHandler } from "./middleware/errorHandler";
import { syncBlockchainToDb } from "./services/blockchainSync.service";
import { prisma } from "./lib/prisma";
import { getProvider } from "./lib/blockchain";

// BigInt JSON serializer to prevent res.json() crashes with on-chain timestamps/blocks
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use("/api/", apiLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/parcels", parcelRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/mortgages", mortgageRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/recovery", recoveryRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/activity", activityRoutes);

// Health Check Endpoint
app.get("/api/health", async (req: Request, res: Response) => {
  let dbStatus = "ok";
  let chainStatus = "ok";
  let blockHeight = 0;
  let chainId = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    dbStatus = "error";
  }

  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    blockHeight = await provider.getBlockNumber();
    chainId = Number(network.chainId);
  } catch (e) {
    chainStatus = "error";
  }

  res.json({
    success: true,
    data: {
      status: dbStatus === "ok" && chainStatus === "ok" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        blockchain: {
          status: chainStatus,
          blockHeight,
          chainId
        }
      }
    }
  });
});

// Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, async () => {
    console.log(`🚀 BhumiVault Backend Server running on port ${PORT}`);
    
    // Safe startup sync from blockchain
    try {
      if (process.env.AUTO_SYNC_ON_STARTUP === "true") {
        await syncBlockchainToDb();
      }
    } catch (err) {
      console.warn("⚠️ Initial blockchain sync skipped (RPC offline or contract not deployed yet).");
    }
  });
}

export default app;
