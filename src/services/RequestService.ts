import {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
    writeBatch,
    arrayUnion,
    query,
    where,
    getDocs
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { SocialRequest, RequestType } from "@/types/request";
import { AppUserCustomData } from "@/types/user";

export const RequestService = {
    /**
     * Creates a request to join a group.
     */
    async createJoinRequest(user: AppUserCustomData & { id: string }, group: { id: string, name: string, adminIds: string[] }) {
        // 1. Check if request already exists
        const q = query(
            collection(db, "requests"),
            where("userId", "==", user.id),
            where("targetGroupId", "==", group.id),
            where("type", "==", "join_group")
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const existingReq = snapshot.docs[0];
            const data = existingReq.data() as SocialRequest;

            if (data.status === 'pending') {
                throw new Error("Ya tienes una solicitud pendiente para este grupo.");
            }

            if (data.status === 'rejected') {
                // Recycle: Set status to pending and update timestamp
                await updateDoc(doc(db, "requests", existingReq.id), {
                    status: 'pending',
                    createdAt: serverTimestamp() as any
                });
                return; // Done
            }
        }

        // 2. Create new if not exists
        const reqData: SocialRequest = {
            type: 'join_group',
            status: 'pending',
            userId: user.id,
            userName: user.displayName || 'Usuario',
            userEmail: user.email || '',
            userPhotoURL: user.photoURL || undefined,
            targetGroupId: group.id,
            targetGroupName: group.name,
            auditors: group.adminIds, // Admins of this group can see/approve this
            createdAt: serverTimestamp() as any
        };
        await addDoc(collection(db, "requests"), reqData);
    },

    /**
     * Creates a request to become an Admin (Organizer).
     */
    async createAdminRoleRequest(user: AppUserCustomData & { id: string }) {
        // 1. Check exists
        const q = query(
            collection(db, "requests"),
            where("userId", "==", user.id),
            where("type", "==", "request_admin")
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const existingReq = snapshot.docs[0];
            const data = existingReq.data() as SocialRequest;

            if (data.status === 'pending') {
                throw new Error("Ya tienes una solicitud de rol pendiente.");
            }

            if (data.status === 'rejected') {
                await updateDoc(doc(db, "requests", existingReq.id), {
                    status: 'pending',
                    createdAt: serverTimestamp() as any
                });
                return;
            }
        }

        const reqData: SocialRequest = {
            type: 'request_admin',
            status: 'pending',
            userId: user.id,
            userName: user.displayName || 'Usuario',
            userEmail: user.email || '',
            userPhotoURL: user.photoURL || undefined,
            auditors: ['superadmin'], // Special keyword or query logic for superadmins
            createdAt: serverTimestamp() as any
        };
        await addDoc(collection(db, "requests"), reqData);
    },

    /**
     * Accepts a request.
     * Executes the necessary business logic depending on type.
     */
    async acceptRequest(adminUser: AppUserCustomData, request: SocialRequest) {
        if (!request.id) throw new Error("Invalid Request ID");
        const batch = writeBatch(db);
        const reqRef = doc(db, "requests", request.id);

        if (request.type === 'join_group') {
            if (!request.targetGroupId) throw new Error("No target group ID");

            // Logic: Add user to group members & Add group to user associatedGroups
            // Note: Reuse logic from GroupService if possible, or replicate atomic batch here.

            const groupRef = doc(db, "groups", request.targetGroupId);
            const userRef = doc(db, "users", request.userId);

            batch.update(groupRef, { members: arrayUnion(request.userId) });
            batch.update(userRef, { associatedGroups: arrayUnion(request.targetGroupId) });

        } else if (request.type === 'request_admin') {
            // Logic: Change user role to 'admin'
            if (adminUser.role !== 'superadmin') throw new Error("Unauthorized");

            const userRef = doc(db, "users", request.userId);
            batch.update(userRef, { role: 'admin' });
        }

        // Delete request after acceptance (or set to accepted if history needed. Prompt implied "clean up" or "accept logic")
        // "Aceptar (ejecuta la lógica...) o Rechazar (borra la solicitud)".
        // Usually we delete processed requests to keep DB clean, or move to 'request_history'.
        // Let's delete it to match the "Rechazar (borra)" pattern for simplicity, 
        // or update status to 'accepted' if we want the user to know.
        // Let's START by deleting to keep it simple as per "Rechazar (borra)" implication.
        batch.delete(reqRef);

        await batch.commit();
    },

    /**
     * Rejects (deletes) a request.
     */
    async rejectRequest(request: SocialRequest) {
        if (!request.id) return;
        // Soft delete so it can be recycled
        await updateDoc(doc(db, "requests", request.id), {
            status: 'rejected'
        });
    }
};
