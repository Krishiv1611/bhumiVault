import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "../lib/errors";
import { prisma } from "../lib/prisma";

export interface AuthPayload {
  userId: string;
  role: string;
  walletAddress: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "fallback_secret";

    const decoded = jwt.verify(token, secret) as AuthPayload;
    
    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }
    if (!user.isActive) {
      throw new ForbiddenError("User account is deactivated");
    }

    req.user = {
      userId: user.id,
      role: user.role,
      walletAddress: user.walletAddress
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError("Token expired"));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError("Invalid token"));
    } else {
      next(error);
    }
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError("Not authenticated"));
    }

    if (!roles.includes(req.user.role) && req.user.role !== "ADMIN") {
      return next(new ForbiddenError(`Requires one of roles: ${roles.join(", ")}`));
    }

    next();
  };
};
