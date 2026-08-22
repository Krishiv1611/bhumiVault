import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export const getActivities = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, entityType, action } = req.query;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;

    const activities = await prisma.activityLog.findMany({
      where,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { fullName: true, email: true, role: true } }
      }
    });

    const total = await prisma.activityLog.count({ where });

    res.json({
      success: true,
      data: {
        activities,
        total,
        page: Number(page),
        limit: Number(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getActivitiesByParcel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // parcelId
    const activities = await prisma.activityLog.findMany({
      where: { entityType: "PARCEL", entityId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { fullName: true, email: true, role: true } }
      }
    });

    res.json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
};
