-- A student can learn several languages. Each existing profile keeps its language as the first
-- entry of student_languages and as the active one.
CREATE TABLE "student_languages" (
	"user_id" uuid NOT NULL,
	"language" "learning_language" NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_languages_user_id_language_pk" PRIMARY KEY("user_id","language")
);
--> statement-breakpoint
ALTER TABLE "student_languages" ADD CONSTRAINT "student_languages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "student_languages" ("user_id", "language", "enrolled_at")
SELECT "user_id", "learning_language", "created_at" FROM "student_profiles";--> statement-breakpoint
ALTER TABLE "student_profiles" RENAME COLUMN "learning_language" TO "active_language";--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_active_language_fk" FOREIGN KEY ("user_id","active_language") REFERENCES "public"."student_languages"("user_id","language") ON DELETE no action ON UPDATE no action;
