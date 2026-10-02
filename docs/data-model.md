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
        timestamptz disabled_at "suspended when set"
        uuid suspended_by_user_id FK "the doctor; null for the faculty"
        text suspension_reason
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
| Deleting a user removes their data            | `ON DELETE CASCADE` on profiles, languages, groups and sessions          |
| Audit history survives account deletion       | `ON DELETE SET NULL` on `audit_events.actor_user_id`                     |

## What is never stored in clear

| Secret                  | Stored as                                 |
| ----------------------- | ----------------------------------------- |
| Session token           | SHA-256 hash (the cookie holds the token) |
| Doctor access code      | Argon2id hash                             |
| Email confirmation code | Argon2id hash                             |

A copy of the database therefore gives no usable sessions or codes.

## Groups

```mermaid
erDiagram
    users ||--o{ doctor_languages : "teaches"
    doctor_languages ||--o{ groups : "is the language of"
    users ||--o{ groups : "runs"
    groups ||--o{ group_members : "has"
    users ||--o{ group_members : "belongs to"

    doctor_languages {
        uuid user_id PK, FK
        learning_language language PK
    }
    groups {
        uuid id PK
        uuid doctor_id FK
        text name
        text description
        learning_language language FK "with doctor_id, to doctor_languages"
        text join_code UK "8 symbols, no 0 1 I L O U"
        boolean join_open
        boolean requires_approval
        boolean chat_open
        integer chat_rate_limit "1 to 120, default 60"
        uuid photo_file_id FK
        timestamptz archived_at
    }
    group_members {
        uuid group_id PK, FK
        uuid student_id PK, FK
        group_member_status status "pending | active | removed | left"
        timestamptz joined_at
        timestamptz decided_at
        timestamptz removed_at
        uuid removed_by_user_id FK
        boolean chat_muted
    }
```

A doctor teaches one or more languages, and each group is in one of them. Students join a group
with its code, or the doctor adds them by the email they sign in with. Membership rows are never
deleted: a removed student stays visible to the doctor, who can bring them back.

| Rule                                            | How                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| A group is in a language its doctor teaches     | Composite key `(doctor_id, language)` to `doctor_languages`       |
| A taught language with groups cannot be dropped | The same key; the API answers `LANGUAGE_IN_USE`                   |
| A student keeps the languages of their groups   | Removing one answers `LANGUAGE_IN_USE` while the membership lasts |
| A removed student cannot rejoin with the code   | Joining is refused with `REMOVED_FROM_GROUP`                      |
| A doctor sees and acts on their own groups only | Every query filters on `doctor_id`; anything else is a 404        |
| Join codes cannot be guessed                    | 30^8 codes, 10 wrong codes per student and hour, all audited      |

### Membership

```mermaid
stateDiagram-v2
    [*] --> active: joins, or is added by the doctor
    [*] --> pending: joins a group that requires approval
    pending --> active: doctor approves
    pending --> removed: doctor rejects
    pending --> left: student withdraws
    active --> removed: doctor removes, or moves them to another group
    active --> left: student leaves
    removed --> active: doctor restores
    left --> active: joins again, or doctor restores
```

Joining adds the group's language to the student's languages without changing the active one.

### Suspension

A doctor may suspend the account of a student who is, or was, in one of their groups, with a
reason. The student is signed out everywhere and cannot sign in. Only that doctor, or the faculty
administration, lifts it; the student's other doctors see who suspended the account and why.

### Endpoints

| Request                                                    | Who     | Effect                                       |
| ---------------------------------------------------------- | ------- | -------------------------------------------- |
| `PUT /api/doctor/languages`                                | doctor  | Replaces the languages taught                |
| `GET, POST /api/doctor/groups`                             | doctor  | Lists or creates groups                      |
| `PATCH /api/doctor/groups/:id`                             | doctor  | Name, description, joining, approval, chat   |
| `PUT, DELETE /api/doctor/groups/:id/photo`                 | doctor  | Sets or removes the group's photo            |
| `POST /api/doctor/groups/:id/code`                         | doctor  | A new join code; the old one stops at once   |
| `POST /api/doctor/groups/:id/archive`, `/restore`          | doctor  | Read-only while archived                     |
| `GET, POST /api/doctor/groups/:id/members`                 | doctor  | Lists members, or adds a student by email    |
| `POST /api/doctor/groups/:id/members/:student/:action`     | doctor  | `approve`, `reject`, `remove` or `restore`   |
| `POST /api/doctor/groups/:id/members/:student/move`        | doctor  | To another of the doctor's groups            |
| `POST /api/doctor/groups/:id/members/:student/chat-mute`   | doctor  | Mutes or unmutes a student in the chat       |
| `POST /api/doctor/students/:student/suspend`, `/unsuspend` | doctor  | Suspends the account, or lifts it            |
| `POST /api/student/join/preview`, `/join`                  | student | Shows the group behind a code, then joins it |
| `GET /api/student/groups`                                  | student | The student's groups and pending requests    |
| `POST /api/student/groups/:id/leave`                       | student | Leaves, or withdraws a request               |

Join codes travel in request bodies, not in API URLs, so they stay out of server logs.

## Files

```mermaid
erDiagram
    users ||--o{ files : "uploads"
    groups ||--o{ files : "holds"

    files {
        uuid id PK
        uuid owner_id FK
        file_purpose purpose "avatar | group_photo | chat"
        uuid group_id FK "chat files only"
        text content_type
        integer byte_size
        text original_name
        text storage_key UK
        integer width
        integer height
    }
```

