import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
