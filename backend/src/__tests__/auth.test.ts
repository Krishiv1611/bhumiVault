import request from "supertest";
import express from "express";
import authRoutes from "../../src/routes/auth.routes";
import { errorHandler } from "../../src/middleware/errorHandler";
import { prisma, pool } from "../../src/lib/prisma";

const app = express();
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use(errorHandler);

describe("Auth Routes", () => {
  beforeAll(async () => {
    // Clear users before tests
    await prisma.user.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const testUser = {
    email: "test@bhumivault.gov",
    password: "securepassword123",
    fullName: "Test Citizen",
    role: "CITIZEN",
  };

  it("should successfully register a new user", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);
  });

  it("should successfully login an existing user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it("should fail login with wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testUser.email,
        password: "wrongpassword",
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
