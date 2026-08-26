CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY,
	"reference" text NOT NULL UNIQUE,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"position" text NOT NULL,
	"handedness" text,
	"height_cm" integer,
	"weight_kg" integer,
	"preferred_number" integer,
	"jersey_size" text,
	"tier" text NOT NULL,
	"current_club" text,
	"seasons_played" integer,
	"town" text,
	"county" text,
	"guardian_name" text,
	"guardian_email" text,
	"guardian_phone" text,
	"emergency_name" text,
	"emergency_phone" text,
	"medical_notes" text,
	"photo_consent" boolean DEFAULT false NOT NULL,
	"safeguarding_ack" boolean DEFAULT false NOT NULL,
	"terms_ack" boolean DEFAULT false NOT NULL,
	"photo_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "registrations_created_at_idx" ON "registrations" ("created_at");--> statement-breakpoint
CREATE INDEX "registrations_status_idx" ON "registrations" ("status");--> statement-breakpoint
CREATE INDEX "registrations_tier_idx" ON "registrations" ("tier");