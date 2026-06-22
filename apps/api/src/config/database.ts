// Re-exports the shared Prisma client singleton from @outreach/db so the rest
// of the API imports the database from one place.
export { prisma } from '@outreach/db';
