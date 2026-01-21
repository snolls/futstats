import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUserCustomData } from '@/types/user';

export interface DebtMatchItem {
    statId: string;
    matchId: string;
    groupId?: string;
    date: Date;
    price: number;
    matchDateString: string;
    paymentStatus: 'PENDING' | 'PAID';
}

interface UsePlayerDebtsReturn {
    pendingMatches: DebtMatchItem[];
    paidMatches: DebtMatchItem[];
    totalDebt: number;
    matchesDebt: number;
    manualDebt: number;
    loading: boolean;
    toggleMatchPayment: (statId: string, currentStatus: 'PENDING' | 'PAID') => Promise<void>;
    updateManualDebt: (amount: number) => Promise<void>;
    processSmartPayment: (amount: number) => Promise<void>;
}

export function usePlayerDebts(userId: string, groupId?: string): UsePlayerDebtsReturn {
    const [pendingMatches, setPendingMatches] = useState<DebtMatchItem[]>([]);
    const [paidMatches, setPaidMatches] = useState<DebtMatchItem[]>([]);
    const [manualDebt, setManualDebt] = useState(0);
    const [loading, setLoading] = useState(true);

    // 1. Listen to User (for Group Debt)
    useEffect(() => {
        if (!userId) return;
        const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
            if (snap.exists()) {
                const data = snap.data() as AppUserCustomData;
                if (groupId) {
                    // Scoped: Get debt for this group
                    setManualDebt(data.groupDebts?.[groupId] || 0);
                } else {
                    // Global (Superadmin view?): Sum all debts or show 0?
                    // User prompt implies strict separation. If no groupId, maybe return 0 or global aggregation?
                    // For safety, defaulting to 0 or aggregation if required.
                    // Let's aggregate for logic consistency if needed, strictly summing Record values.
                    const allDebts = Object.values(data.groupDebts || {}).reduce((a, b) => a + b, 0);
                    setManualDebt(allDebts);
                }
            }
        });
        return () => unsub();
    }, [userId, groupId]);

    // 2. Listen to Matches
    useEffect(() => {
        if (!userId) return;
        setLoading(true);

        const q = query(
            collection(db, 'match_stats'),
            where('userId', '==', userId)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const stats = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

            if (stats.length === 0) {
                setPendingMatches([]);
                setPaidMatches([]);
                setLoading(false);
                return;
            }

            const matchIds = Array.from(new Set(stats.map((s: any) => s.matchId as string)));

            // Fetch Matches to get GroupID and Date
            const matchesData: Record<string, { date: Date, price: number, groupId: string }> = {};

            await Promise.all(matchIds.map(async (mid) => {
                const mSnap = await getDoc(doc(db, 'matches', mid));
                if (mSnap.exists()) {
                    const d = mSnap.data();
                    matchesData[mid] = {
                        date: d.date?.toDate ? d.date.toDate() : new Date(d.date),
                        price: d.pricePerPlayer || 0,
                        groupId: d.groupId
                    };
                }
            }));

            const processed: DebtMatchItem[] = stats.map((s: any) => {
                const mData = matchesData[s.matchId];
                if (!mData) return null;

                // IMPORTANT: Filter by groupId if provided
                if (groupId && mData.groupId !== groupId) return null;

                return {
                    statId: s.id,
                    matchId: s.matchId,
                    groupId: mData.groupId,
                    date: mData.date,
                    price: mData.price,
                    matchDateString: mData.date.toLocaleDateString('es-ES', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    }),
                    paymentStatus: s.paymentStatus || 'PENDING'
                };
            }).filter(Boolean) as DebtMatchItem[];

            processed.sort((a, b) => b.date.getTime() - a.date.getTime());

            setPendingMatches(processed.filter(m => m.paymentStatus !== 'PAID'));
            setPaidMatches(processed.filter(m => m.paymentStatus === 'PAID'));

            setLoading(false);
        }, (err) => {
            console.error("Error fetching dependencies:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, groupId]);

    // Calculations
    // Matches Debt: Sum of pending match prices
    const matchesDebt = pendingMatches.reduce((acc, m) => acc + m.price, 0);

    // Total Debt:
    // If we rely on `groupDebts` (manualDebt) keeping track of adjustments independently of matches (hybrid system),
    // we sum them.
    // However, usually 'groupDebts' might eventually track EVERYTHING if we sync matches to it.
    // But currently, the system seems to be: Match Debt is dynamic (calc'd from matches), Manual Debt is stored in user.
    // So Total = Matches + Manual.
    const totalDebt = matchesDebt + manualDebt;

    const toggleMatchPayment = async (statId: string, currentStatus: 'PENDING' | 'PAID') => {
        const newStatus = currentStatus === 'PENDING' ? 'PAID' : 'PENDING';
        try {
            await updateDoc(doc(db, 'match_stats', statId), {
                paymentStatus: newStatus
            });
        } catch (error) {
            console.error("Error toggling payment:", error);
            throw error;
        }
    };

    const updateManualDebt = async (amount: number) => {
        if (!groupId) {
            console.warn("Cannot update manual debt without a specific Group ID context.");
            return;
        }
        try {
            await updateDoc(doc(db, 'users', userId), {
                [`groupDebts.${groupId}`]: increment(amount)
            });
        } catch (error) {
            console.error("Error updating manual debt:", error);
            throw error;
        }
    };

    const processSmartPayment = async (amount: number) => {
        if (!userId || amount <= 0) return;
        let remainingAmount = amount;

        // 1. Pay Oldest Matches
        const sortedPending = [...pendingMatches].sort((a, b) => a.date.getTime() - b.date.getTime());

        for (const match of sortedPending) {
            if (remainingAmount >= match.price) {
                try {
                    await toggleMatchPayment(match.statId, 'PENDING');
                    remainingAmount -= match.price;
                } catch (error) {
                    console.error(`Error paying match ${match.matchId}:`, error);
                }
            } else {
                break;
            }
        }

        // 2. Reduce Manual Debt (Balance)
        if (remainingAmount > 0 && groupId) {
            // Pay = Subtract from debt
            // If manual debt is 10, and we pay 3, we subtract 3.
            // updateManualDebt(x) increments. So passed -remaining.
            await updateManualDebt(-remainingAmount);
        }
    };

    return {
        pendingMatches,
        paidMatches,
        totalDebt,
        matchesDebt,
        manualDebt,
        loading,
        toggleMatchPayment,
        updateManualDebt,
        processSmartPayment
    };
}
