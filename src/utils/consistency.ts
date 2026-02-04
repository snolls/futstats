import { db } from "@/lib/firebase";
import {
    doc,
    writeBatch,
    collection,
    query,
    where,
    getDocs,
    getDoc,
    arrayRemove,
    deleteField,
    deleteDoc
} from "firebase/firestore";

/**
 * Utility to perform safe data deletion ensuring referential integrity.
 * Focuses on cleaning up denormalized data like 'debts' and 'associatedGroups'.
 */
export const ConsistencyUtils = {

    /**
     * Safely deletes a group and cleans up all related data:
     * 1. Updates all members: removes groupId from associatedGroups AND deletes debt entry.
     * 2. Deletes all matches and match_stats for the group.
     * 3. Deletes group requests.
     * 4. Deletes the group document.
     * 
     * @param groupId ID of the group to delete
     * @returns Promise<void>
     */
    async deleteGroupSafe(groupId: string): Promise<void> {
        if (!groupId) throw new Error("ID de grupo es requerido.");

        console.log(`[Consistency] Iniciando borrado seguro del grupo: ${groupId}`);

        // We will execute in chunks because Firestore Batch has 500 ops limit.
        // Step 1: Fetch Group to get members
        const groupRef = doc(db, "groups", groupId);
        const groupSnap = await getDoc(groupRef);

        if (!groupSnap.exists()) {
            console.warn("El grupo ya no existe.");
            return;
        }

        const groupData = groupSnap.data();
        const memberIds: string[] = groupData.members || [];

        // --- BATCH 1: CLEANUP USERS (Debts & Association) ---
        // If members > 400, strictly we should chunk this too. Assuming < 400 for now.
        if (memberIds.length > 0) {
            const batchUsers = writeBatch(db);

            // Note: We can iterate ids and make refs.
            const userChunks = chunkArray(memberIds, 200); // Conservative chunk

            for (const chunk of userChunks) {
                // To minimize reads, we just indiscriminately try to update.
                // However, we can't delete a specific map key without `deleteField()`.
                // `updateDoc(ref, { "debts.GROUPID": deleteField(), associatedGroups: arrayRemove(groupId) })`

                const batchChunk = writeBatch(db);
                chunk.forEach(uid => {
                    const ref = doc(db, "users", uid);
                    batchChunk.update(ref, {
                        [`debts.${groupId}`]: deleteField(),
                        [`groupDebts.${groupId}`]: deleteField(), // Legacy cleanup
                        associatedGroups: arrayRemove(groupId)
                    });
                });
                await batchChunk.commit();
            }
        }

        // --- BATCH 2: DELETE MATCHES & STATS ---
        // Fetch matches first
        const matchesQ = query(collection(db, "matches"), where("groupId", "==", groupId));
        const matchesSnap = await getDocs(matchesQ);
        const matchIds = matchesSnap.docs.map(d => d.id);

        // Delete Matches
        if (matchIds.length > 0) {
            const batchMatches = writeBatch(db);
            matchesSnap.docs.forEach(d => batchMatches.delete(d.ref));
            await batchMatches.commit();

            // Delete Stats (This might be heavy if many matches)
            // We'll fetch stats for these matches.
            // Optimize: Fetch all stats for this GROUP directly if possible? 
            // MatchStats usually don't have groupId directly on them (in some schemas).
            // Let's check schema... usePlayerDebts checks `mData.groupId`. So stat itself doesn't have it.
            // We must query by matchId.

            // Process stats in chunks of matches to avoid huge queries
            const matchIdChunks = chunkArray(matchIds, 10);
            for (const chunk of matchIdChunks) {
                const statsQ = query(collection(db, "match_stats"), where("matchId", "in", chunk));
                const statsSnap = await getDocs(statsQ);

                if (!statsSnap.empty) {
                    const batchStats = writeBatch(db);
                    statsSnap.docs.forEach(d => batchStats.delete(d.ref));
                    await batchStats.commit();
                }
            }
        }

        // --- BATCH 3: REQUESTS & GROUP ---
        const batchFinal = writeBatch(db);

        // Delete Requests
        const reqQ = query(collection(db, "group_requests"), where("groupId", "==", groupId));
        const reqSnap = await getDocs(reqQ);
        reqSnap.docs.forEach(d => batchFinal.delete(d.ref));

        // Delete Group
        batchFinal.delete(groupRef);

        await batchFinal.commit();
        console.log(`[Consistency] Grupo ${groupId} eliminado y limpiado.`);
    },

    /**
     * Safely deletes a user and cleans up:
     * 1. Removes user from all Groups (members array, adminIds array).
     * 2. Deletes user's match_stats.
     * 3. Deletes user's requests.
     * 4. Deletes user document.
     * 
     * Note: Does NOT delete Auth account (Client SDK limitation / Caller responsibility).
     */
    async deleteUserSafe(userId: string): Promise<void> {
        if (!userId) throw new Error("ID de usuario requerido.");
        console.log(`[Consistency] Iniciando borrado seguro de usuario: ${userId}`);

        // 1. Find groups to remove member from
        const groupsQ = query(collection(db, "groups"), where("members", "array-contains", userId));
        const groupSnap = await getDocs(groupsQ);

        if (!groupSnap.empty) {
            const batchGroups = writeBatch(db);
            groupSnap.docs.forEach(gDoc => {
                batchGroups.update(gDoc.ref, {
                    members: arrayRemove(userId),
                    adminIds: arrayRemove(userId)
                });
            });
            await batchGroups.commit();
        }

        // 2. Delete Stats
        const statsQ = query(collection(db, "match_stats"), where("userId", "==", userId));
        const statsSnap = await getDocs(statsQ);

        if (!statsSnap.empty) {
            // Delete in batches of 400
            const statChunks = chunkArray(statsSnap.docs, 400);
            for (const chunk of statChunks) {
                const b = writeBatch(db);
                chunk.forEach(d => b.delete(d.ref));
                await b.commit();
            }
        }

        // 3. Delete Requests (Outgoing)
        const reqQ = query(collection(db, "group_requests"), where("userId", "==", userId));
        const reqSnap = await getDocs(reqQ);
        if (!reqSnap.empty) {
            const b = writeBatch(db);
            reqSnap.docs.forEach(d => b.delete(d.ref));
            await b.commit();
        }

        // 4. Delete User Doc
        await deleteDoc(doc(db, "users", userId));
        console.log(`[Consistency] Usuario ${userId} eliminado de Firestore.`);
    }
};

// Helper for chunking
function chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
}
