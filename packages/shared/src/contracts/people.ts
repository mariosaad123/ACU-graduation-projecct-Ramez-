import * as z from 'zod/mini';
import { LEARNING_LANGUAGES } from '../languages';

const learningLanguage = z.enum(LEARNING_LANGUAGES);

/** Someone in a group, as its doctor and its other members see them. */
export const groupPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.nullable(z.string()),
  role: z.enum(['doctor', 'student']),
  /** When a student joined the group; null for its doctor. */
  joinedAt: z.nullable(z.string()),
  me: z.boolean(),
});
export type GroupPerson = z.infer<typeof groupPersonSchema>;

export const groupPeopleResponseSchema = z.object({ people: z.array(groupPersonSchema) });

/**
 * A person's profile, for the people who share a group with them. A student's email is shown to
 * their doctors only; a doctor's university email to everyone who may see the profile.
 */
export const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.nullable(z.string()),
  role: z.enum(['doctor', 'student']),
  email: z.nullable(z.string()),
  languages: z.array(learningLanguage),
  /** The language a student is studying now; null for a doctor. */
  activeLanguage: z.nullable(learningLanguage),
  memberSince: z.string(),
  /** Groups the viewer and this person are both in, by name. */
  sharedGroups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      language: learningLanguage,
      photoUrl: z.nullable(z.string()),
    }),
  ),
  me: z.boolean(),
});
export type Person = z.infer<typeof personSchema>;

export const personResponseSchema = z.object({ person: personSchema });
export type PersonResponse = z.infer<typeof personResponseSchema>;
