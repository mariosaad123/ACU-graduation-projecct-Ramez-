import type { Session, User } from '../db/schema';

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when the request carries a valid session cookie. */
      auth?: {
        user: User;
        session: Session;
      };
    }
  }
}

export {};
