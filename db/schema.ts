import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Player registrations submitted through /register.
 * One row per player, per season intake.
 */
export const registrations = pgTable(
  "registrations",
  {
    id: serial().primaryKey(),

    // Human-quotable reference shown to the player on submission.
    reference: text().notNull().unique(),

    // Identity
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    email: text().notNull(),
    phone: text(),

    // On-ice profile
    position: text().notNull(),
    handedness: text(),
    heightCm: integer("height_cm"),
    weightKg: integer("weight_kg"),
    preferredNumber: integer("preferred_number"),
    jerseySize: text("jersey_size"),

    // Placement
    tier: text().notNull(),
    currentClub: text("current_club"),
    seasonsPlayed: integer("seasons_played"),
    town: text(),
    county: text(),

    // Guardian — required by the form when the player is under 18
    guardianName: text("guardian_name"),
    guardianEmail: text("guardian_email"),
    guardianPhone: text("guardian_phone"),

    // Safety
    emergencyName: text("emergency_name"),
    emergencyPhone: text("emergency_phone"),
    medicalNotes: text("medical_notes"),

    // Consents
    photoConsent: boolean("photo_consent").notNull().default(false),
    safeguardingAck: boolean("safeguarding_ack").notNull().default(false),
    termsAck: boolean("terms_ack").notNull().default(false),

    // Blobs key for the uploaded ID photo, if one was provided
    photoKey: text("photo_key"),

    // Review workflow
    status: text().notNull().default("pending"),
    reviewNote: text("review_note"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("registrations_created_at_idx").on(table.createdAt),
    index("registrations_status_idx").on(table.status),
    index("registrations_tier_idx").on(table.tier),
  ],
);
