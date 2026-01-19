
import { User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';

export type UserRole = 'superadmin' | 'admin' | 'user';

export interface AppUserCustomData {
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
}

export interface AppUser extends User {
  customData: AppUserCustomData; // We attach our custom data here or just use it separately
}

// Or cleaner: Keep Firebase User and Custom Data separate in context
export interface AuthState {
  user: User | null;
  userData: AppUserCustomData | null;
  loading: boolean;
  error: Error | null;
}
