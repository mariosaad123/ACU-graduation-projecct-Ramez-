ALTER TYPE "public"."file_purpose" ADD VALUE 'submission';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'assignment';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'nudge';--> statement-breakpoint
CREATE TABLE "assignment_attachments" (
	"assignment_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "assignment_attachments_assignment_id_file_id_pk" PRIMARY KEY("assignment_id","file_id"),
	CONSTRAINT "assignment_attachments_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone,
	"allow_late" boolean DEFAULT true NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "assignments_column_id_unique" UNIQUE("column_id")
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"reacted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_id_user_id_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "submission_files" (
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "submission_files_assignment_id_file_id_pk" PRIMARY KEY("assignment_id","file_id"),
	CONSTRAINT "submission_files_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"body" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	CONSTRAINT "submissions_assignment_id_student_id_pk" PRIMARY KEY("assignment_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "grade_columns" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "assignments" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_column_id_grade_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."grade_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_group_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."group_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_fk" FOREIGN KEY ("assignment_id","student_id") REFERENCES "public"."submissions"("assignment_id","student_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_group_idx" ON "assignments" USING btree ("group_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "student_profiles" SET "university_id" = NULLIF(upper(btrim("university_id")), '');--> statement-breakpoint
UPDATE "student_profiles" AS later SET "university_id" = NULL WHERE EXISTS (SELECT 1 FROM "student_profiles" AS earlier WHERE earlier."university_id" = later."university_id" AND earlier."created_at" < later."created_at");--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_university_id_key" UNIQUE("university_id");