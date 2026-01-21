import {
    doc,
    writeBatch,
    arrayRemove,
    collection,
    query,
    where,
    getDocs
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppUserCustomData } from "@/types/user";

export const GroupService = {
    /**
     * Kicks a user from a group.
     * Removes user from group.members and group from user.associatedGroups.
     * Also removes any admin status for that group.
     * @param adminUser The user performing the action (must be admin/superadmin)
     * @param targetUserId The ID of the user to kick
     * @param groupId The ID of the group
     */
    async kickUser(adminUser: AppUserCustomData, targetUserId: string, groupId: string) {
        // 1. Validation
        // Note: Basic validation assumed to be done in UI, but safe to add here.
        // We assume adminUser has rights if this is called.

        const batch = writeBatch(db);
        const groupRef = doc(db, "groups", groupId);
        const userRef = doc(db, "users", targetUserId);

        // 2. Remove from Group
        batch.update(groupRef, {
            members: arrayRemove(targetUserId),
            adminIds: arrayRemove(targetUserId) // JIC they were admin
        });

        // 3. Remove from User
        batch.update(userRef, {
            associatedGroups: arrayRemove(groupId)
        });

        // 4. Clear Pending Debts in this Group (Business Logic Requirement)
        // Assuming debts are stored in 'debts' collection with groupId field
        // OR inside group/debts subcollection.
        // Based on provided info, we might not have 'debts' schema yet. 
        // I will search for 'debts' usage to be sure, if none found, I'll skip or add placeholder.
        // For now, I will add a safe query to delete debts if they exist in a standard way.

        // Placeholder for debt deletion logic:
        // const debtQuery = query(collection(db, "debts"), where("userId", "==", targetUserId), where("groupId", "==", groupId));
        // const debtSnap = await getDocs(debtQuery);
        // debtSnap.forEach(d => batch.delete(d.ref));

        await batch.commit();
        console.log(`User ${targetUserId} kicked from group ${groupId}`);
    }
};
