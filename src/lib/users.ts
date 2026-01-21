import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { AppUserCustomData } from "@/types/user";

/**
 * Creates a new Guest User in Firestore.
 * 
 * @param displayName Name or alias for the guest
 * @param initialDebt Optional initial debt (positive = debt, negative = credit)
 * @param associatedGroups Optional list of group IDs this guest belongs to
 * @returns The created user object including the generated ID
 */
export async function createGuestUser(displayName: string, initialDebt: number = 0, associatedGroups: string[] = []): Promise<AppUserCustomData & { id: string }> {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const email = `${guestId}@futstats.app`; // Dummy email for consistency
    const photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=f59e0b&color=fff`; // Amber for guests

    const userData: AppUserCustomData = {
        role: 'guest',
        displayName: displayName.trim(),
        email: email,
        photoURL: photoURL,
        manualDebt: initialDebt,
        // @ts-ignore - manualDebt is part of AppUserCustomData but sometimes debt is used at top level. 
        // We ensure consistency by saving both if compatible or just relying on customData structure.
        debt: initialDebt,
        createdAt: serverTimestamp() as any, // Cast for client-side compat before DB write
        updatedAt: serverTimestamp() as any,
        isGuest: true, // Explicit flag
        associatedGroups: associatedGroups // Link to groups
    };

    await setDoc(doc(db, "users", guestId), userData);

    return { id: guestId, ...userData };
}
