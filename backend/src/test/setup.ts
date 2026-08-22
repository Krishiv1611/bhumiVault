import { prisma, pool } from "../lib/prisma";

beforeAll(async () => {
  // Any global setup before tests
});

afterAll(async () => {
  try {
    await prisma.$disconnect();
  } catch (e) {}
  try {
    if (!pool.ended) {
      await pool.end();
    }
  } catch (e) {}
});
