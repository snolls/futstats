
import { User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';

export type UserRole = 'superadmin' | 'admin' | 'user' | 'guest';

export interface AppUserCustomData {
  role: UserRole;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
  manualDebt?: number;
  isGuest?: boolean;
  associatedGroups?: string[];
  nickname?: string;
  position?: string;
  strongFoot?: 'right' | 'left' | 'ambidextrous';
  onboardingCompleted?: boolean;
  adminRequestStatus?: 'pending' | 'rejected' | null;
  /**
   * Map of GroupId -> Debt Amount.
   * Positive = Debt (User owes group).
   * Negative = Credit (Group owes user).
   */
  groupDebts?: Record<string, number>;
}

export const PLAYER_POSITIONS = {
  GK: 'Portero',
  CB: 'Defensa Central',
  LB: 'Lateral Izquierdo',
  RB: 'Lateral Derecho',
  CDM: 'Mediocentro Defensivo',
  CM: 'Mediocentro',
  CAM: 'Mediapunta',
  LW: 'Extremo Izquierdo',
  RW: 'Extremo Derecho',
  ST: 'Delantero Centro'
} as const;

export type PlayerPosition = keyof typeof PLAYER_POSITIONS;

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
