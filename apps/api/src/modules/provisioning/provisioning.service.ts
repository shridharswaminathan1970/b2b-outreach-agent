// Provisioning business logic: the public signup request, and the platform
// owner's console (list / approve / reject). Approving a request creates a new
// Company + a super_admin user, seeds demo data, generates a one-time set-password
// token, and emails the requester a link that auto-logs them in.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { Errors } from '../../utils/response';
import { writeAuditLog } from '../audit/audit.service';
import { createPasswordResetToken } from '../auth/auth.service';
import { seedDemoData } from './provisioning.demoSeed';
import { sendOwnerNotification, sendResetLink } from './provisioning.email';
import type { Actor } from '../../utils/tenancy';
import type {
  CreateSignupRequestInput,
  ListSignupRequestsInput,
} from './provisioning.schema';

// ── Public: submit a signup request ──────────────────────────────────────────
export async function createSignupRequest(input: CreateSignupRequestInput) {
  const companyName = (input.companyName?.trim() || input.fullName).slice(0, 200);

  const request = await prisma.signupRequest.create({
    data: {
      companyName,
      fullName: input.fullName,
      email: input.email.trim().toLowerCase(),
      contactNumber: input.contactNumber ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      zip: input.zip ?? null,
      country: input.country ?? null,
      status: 'pending',
    },
    select: { id: true, companyName: true, fullName: true, email: true, contactNumber: true, country: true, status: true, createdAt: true },
  });

  // Notify the platform owner (best-effort; the request is stored regardless).
  await sendOwnerNotification(request);

  await writeAuditLog({
    entityType: 'signup_request',
    entityId: request.id,
    action: 'signup.request',
    actorType: 'system',
    actorId: null,
    summary: `Signup request from ${request.email} (${request.companyName})`,
    payload: { email: request.email, companyName: request.companyName },
  });

  return { id: request.id, status: request.status };
}

// ── Console (platform_owner) ──────────────────────────────────────────────────
export async function listSignupRequests(params: ListSignupRequestsInput) {
  return prisma.signupRequest.findMany({
    where: params.status ? { status: params.status } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export async function approveSignupRequest(id: string, actor: Actor) {
  const request = await prisma.signupRequest.findUnique({ where: { id } });
  if (!request) throw Errors.notFound('Signup request not found');
  if (request.status !== 'pending') {
    throw Errors.conflict(`Request is already ${request.status}`);
  }

  const email = request.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw Errors.conflict('A user with this email already exists');

  // Create tenant company + its default team + the super_admin (no usable password
  // yet — they set it via the reset link). Seed demo data so they have something
  // to explore. Wrapped so a failure doesn't leave a half-provisioned tenant.
  const placeholderHash = await bcrypt.hash(randomBytes(24).toString('hex'), config.bcryptRounds);

  const { company, user, team } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: request.companyName, status: 'active' },
    });
    const team = await tx.team.create({
      data: { companyId: company.id, name: 'Default Team', department: 'Sales' },
    });
    const user = await tx.user.create({
      data: {
        companyId: company.id,
        name: request.fullName,
        email,
        passwordHash: placeholderHash,
        role: 'super_admin',
        status: 'active',
      },
    });
    return { company, user, team };
  });

  // Demo data + set-password token are non-transactional (they're additive).
  await seedDemoData(company.id, user.id, team.id);
  const rawToken = await createPasswordResetToken(user.id);
  const resetUrl = `${config.webAppUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
  const emailSent = await sendResetLink(email, request.fullName, resetUrl);

  await prisma.signupRequest.update({
    where: { id },
    data: { status: 'approved', companyId: company.id, userId: user.id, processedBy: actor.id, processedAt: new Date() },
  });

  await writeAuditLog({
    entityType: 'signup_request',
    entityId: id,
    action: 'signup.approve',
    actorType: 'user',
    actorId: actor.id,
    companyId: company.id,
    summary: `Approved signup for ${email}; created company ${company.name} + super_admin`,
    payload: { companyId: company.id, userId: user.id, emailSent },
    ipAddress: actor.ipAddress,
  });

  // resetUrl is returned so the console can show/copy it (e.g. if email is mock or
  // delivery failed).
  return { requestId: id, companyId: company.id, userId: user.id, emailSent, resetUrl };
}

export async function rejectSignupRequest(id: string, actor: Actor, notes?: string) {
  const request = await prisma.signupRequest.findUnique({ where: { id } });
  if (!request) throw Errors.notFound('Signup request not found');
  if (request.status !== 'pending') {
    throw Errors.conflict(`Request is already ${request.status}`);
  }
  const updated = await prisma.signupRequest.update({
    where: { id },
    data: { status: 'rejected', processedBy: actor.id, processedAt: new Date(), notes: notes ?? null },
  });
  await writeAuditLog({
    entityType: 'signup_request',
    entityId: id,
    action: 'signup.reject',
    actorType: 'user',
    actorId: actor.id,
    summary: `Rejected signup request from ${request.email}`,
    ipAddress: actor.ipAddress,
  });
  return updated;
}
