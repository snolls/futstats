import {
    doc,
    writeBatch,
    collection,
    serverTimestamp,
    increment,
    runTransaction
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PaymentLog, PaymentType } from "@/types/payment";
import { AppUserCustomData } from "@/types/user";

export const PaymentService = {
    /**
     * Adjusts a user's debt in a specific group.
     * @param adminUser User performing the action
     * @param targetUser User receiving the adjustment
     * @param groupId Group ID
     * @param amount Amount to adjust (Positive adds debt, Negative reduces debt/is a payment)
     * @param type Payment Type
     * @param reason Optional reason
     */
    async adjustDebt(
        adminUser: AppUserCustomData & { uid: string },
        targetUser: AppUserCustomData & { id: string },
        groupId: string,
        amount: number,
        type: PaymentType,
        reason?: string
    ) {
        // Use transaction to ensure read-modify-write safety for balance
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", targetUser.id);
            const userSnap = await transaction.get(userRef);

            if (!userSnap.exists()) throw new Error("User does not exist");

            const userData = userSnap.data() as AppUserCustomData;
            const currentDebts = userData.groupDebts || {};
            const currentBalance = currentDebts[groupId] || 0;
            const newBalance = currentBalance + amount;

            // 1. Update User Debt
            transaction.update(userRef, {
                [`groupDebts.${groupId}`]: newBalance
            });

            // 2. Create Payment Log
            const logRef = doc(collection(db, "payment_logs"));
            const logData: PaymentLog = {
                adminId: adminUser.uid,
                adminName: adminUser.displayName || 'Admin',
                userId: targetUser.id,
                userName: targetUser.displayName || 'Usuario',
                groupId,
                amount,
                previousBalance: currentBalance,
                newBalance,
                type,
                reason,
                timestamp: serverTimestamp() as any
            };
            transaction.set(logRef, logData);
        });
    },

    /**
     * Settles the entire debt (sets to 0).
     */
    async settleDebt(
        adminUser: AppUserCustomData & { uid: string },
        targetUser: AppUserCustomData & { id: string },
        groupId: string
    ) {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", targetUser.id);
            const userSnap = await transaction.get(userRef);

            if (!userSnap.exists()) throw new Error("User does not exist");

            const userData = userSnap.data() as AppUserCustomData;
            const currentDebts = userData.groupDebts || {};
            const currentBalance = currentDebts[groupId] || 0;

            if (currentBalance === 0) return; // Nothing to settle

            // 1. Update User Debt to 0
            transaction.update(userRef, {
                [`groupDebts.${groupId}`]: 0
            });

            // 2. Create Payment Log (Amount is negative of balance to neutralize it)
            const logRef = doc(collection(db, "payment_logs"));
            const logData: PaymentLog = {
                adminId: adminUser.uid,
                adminName: adminUser.displayName || 'Admin',
                userId: targetUser.id,
                userName: targetUser.displayName || 'Usuario',
                groupId,
                amount: -currentBalance,
                previousBalance: currentBalance,
                newBalance: 0,
                type: 'DEBT_SETTLED',
                reason: 'Pago Completo / Saldado',
                timestamp: serverTimestamp() as any
            };
            transaction.set(logRef, logData);
        });
    }
};
