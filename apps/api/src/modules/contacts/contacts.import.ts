// CSV parsing + header mapping for contact import. The parser is tolerant of
// common header variations (e.g. "First Name", "first_name", "firstname") and
// emits rows in the same shape the import service consumes.
import { parse } from 'csv-parse/sync';
import type { ImportContactRow } from './contacts.schema';

// Maps a normalized header (lowercased, non-alphanumerics stripped) to a field.
const HEADER_ALIASES: Record<string, keyof ImportContactRow> = {
  name: 'name',
  fullname: 'name',
  firstname: 'firstName',
  first: 'firstName',
  givenname: 'firstName',
  lastname: 'lastName',
  last: 'lastName',
  surname: 'lastName',
  familyname: 'lastName',
  email: 'email',
  emailaddress: 'email',
  workemail: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  title: 'title',
  jobtitle: 'title',
  position: 'title',
  company: 'company',
  companyname: 'company',
  account: 'company',
  organization: 'company',
  linkedin: 'linkedinUrl',
  linkedinurl: 'linkedinUrl',
  linkedinprofile: 'linkedinUrl',
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface ParsedCsv {
  rows: ImportContactRow[];
  skipped: number; // rows dropped for having no usable data
}

// Parse a raw CSV buffer into typed import rows. Unknown columns are ignored.
export function parseContactsCsv(buffer: Buffer): ParsedCsv {
  const records = parse(buffer, {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Array<Record<string, string>>;

  const rows: ImportContactRow[] = [];
  let skipped = 0;

  for (const record of records) {
    const row: Record<string, string> = {};
    for (const [normHeader, value] of Object.entries(record)) {
      const field = HEADER_ALIASES[normHeader];
      if (field && value) row[field] = value;
    }

    // Require at least an email or some name component.
    if (!row.email && !row.name && !row.firstName && !row.lastName) {
      skipped += 1;
      continue;
    }
    rows.push(row as ImportContactRow);
  }

  return { rows, skipped };
}

// Build a non-null display name from whatever the row provides (the DB column
// is NOT NULL). Falls back to the email local-part, then a generic label.
export function deriveContactName(row: {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}): string {
  if (row.name && row.name.trim()) return row.name.trim();
  const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (row.email) return row.email.split('@')[0];
  return 'Unknown Contact';
}
