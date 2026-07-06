export interface AuthenticatedUser {
  id: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
}
