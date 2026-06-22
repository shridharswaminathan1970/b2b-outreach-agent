// Auth business logic: credential verification, JWT issuance, and refresh-token
// rotation. Refresh tokens are persisted as SHA-256 hashes (never plaintext) in
// the refresh_tokens table so they can be revoked individually or in bulk.
import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import type { UserRole } from '../../middleware/auth.middleware';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  teamId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: PublicUser;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  exp?: number;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user: PublicUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      teamId: user.teamId,
      type: 'access',
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn } as jwt.SignOptions,
  );
}

function signRefreshToken(userId: string): { token: string; jti: string; expiresAt: Date } {
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: userId, jti, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions,
  );
  const decoded = jwt.decode(token) as RefreshTokenPayload | null;
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return { token, jti, expiresAt };
}

// Issue a fresh access + refresh pair and persist the refresh token hash.
async function issueTokens(user: PublicUser): Promise<AuthTokens> {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt } = signRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });
  return { accessToken, refreshToken };
}

export async function login(
  email: string,
  password: string,
  ipAddress?: string | null,
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Use the same error for "no user" and "wrong password" to avoid leaking
  // which emails exist.
  if (!user) throw Errors.unauthorized('Invalid email or password');
  if (user.status !== 'active') {
    throw Errors.forbidden('This account is not active');
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) throw Errors.unauthorized('Invalid email or password');

  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    companyId: user.companyId,
    teamId: user.teamId,
  };

  const tokens = await issueTokens(publicUser);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'auth.login',
    actorType: 'user',
    actorId: user.id,
    summary: `${user.email} logged in`,
    ipAddress,
  });

  return { user: publicUser, ...tokens };
}

export async function refresh(presentedToken: string): Promise<AuthTokens> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(presentedToken, config.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    throw Errors.unauthorized('Invalid or expired refresh token');
  }
  if (payload.type !== 'refresh') {
    throw Errors.unauthorized('Invalid token type');
  }

  const stored = await prisma.refreshToken.findFirst({
    where: {
      userId: payload.sub,
      tokenHash: hashToken(presentedToken),
      revoked: false,
    },
  });
  if (!stored || stored.expiresAt.getTime() < Date.now()) {
    throw Errors.unauthorized('Refresh token is no longer valid');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'active') {
    throw Errors.unauthorized('Account is not available');
  }

  // Rotate: revoke the presented token, then issue a brand-new pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  });

  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    companyId: user.companyId,
    teamId: user.teamId,
  };
  const tokens = await issueTokens(publicUser);

  await writeAuditLog({
    entityType: 'user',
    entityId: user.id,
    action: 'auth.refresh',
    actorType: 'user',
    actorId: user.id,
    summary: `${user.email} refreshed session`,
  });

  return tokens;
}

// Revoke a single refresh token (if provided) or all of the user's tokens.
export async function logout(
  userId: string,
  presentedToken?: string,
): Promise<void> {
  if (presentedToken) {
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash: hashToken(presentedToken), revoked: false },
      data: { revoked: true },
    });
  } else {
    await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  await writeAuditLog({
    entityType: 'user',
    entityId: userId,
    action: 'auth.logout',
    actorType: 'user',
    actorId: userId,
    summary: presentedToken ? 'Logged out (single session)' : 'Logged out (all sessions)',
  });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound('User not found');
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    companyId: user.companyId,
    teamId: user.teamId,
  };
}
