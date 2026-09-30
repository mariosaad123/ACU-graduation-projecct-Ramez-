# Data model

PostgreSQL, accessed through Drizzle ORM. The schema lives in `apps/api/src/db/schema.ts` and
every change ships as a reviewed SQL migration in `apps/api/drizzle/`.

## Accounts

```mermaid
erDiagram
    users ||--o| student_profiles : "has"
    users ||--o{ student_languages : "learns"
    student_languages ||--o| student_profiles : "is active in"
    users ||--o| doctor_profiles : "has"
    users ||--o{ sessions : "signs in with"
    users ||--o{ email_verifications : "confirms"
    users ||--o{ audit_events : "acts in"
    users ||--o{ doctor_access_codes : "rotates"

    users {
        uuid id PK
        text google_subject UK "Google 'sub', stable across email changes"
        text email
        boolean email_verified
        text name
        text avatar_url
        user_role role "null until setup is finished"
        timestamptz last_sign_in_at
        timestamptz disabled_at
    }
    student_profiles {
        uuid user_id PK, FK
        learning_language active_language FK "with user_id, to student_languages"
        learning_goal goal
    }
    student_languages {
        uuid user_id PK, FK
        learning_language language PK
        timestamptz enrolled_at
    }
    doctor_profiles {
        uuid user_id PK, FK
        text staff_id UK
        text display_name
        text university_email UK
        doctor_status status "pending_verification | active"
        timestamptz verified_at
    }
    doctor_access_codes {
        uuid id PK
        text code_hash "Argon2id"
        uuid created_by_user_id FK
        timestamptz revoked_at
    }
    email_verifications {
        uuid id PK
        uuid user_id FK
        text email
        text purpose
        text code_hash "Argon2id"
        int attempts
        timestamptz sent_at
        timestamptz expires_at
        timestamptz consumed_at
    }
    sessions {
        uuid id PK
        uuid user_id FK
        text token_hash UK "SHA-256 of the cookie value"
        text user_agent
        timestamptz last_seen_at
        timestamptz expires_at
    }
    auth_flows {
        uuid id PK
        text state
        text nonce
        text code_verifier
        text return_to
        timestamptz expires_at
    }
    audit_events {
        uuid id PK
        uuid actor_user_id FK
        text action
        jsonb metadata
        text ip_address
        timestamptz created_at
    }
```

`auth_flows` has no relation: it holds a sign-in that is on its way to Google and back, before
any account is known.

## Rules the schema enforces

| Rule                                          | How                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| One account per Google identity               | Unique `users.google_subject`                                            |
| One account per doctor                        | Unique `doctor_profiles.staff_id` and `university_email`                 |
| A person is a student or a doctor, never both | Setting up either role removes the other profile in the same transaction |
| A student studies one of their own languages  | Composite key `(user_id, active_language)` to `student_languages`        |
| A language is added once per student          | Primary key `(user_id, language)` on `student_languages`                 |
| Deleting a user removes their data            | `ON DELETE CASCADE` on profiles, languages, sessions and email codes     |
| Audit history survives account deletion       | `ON DELETE SET NULL` on `audit_events.actor_user_id`                     |

## What is never stored in clear

| Secret                  | Stored as                                 |
| ----------------------- | ----------------------------------------- |
| Session token           | SHA-256 hash (the cookie holds the token) |
| Doctor access code      | Argon2id hash                             |
| Email confirmation code | Argon2id hash                             |

A copy of the database therefore gives no usable sessions or codes.

## Account states

```mermaid
stateDiagram-v2
    [*] --> SignedIn: first Google sign-in
    SignedIn --> Student: chooses languages and a goal
    SignedIn --> DoctorPending: valid faculty code, email code sent
    SignedIn --> Doctor: valid faculty code, signed in with the university account
    DoctorPending --> Doctor: correct email code
    DoctorPending --> Student: changes their mind
    Student --> [*]
    Doctor --> [*]
```

## Student languages

A student learns one or more of the six languages and studies one at a time. The active
language lives on `student_profiles`; everything that belongs to one language (level, placement
results, progress) will hang off `student_languages`.

| Request                               | Effect                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| `POST /api/student/languages`         | Adds a language and makes it active                        |
| `PUT /api/student/active-language`    | Switches to a language the student already has             |
| `DELETE /api/student/languages/:code` | Removes a language; the first remaining one becomes active |

Each answers with the updated account. The last language cannot be removed
(`LAST_LANGUAGE`), and a language that is active cannot be deleted from under the profile: the
foreign key refuses it, so the service moves the profile first. Every change locks the
student's profile row (`SELECT ... FOR UPDATE`), so two requests from the same student, from two
tabs or a double click, cannot both pass a check such as "not the last language".

## Working with migrations

```bash
pnpm --filter @acu/api db:generate
pnpm --filter @acu/api db:migrate
```

The first command writes a new SQL file from the schema; review it before committing. In
development the API applies pending migrations at start-up; in production run the second command
as a deploy step.

A change that moves existing data (a rename, a column that becomes a table) is written by hand,
because the generator cannot know where the rows should go. Keep the snapshot in
`drizzle/meta/` in step with the schema: `drizzle-kit generate` must then report no changes and
`drizzle-kit check` must pass. `src/db/migrations.test.ts` upgrades a database that already holds
rows, one migration at a time, the way a deployed database is upgraded; add a case there for
every migration that moves data.
