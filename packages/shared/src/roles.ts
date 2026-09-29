export const USER_ROLES = ['student', 'doctor', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** A doctor account exists before it is usable: the university email must be confirmed first. */
export const DOCTOR_STATUSES = ['pending_verification', 'active'] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

export const LEARNING_GOALS = ['study', 'work', 'travel', 'exam', 'culture'] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];

export const UNIVERSITY_EMAIL_DOMAIN = 'acu.edu.eg';

export const EMAIL_CODE_LENGTH = 6;
