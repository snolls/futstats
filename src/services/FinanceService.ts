import { db } from '@/lib/firebase';
import {
    doc,
    runTransaction,
    collection,
    serverTimestamp,
    increment,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    Timestamp
} from 'firebase/firestore';

export type TransactionType = 'MANUAL_DEBT' | 'MANUAL_PAYMENT' | 'MATCH_PAYMENT' | 'MATCH_REFUND' | 'UNDO';

export interface DebtLog {
    id?: string;
    amount: number; // Positive = Added Debt, Negative = Paid Debt
    concept: string;
    adminId: string;
    groupId: string;
    timestamp: Timestamp;
    previousBalance: number;
    newBalance: number;
    type: TransactionType;
    refId?: string; // Optional reference to matchId or other entity
}

export const FinanceService = {
    /**
     * Adds a transaction (Debt or Payment) with logging.
     * @param userId Target user ID
     * @param groupId Group Context
     * @param amount Amount (Positive to increase debt, Negative to reduce)
     * @param concept Description
     * @param adminId Who performed the action
     * @param type Transaction Type
     */
    async addTransaction(
        userId: string,
        groupId: string,
        amount: number,
        concept: string,
        adminId: string,
        type: TransactionType = 'MANUAL_DEBT'
    ) {
        if (!userId || !groupId) throw new Error("Missing UserId or GroupId");

        try {
            await runTransaction(db, async (transaction) => {
                // 1. Get User Reference
                const userRef = doc(db, 'users', userId);
                const userSnap = await transaction.get(userRef);

                if (!userSnap.exists()) throw new Error("User does not exist");

                const userData = userSnap.data();
                // Get current balance for this group (Default to 0)
                const currentDebts = userData.debts || {};
                const currentBalance = currentDebts[groupId] || 0;

                const newBalance = currentBalance + amount;

                // 2. Create Log Document ref
                const logRef = doc(collection(db, `users/${userId}/debt_logs`));

                const logData: DebtLog = {
                    amount,
                    concept,
                    adminId,
                    groupId,
                    timestamp: serverTimestamp() as Timestamp, // Will be resolved by server
                    previousBalance: currentBalance,
                    newBalance,
                    type
                };

                // 3. Update User (Debts Map)
                // We construct the update path for the specific map key
                const updatePayload = {
                    [`debts.${groupId}`]: newBalance,
                    // Legacy support (optional, can be removed if strictly using debts)
                    [`groupDebts.${groupId}`]: newBalance
                };

                transaction.update(userRef, updatePayload);
                transaction.set(logRef, logData);
            });
            return true;
        } catch (error) {
            console.error("Error in addTransaction:", error);
            throw error;
        }
    },

    /**
     * Reverts the LAST transaction for a specific group.
     * @param userId User ID
     * @param groupId Group ID
     * @param adminId Admin performing the undo
     */
    async undoLastTransaction(userId: string, groupId: string, adminId: string) {
        try {
            // Can't run query inside transaction easily for "last item", so we fetch first.
            // Risk of race condition is low for this specific use case.
            const logsRef = collection(db, `users/${userId}/debt_logs`);
            const q = query(
                logsRef,
                where("groupId", "==", groupId),
                orderBy("timestamp", "desc"),
                limit(1)
            );

            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                throw new Error("No transactions to undo found.");
            }

            const lastLogDoc = snapshot.docs[0];
            const lastLog = lastLogDoc.data() as DebtLog;

            // Prevent infinite undo if needed, or allow it. 
            // We just inverse the amount. 
            // If last action was +10 (Add Debt), we do -10.
            // If last action was -5 (Payment), we do +5.
            const inverseAmount = -lastLog.amount;
            const concept = `DESHACER: ${lastLog.concept}`;

            await this.addTransaction(
                userId,
                groupId,
                inverseAmount,
                concept,
                adminId,
                'UNDO'
            );

            return lastLog;
        } catch (error) {
            console.error("Error unding last transaction:", error);
            throw error;
        }
    }
};
