// Zod schemas for the Prospecting module (Apollo people search + import).
import { z } from 'zod';

const strArray = z.array(z.string().trim().min(1).max(120)).max(25).optional();

// At least one filter must be present so we never run an unbounded search.
export const searchProspectsSchema = z
  .object({
    titles: strArray,
    keywords: z.string().trim().max(200).optional(),
    domains: strArray,
    locations: strArray,
    seniorities: strArray,
    employeeRanges: strArray, // e.g. "1,10" "11,50" "51,200" "201,500" "501,1000" "1001,5000"
    page: z.coerce.number().int().positive().max(50).default(1),
    perPage: z.coerce.number().int().positive().max(50).default(10),
  })
  .refine(
    (d) =>
      Boolean(
        d.titles?.length ||
          d.keywords ||
          d.domains?.length ||
          d.locations?.length ||
          d.seniorities?.length ||
          d.employeeRanges?.length,
      ),
    { message: 'Provide at least one search filter' },
  );

// A prospect chosen for import (subset of the search result we persist).
export const prospectPersonSchema = z.object({
  externalId: z.string().max(200).nullish(),
  firstName: z.string().max(120).nullish(),
  lastName: z.string().max(120).nullish(),
  name: z.string().trim().min(1).max(200),
  title: z.string().max(200).nullish(),
  email: z.string().max(200).nullish(),
  linkedinUrl: z.string().max(500).nullish(),
  seniority: z.string().max(100).nullish(),
  location: z.string().max(200).nullish(),
  company: z.string().max(200).nullish(),
  companyDomain: z.string().max(200).nullish(),
  companySize: z.string().max(50).nullish(),
  industry: z.string().max(120).nullish(),
});

export const importProspectsSchema = z.object({
  people: z.array(prospectPersonSchema).min(1, 'Select at least one prospect').max(200),
});

export type SearchProspectsInput = z.infer<typeof searchProspectsSchema>;
export type ProspectPersonInput = z.infer<typeof prospectPersonSchema>;
export type ImportProspectsInput = z.infer<typeof importProspectsSchema>;
