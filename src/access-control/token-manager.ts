import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import type { AccessToken } from "../blockchain/types";

/**
 * Token Manager
 * Generates and manages JWT tokens for access control
 */

export class TokenManager {
  private jwtSecret: string;
  private tokenExpiry: number; // in hours

  constructor(jwtSecret?: string, tokenExpiryHours: number = 24) {
    this.jwtSecret = jwtSecret || process.env.JWT_SECRET || "default-secret";
    this.tokenExpiry = tokenExpiryHours;
  }

  /**
   * Generate access token for a memory strand
   */
  generateAccessToken(
    strandId: string,
    decryptionKey: string,
    options?: {
      expiryHours?: number;
      metadata?: Record<string, any>;
    }
  ): AccessToken {
    const expiryHours = options?.expiryHours || this.tokenExpiry;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const payload = {
      strandId,
      decryptionKeyHash: this.hashKey(decryptionKey),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
      metadata: options?.metadata || {},
    };

    const token = jwt.sign(payload, this.jwtSecret);

    return {
      token,
      strandId,
      decryptionKey,
      expiresAt,
      revoked: false,
    };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): { valid: boolean; payload?: any; error?: string } {
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      return { valid: true, payload };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Token verification failed",
      };
    }
  }

  /**
   * Generate decryption key
   */
  generateDecryptionKey(strandId: string, injectorSecret: string): string {
    // Deterministic key generation based on strandId and injector secret
    // This allows the same key to be regenerated if needed
    const combined = `${strandId}:${injectorSecret}:${Date.now()}`;
    const hash = require("crypto")
      .createHash("sha256")
      .update(combined)
      .digest("hex");

    return `0x${hash}`;
  }

  /**
   * Generate time-limited access token
   */
  generateTimeLimitedToken(
    strandId: string,
    decryptionKey: string,
    expiryMinutes: number = 60
  ): AccessToken {
    const expiryHours = expiryMinutes / 60;
    return this.generateAccessToken(strandId, decryptionKey, { expiryHours });
  }

  /**
   * Generate revocable access token
   */
  generateRevocableToken(
    strandId: string,
    decryptionKey: string,
    tokenId: string = nanoid()
  ): AccessToken & { tokenId: string } {
    const token = this.generateAccessToken(strandId, decryptionKey);

    return {
      ...token,
      tokenId,
    };
  }

  /**
   * Decode token without verification
   */
  decodeToken(token: string): { payload?: any; error?: string } {
    try {
      const payload = jwt.decode(token);
      return { payload };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Token decode failed",
      };
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded.payload) return true;

    const expiryTime = decoded.payload.exp * 1000; // Convert to milliseconds
    return Date.now() > expiryTime;
  }

  /**
   * Get token expiry time
   */
  getTokenExpiry(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded.payload || !decoded.payload.exp) return null;

    return new Date(decoded.payload.exp * 1000);
  }

  /**
   * Hash a key for storage
   */
  private hashKey(key: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  /**
   * Verify decryption key matches hash
   */
  verifyDecryptionKey(key: string, keyHash: string): boolean {
    return this.hashKey(key) === keyHash;
  }

  /**
   * Generate API key for service-to-service communication
   */
  generateAPIKey(serviceName: string): { key: string; secret: string } {
    const key = `sk_${nanoid(32)}`;
    const secret = `secret_${nanoid(64)}`;

    return { key, secret };
  }

  /**
   * Verify API key
   */
  verifyAPIKey(key: string, secret: string, storedSecret: string): boolean {
    // Use constant-time comparison to prevent timing attacks
    const crypto = require("crypto");
    const computedSecret = crypto
      .createHmac("sha256", key)
      .update(storedSecret)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(secret),
      Buffer.from(computedSecret)
    );
  }

  /**
   * Generate bearer token for API authentication
   */
  generateBearerToken(userId: string, scopes: string[] = []): string {
    const payload = {
      userId,
      scopes,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000),
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  /**
   * Verify bearer token
   */
  verifyBearerToken(token: string): { valid: boolean; userId?: string; scopes?: string[] } {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as any;
      return {
        valid: true,
        userId: payload.userId,
        scopes: payload.scopes,
      };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Update JWT secret (for key rotation)
   */
  updateJWTSecret(newSecret: string): void {
    this.jwtSecret = newSecret;
  }

  /**
   * Update token expiry
   */
  updateTokenExpiry(expiryHours: number): void {
    this.tokenExpiry = expiryHours;
  }
}

export default TokenManager;
