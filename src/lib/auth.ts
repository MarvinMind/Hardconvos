// Authentication utilities for PAWS
import bcrypt from 'bcryptjs'
import { sign, verify } from 'hono/jwt'
import { v4 as uuidv4 } from 'uuid'

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'paws-dev-secret-change-in-production'
const JWT_EXPIRES_IN = 60 * 60 * 24 * 7 // 7 days in seconds

export interface User {
  id: string
  email: string
  name: string | null
  created_at: number
  email_verified: number
  status: string
}

export interface JWTPayload {
  userId: string
  email: string
  exp: number
}

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

// Verify password against hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Generate JWT token
export async function generateToken(userId: string, email: string): Promise<string> {
  const payload: JWTPayload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRES_IN
  }
  
  return sign(payload, JWT_SECRET)
}

// Verify JWT token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET) as JWTPayload
    
    // Check if expired
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }
    
    return payload
  } catch (error) {
    return null
  }
}

// Generate UUID
export function generateId(): string {
  return uuidv4()
}

// Get current timestamp
export function now(): number {
  return Math.floor(Date.now() / 1000)
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validate password strength
export function isValidPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' }
  }
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' }
  }
  return { valid: true }
}
