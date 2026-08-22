import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { registerSchema, loginSchema } from "../lib/validators";
import { BadRequestError, UnauthorizedError, ConflictError } from "../lib/errors";
import { logActivity } from "../services/activityLog.service";

const generateToken = (userId: string, role: string, walletAddress: string | null) => {
  const secret = process.env.JWT_SECRET || "fallback_secret";
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign({ userId, role, walletAddress }, secret, { expiresIn: expiresIn as any });
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    
    // Check if user already exists by email
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email }
    });

    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    if (validatedData.walletAddress) {
      const existingWallet = await prisma.user.findUnique({
        where: { walletAddress: validatedData.walletAddress }
      });
      if (existingWallet) {
        throw new ConflictError("User with this wallet address already exists");
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(validatedData.password, salt);

    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        passwordHash,
        fullName: validatedData.fullName,
        phone: validatedData.phone,
        aadhaarHash: validatedData.aadhaarNumber ? await bcrypt.hash(validatedData.aadhaarNumber, 10) : null,
        role: validatedData.role as any,
        organization: validatedData.organization,
        designation: validatedData.designation,
        walletAddress: validatedData.walletAddress || null,
      }
    });

    await logActivity(
      user.id,
      user.walletAddress,
      "USER_REGISTERED",
      "AUTH",
      user.id,
      { role: user.role, email: user.email },
      req.ip,
      req.headers["user-agent"]
    );

    const token = generateToken(user.id, user.role, user.walletAddress);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          walletAddress: user.walletAddress
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      next(new BadRequestError("Validation failed"));
    } else {
      next(error);
    }
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.isActive) {
      throw new UnauthorizedError("Account is deactivated");
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError("Invalid email or password");
    }

    await logActivity(
      user.id,
      user.walletAddress,
      "USER_LOGIN",
      "AUTH",
      user.id,
      { role: user.role },
      req.ip,
      req.headers["user-agent"]
    );

    const token = generateToken(user.id, user.role, user.walletAddress);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          walletAddress: user.walletAddress
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      next(new BadRequestError("Validation failed"));
    } else {
      next(error);
    }
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        walletAddress: true,
        role: true,
        organization: true,
        designation: true,
        createdAt: true,
      }
    });

    if (!user) throw new UnauthorizedError("User not found");

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fullName, phone, walletAddress } = req.body;
    
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(fullName && { fullName }),
        ...(phone && { phone }),
        ...(walletAddress && { walletAddress }),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        walletAddress: true,
        role: true,
      }
    });

    await logActivity(
      updatedUser.id,
      updatedUser.walletAddress,
      "PROFILE_UPDATED",
      "AUTH",
      updatedUser.id,
      { fields: { fullName, phone, walletAddress } },
      req.ip,
      req.headers["user-agent"]
    );

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
};
