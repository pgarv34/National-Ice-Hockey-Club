import { randomInt } from "node:crypto";

export const POSITIONS = ["Forward", "Defence", "Goaltender"] as const;
export const TIERS = ["Tier 1", "Tier 2", "Tier 3", "Development"] as const;
export const HANDEDNESS = ["Left", "Right"] as const;
export const JERSEY_SIZES = ["YM", "YL", "S", "M", "L", "XL", "XXL"] as const;

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type FieldErrors = Record<string, string>;

export interface ParsedRegistration {
  reference: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string | null;
  position: string;
  handedness: string | null;
  heightCm: number | null;
  weightKg: number | null;
  preferredNumber: number | null;
  jerseySize: string | null;
  tier: string;
  currentClub: string | null;
  seasonsPlayed: number | null;
  town: string | null;
  county: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  medicalNotes: string | null;
  photoConsent: boolean;
  safeguardingAck: boolean;
  termsAck: boolean;
}

/** Ambiguity-free alphabet: no O/0, I/1, S/5. */
export function newReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[randomInt(alphabet.length)];
  return `NIHC-${out}`;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

function int(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return Math.trunc(parsed);
}

/** Age in whole years at the given reference date. */
export function ageOn(dateOfBirth: string, on = new Date()): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRegistration(raw: Record<string, unknown>): {
  errors: FieldErrors;
  value?: ParsedRegistration;
} {
  const errors: FieldErrors = {};

  const firstName = text(raw.firstName, 80);
  if (!firstName) errors.firstName = "Enter the player's first name.";

  const lastName = text(raw.lastName, 80);
  if (!lastName) errors.lastName = "Enter the player's last name.";

  const email = text(raw.email, 160);
  if (!email) errors.email = "Enter an email address.";
  else if (!EMAIL.test(email)) errors.email = "That email address does not look right.";

  const dateOfBirth = text(raw.dateOfBirth, 10);
  let age: number | null = null;
  if (!dateOfBirth || !ISO_DATE.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth))) {
    errors.dateOfBirth = "Enter a date of birth.";
  } else {
    age = ageOn(dateOfBirth);
    if (age < 4) errors.dateOfBirth = "Players must be at least 4 years old to register.";
    else if (age > 80) errors.dateOfBirth = "Check the date of birth — that age is out of range.";
  }

  const position = text(raw.position, 32);
  if (!position || !POSITIONS.includes(position as (typeof POSITIONS)[number])) {
    errors.position = "Choose a position.";
  }

  const tier = text(raw.tier, 32);
  if (!tier || !TIERS.includes(tier as (typeof TIERS)[number])) {
    errors.tier = "Choose the tier you are registering for.";
  }

  const handednessRaw = text(raw.handedness, 16);
  const handedness =
    handednessRaw && HANDEDNESS.includes(handednessRaw as (typeof HANDEDNESS)[number])
      ? handednessRaw
      : null;

  const jerseyRaw = text(raw.jerseySize, 8);
  const jerseySize =
    jerseyRaw && JERSEY_SIZES.includes(jerseyRaw as (typeof JERSEY_SIZES)[number])
      ? jerseyRaw
      : null;

  const guardianName = text(raw.guardianName, 120);
  const guardianEmail = text(raw.guardianEmail, 160);
  const guardianPhone = text(raw.guardianPhone, 40);

  // Under-18s need a responsible adult on the record.
  if (age !== null && age < 18) {
    if (!guardianName) errors.guardianName = "A parent or guardian name is required for under-18s.";
    if (!guardianEmail) errors.guardianEmail = "A parent or guardian email is required for under-18s.";
    else if (!EMAIL.test(guardianEmail)) errors.guardianEmail = "That email address does not look right.";
  }
  if (guardianEmail && !errors.guardianEmail && !EMAIL.test(guardianEmail)) {
    errors.guardianEmail = "That email address does not look right.";
  }

  const safeguardingAck = bool(raw.safeguardingAck);
  if (!safeguardingAck) errors.safeguardingAck = "Please confirm you have read the safeguarding policy.";

  const termsAck = bool(raw.termsAck);
  if (!termsAck) errors.termsAck = "Please accept the terms and privacy policy.";

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    value: {
      reference: newReference(),
      firstName: firstName as string,
      lastName: lastName as string,
      dateOfBirth: dateOfBirth as string,
      email: email as string,
      phone: text(raw.phone, 40),
      position: position as string,
      handedness,
      heightCm: int(raw.heightCm, 90, 230),
      weightKg: int(raw.weightKg, 20, 200),
      preferredNumber: int(raw.preferredNumber, 1, 99),
      jerseySize,
      tier: tier as string,
      currentClub: text(raw.currentClub, 120),
      seasonsPlayed: int(raw.seasonsPlayed, 0, 60),
      town: text(raw.town, 80),
      county: text(raw.county, 80),
      guardianName,
      guardianEmail,
      guardianPhone,
      emergencyName: text(raw.emergencyName, 120),
      emergencyPhone: text(raw.emergencyPhone, 40),
      medicalNotes: text(raw.medicalNotes, 2000),
      photoConsent: bool(raw.photoConsent),
      safeguardingAck,
      termsAck,
    },
  };
}
