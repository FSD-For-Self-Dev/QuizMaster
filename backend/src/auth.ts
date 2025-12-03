import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from './database';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

class AuthService {
  private jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      // Check if user already exists
      const existingEmail = await db.findUserByEmail(userData.email);
      if (existingEmail) {
        throw new Error('Email already registered');
      }

      const existingUsername = await db.findUserByUsername(userData.username);
      if (existingUsername) {
        throw new Error('Username already taken');
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      // Create user
      const user = await db.createUser({
        email: userData.email,
        username: userData.username,
        password_hash: passwordHash
      });

      // Generate JWT token
      const token = this.generateToken({
        id: user.id,
        email: user.email,
        username: user.username
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username
        },
        token
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      // Find user by email
      const user = await db.findUserByEmail(credentials.email);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(credentials.password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Generate JWT token
      const token = this.generateToken({
        id: user.id,
        email: user.email,
        username: user.username
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username
        },
        token
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  private generateToken(user: AuthUser): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username
      },
      this.jwtSecret,
      { expiresIn: '7d' }
    );
  }

  verifyToken(token: string): AuthUser {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      return {
        id: decoded.userId,
        email: decoded.email,
        username: decoded.username
      };
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }
}

export const authService = new AuthService();
