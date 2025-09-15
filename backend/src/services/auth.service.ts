import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import { prisma } from '../database/connection';
import { appConfig } from '../config/app.config';
import { AppError } from '../api/middlewares/error.middleware';
import { logger } from '../utils/logger';

interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

export class AuthService {
  async register(data: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }) {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.email },
          { username: data.username }
        ]
      }
    });

    if (existingUser) {
      throw new AppError(409, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, appConfig.bcryptRounds);

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true
      }
    });

    const tokens = await this.generateTokens(user);
    
    logger.info(`New user registered: ${user.email}`);
    
    return { 
      user, 
      accessToken: tokens.accessToken,
      // Don't return refresh token in response body - it will be set as httpOnly cookie
      refreshToken: tokens.refreshToken 
    };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        createdAt: true,
        lastLogin: true
      }
    });

    if (!user || !user.isActive) {
      throw new AppError(401, 'Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    const tokens = await this.generateTokens(user);

    const { password: _, ...userWithoutPassword } = user;

    logger.info(`User logged in: ${user.email}`);

    return { 
      user: userWithoutPassword, 
      accessToken: tokens.accessToken,
      // Don't return refresh token in response body - it will be set as httpOnly cookie
      refreshToken: tokens.refreshToken 
    };
  }

  async refreshToken(refreshToken: string) {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new AppError(401, 'Invalid refresh token');
    }

    if (!storedToken.user.isActive) {
      throw new AppError(401, 'User account is deactivated');
    }

    await prisma.refreshToken.delete({
      where: { id: storedToken.id }
    });

    const tokens = await this.generateTokens(storedToken.user);

    return tokens;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { token: refreshToken },
            { userId }
          ]
        }
      });
    } else {
      await prisma.refreshToken.deleteMany({
        where: { userId }
      });
    }

    logger.info(`User logged out: ${userId}`);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true
      }
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new AppError(401, 'Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, appConfig.bcryptRounds);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    await prisma.refreshToken.deleteMany({
      where: { userId }
    });

    logger.info(`Password changed for user: ${user.email}`);
  }

  

  private async generateTokens(user: Pick<User, 'id' | 'email' | 'role'>) {
    const payload: TokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    const accessToken = jwt.sign(payload, appConfig.jwtSecret, {
      expiresIn: appConfig.jwtExpiry
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(
      { userId: user.id },
      appConfig.jwtSecret,
      { expiresIn: appConfig.refreshTokenExpiry } as jwt.SignOptions
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt
      }
    });

    return { accessToken, refreshToken };
  }
}

export const authService = new AuthService();