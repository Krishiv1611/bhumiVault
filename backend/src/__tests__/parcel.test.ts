import request from "supertest";
import app from "../index";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";

describe("Parcel & System Integration Tests", () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test user if not exists
    const user = await prisma.user.upsert({
      where: { email: "parceltest@bhumivault.gov" },
      update: {},
      create: {
        email: "parceltest@bhumivault.gov",
        passwordHash: "dummyhash",
        fullName: "Parcel Tester",
        role: "ADMIN"
      }
    });
    testUserId = user.id;

    const secret = process.env.JWT_SECRET || "fallback_secret";
    authToken = jwt.sign(
      { userId: user.id, role: user.role, walletAddress: user.walletAddress },
      secret,
      { expiresIn: "1h" }
    );
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: "parceltest@bhumivault.gov" }
    });
  });

  describe("GET /api/health", () => {
    it("should return health status with database connection", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.services.database).toBe("ok");
    });
  });

  describe("GET /api/parcels", () => {
    it("should return 401 without auth token", async () => {
      const res = await request(app).get("/api/parcels");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return parcels list with valid token", async () => {
      const res = await request(app)
        .get("/api/parcels")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.parcels)).toBe(true);
      expect(res.body.data.total).toBeDefined();
    });
  });

  describe("GET /api/parcels/stats", () => {
    it("should return summary statistics", async () => {
      const res = await request(app)
        .get("/api/parcels/stats")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalParcels).toBeDefined();
      expect(res.body.data.cleanCount).toBeDefined();
    });
  });
});