Uploads go through one path, whatever they are for:

1. The type is read from the file's first bytes; the name and the type the browser claims are
   not trusted.
2. Images are decoded and written again as WebP, turned upright, resized and stripped of their
   metadata (camera, location). Profile photos become 256 px squares, group photos 512 px
   squares, chat images at most 1600 px on their long side.
3. Documents (PDF, Word, PowerPoint, Excel) and audio are kept as sent.

| Purpose       | Largest | Who can read it                           |
| ------------- | ------- | ----------------------------------------- |
| `avatar`      | 5 MB    | Anyone signed in                          |
| `group_photo` | 5 MB    | Anyone signed in                          |
| `chat`        | 10 MB   | The group's doctor and its active members |

`GET /api/files/:id` serves a file with `X-Content-Type-Options: nosniff`, a sandboxing
`Content-Security-Policy`, and `Content-Disposition: attachment` for everything but images and
audio, so an uploaded file never runs as a page of the platform. A file that is replaced or whose
message is deleted is removed from storage.

Files live on disk under `UPLOADS_DIR` (`.data/uploads` by default) behind a small storage
interface; production swaps in an object store driver without touching the services.

`PUT /api/me/avatar` sets a person's own photo and `DELETE` goes back to the Google picture.

## Group chat

```mermaid
erDiagram
    groups ||--o{ group_messages : "has"
    users ||--o{ group_messages : "writes"
    files |o--o| group_messages : "is attached to"
    group_messages |o--o{ group_messages : "is replied to by"
    groups ||--o{ chat_reads : "is read by"

    group_messages {
        uuid id PK
        bigint seq UK "identity, the order of the chat"
        bigint version "chat_version_seq, bumped by every change"
        uuid group_id FK
        uuid author_id FK
        text body
        uuid attachment_file_id FK
        uuid reply_to_id FK
        timestamptz pinned_at
        timestamptz edited_at
        timestamptz deleted_at
        uuid deleted_by_user_id FK
    }
    chat_reads {
        uuid group_id PK, FK
        uuid user_id PK, FK
        bigint last_read_seq
    }
```

Every group has one chat, shared by its doctor and its active members.

| Rule                                      | How                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The doctor can close the chat to students | `groups.chat_open`; students then read only (`CHAT_CLOSED`)                                                                      |
| The doctor can mute one student           | `group_members.chat_muted` (`CHAT_MUTED`)                                                                                        |
| An archived group's chat is read-only     | Writing answers `GROUP_ARCHIVED`                                                                                                 |
| Only the author edits a message           | Text messages only (`MESSAGE_NOT_EDITABLE`)                                                                                      |
| The author or the doctor deletes it       | The row stays as a placeholder; the attachment is removed                                                                        |
| Only the doctor pins                      | `pinned_at`; a deleted message is unpinned                                                                                       |
| No flooding                               | Each doctor sets the messages per student and minute (1-120, 60 by default); the doctor's own limit is 120 (`CHAT_RATE_LIMITED`) |

Deleting someone else's message, muting and unmuting are written to the audit log.

Clients load the latest 50 messages, older pages with `?before=<seq>`, then ask every few
seconds for what changed with `?since=<version>`. Every insert, edit, deletion or pin takes a new
value from `chat_version_seq`, so a single query returns new and changed messages alike, and a
client never misses an edit made to an old message. Unread counts compare `seq` with
`chat_reads.last_read_seq`.

| Request                                            | Effect                                            |
| -------------------------------------------------- | ------------------------------------------------- |
| `GET /api/groups/:id`                              | The group as this person sees it, with chat state |
| `GET /api/groups/:id/chat`                         | The latest page, or `?before=<seq>`               |
| `GET /api/groups/:id/chat/changes?since=<n>`       | Messages created or changed since a version       |
| `POST /api/groups/:id/chat`                        | Sends text, a file, or both (multipart)           |
| `PATCH, DELETE /api/groups/:id/chat/:message`      | Edits or deletes a message                        |
| `POST /api/groups/:id/chat/:message/pin`, `/unpin` | Pins or unpins (doctor)                           |
| `POST /api/groups/:id/chat/read`                   | Marks the chat read up to a message               |

Anyone outside the group gets a 404 for all of these, as for the doctor routes.

## People

Everyone in a group sees who else is in it, and can open their profile.

| Request                      | Effect                                                    |
| ---------------------------- | --------------------------------------------------------- |
| `GET /api/groups/:id/people` | The doctor, then the active students by name              |
| `GET /api/people/:id`        | A profile: name, photo, role, languages, groups in common |

A profile is visible to people who share an active group with its owner, and to a doctor for any
student who is or was in one of their groups; anyone else gets a 404. A student's email is shown
only to their doctors; a doctor's university email to everyone who may see the profile. Waiting,
removed and departed students are not listed to classmates.

## Rate limits

Two limits apply to every API request: a generous one per IP address, since a whole lab shares the
university's address, and one per signed-in person (1500 requests in 15 minutes, enough for an open
chat that polls every five seconds). Sign-in and onboarding have stricter limits of their own.

## Account states

```mermaid
stateDiagram-v2
    [*] --> SignedIn: first Google sign-in
    SignedIn --> Student: chooses languages and a goal
    SignedIn --> DoctorPending: valid faculty code, email code sent
    SignedIn --> Doctor: valid faculty code, signed in with the university account
    DoctorPending --> Doctor: correct email code
    DoctorPending --> Student: changes their mind
    Student --> Suspended: a doctor of theirs suspends the account
    Suspended --> Student: the same doctor lifts it
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
