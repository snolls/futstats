
import { useAuthContext } from '../context/AuthContext';
import { UserRole } from '@/types/user';

export const useAuth = () => {
  const context = useAuthContext();

  // Backwards compatibility: Derive role from userData if not present in context root
  // The user modified AuthContext to remove 'role' from the root return, 
  // so we re-add it here so page.tsx doesn't break.
  const role = (context.userData?.role as UserRole) || null;

  return {
    ...context,
    role
  };
};
