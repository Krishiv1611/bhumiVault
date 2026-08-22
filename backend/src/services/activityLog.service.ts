import { prisma } from "../lib/prisma";

export const logActivity = async (
  userId: string | null,
  walletAddress: string | null,
  action: string,
  entityType: string,
  entityId: string | null = null,
  details: any = null,
  ipAddress: string | null = null,
  userAgent: string | null = null
) => {
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        walletAddress,
        action,
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent
      }
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
};
