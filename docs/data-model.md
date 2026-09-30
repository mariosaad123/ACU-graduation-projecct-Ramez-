# Data model

PostgreSQL, accessed through Drizzle ORM. The schema lives in `apps/api/src/db/schema.ts` and
every change ships as a reviewed SQL migration in `apps/api/drizzle/`.

## Accounts

```mermaid
erDiagram
    users ||--o| student_profiles : "has"
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
        learning_language learning_language
        learning_goal goal
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
| Deleting a user removes their data            | `ON DELETE CASCADE` on profiles, sessions and email codes                |
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
    SignedIn --> Student: chooses a language and goal
    SignedIn --> DoctorPending: valid faculty code, email code sent
    SignedIn --> Doctor: valid faculty code, signed in with the university account
    DoctorPending --> Doctor: correct email code
    DoctorPending --> Student: changes their mind
    Student --> [*]
    Doctor --> [*]
```

## Working with migrations

```bash
pnpm --filter @acu/api db:generate
pnpm --filter @acu/api db:migrate
```

The first command writes a new SQL file from the schema; review it before committing. In
development the API applies pending migrations at start-up; in production run the second command
as a deploy step.
