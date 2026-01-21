import {
    doc,
    writeBatch,
    collection,
    query,
    where,
    getDocs,
    arrayRemove,
    serverTimestamp,
    updateDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppUserCustomData } from "@/types/user";

export const UserService = {
    /**
     * Fully deletes a user from the system.
     * WARNING: Only Superadmin can execute this.
     * @param adminUser The superadmin performing the deletion
     * @param targetUserId The ID of the user to delete
     */
    async deleteUserFull(adminUser: AppUserCustomData, targetUserId: string) {
        if (adminUser.role !== 'superadmin') {
            throw new Error("Unauthorized: Only Superadmin can delete users.");
        }

        const batch = writeBatch(db);
        const userRef = doc(db, "users", targetUserId);

        // 1. Find all groups where the user is a member
        const groupsRef = collection(db, "groups");
        const q = query(groupsRef, where("members", "array-contains", targetUserId));
        const groupSnap = await getDocs(q);

        groupSnap.forEach((groupDoc) => {
            batch.update(groupDoc.ref, {
                members: arrayRemove(targetUserId),
                adminIds: arrayRemove(targetUserId)
            });
        });

        // 2. Anonymize/Delete Stats in Matches (Optional/Heavy)
        // Optimization: We could query 'match_stats' by userId and delete them
        const statsRef = collection(db, "match_stats");
        const statsQ = query(statsRef, where("userId", "==", targetUserId));
        const statsSnap = await getDocs(statsQ);

        statsSnap.forEach((statDoc) => {
            // Option A: Delete stats
            // batch.delete(statDoc.ref);

            // Option B: Anonymize (Better for history)
            batch.update(statDoc.ref, {
                displayName: "Usuario Eliminado",
                userId: "deleted_user"
            });
        });

        // 3. Delete the User Document
        batch.delete(userRef);

        await batch.commit();

        // 4. Notification (Simulation)
        console.log(`[EMAIL SERVICE] Email sent to user ${targetUserId}: Your account has been permanently deleted.`);
    },

    /**
     * Updates a user's profile and synchronizes denormalized data.
     * @param userId User ID
     * @param data Partial data to update (nickname, photoURL)
     */
    async updateUserProfile(userId: string, data: Partial<AppUserCustomData>) {
        const userRef = doc(db, "users", userId);

        // 1. Update User Doc
        await updateDoc(userRef, {
            ...data,
            updatedAt: serverTimestamp()
        });

        // 2. Sync to Future Matches / Stats?
        // If we store displayName in match_stats, we should update recent ones or all.
        // For performance, we might skip this or do it via Cloud Function.
        // Client-side batch update limited to recent items if necessary.

        // Example: Update stats in matches that are NOT completed?
        // This is complex client-side. We will leave it as a comment for future implementation
        // or Cloud Function trigger recommendation.
        console.log(`Profile updated for ${userId}. Sync to historical data pending implementation.`);
    }
};
