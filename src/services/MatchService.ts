import { db } from '@/lib/firebase';
import {
    doc,
    updateDoc,
    arrayUnion,
    arrayRemove,
    getDoc,
    collection,
    addDoc,
    serverTimestamp,
    runTransaction,
    Timestamp
} from 'firebase/firestore';
import { Match } from '@/types/business';
import { FinanceService } from './FinanceService';

export const MatchService = {
    /**
     * Creates a new match with the defined configuration
     */
    async createMatch(matchData: Partial<Match>) {
        if (!matchData.groupId) throw new Error("Group ID is required");

        // Defaults
        const newMatch: Partial<Match> = {
            ...matchData,
            status: 'SCHEDULED',
            players: [],
            waitlist: [],
            isLocked: false,
            paymentStatus: {},
            type: matchData.type || 'open',
            maxPlayers: matchData.maxPlayers || 14,
            price: matchData.price || 0,
        };

        const docRef = await addDoc(collection(db, 'matches'), newMatch);
        return docRef.id;
    },

    /**
     * User joins an OPEN match.
     * Handles squad limit, waitlist, and debt generation.
     */
    async joinMatch(matchId: string, userId: string) {
        return await runTransaction(db, async (transaction) => {
            const matchRef = doc(db, 'matches', matchId);
            const matchSnap = await transaction.get(matchRef);

            if (!matchSnap.exists()) throw new Error("Partido no encontrado");

            const match = matchSnap.data() as Match;

            if (match.isLocked || match.status !== 'SCHEDULED') {
                throw new Error("El partido está cerrado o finalizado");
            }

            if (match.type === 'closed') {
                throw new Error("Este partido es cerrado. Solo el admin puede añadir jugadores.");
            }

            if (match.players.includes(userId) || match.waitlist.includes(userId)) {
                throw new Error("Ya estás apuntado");
            }

            // Logic: Squad vs Waitlist
            if (match.players.length < match.maxPlayers) {
                // Add to Squad
                transaction.update(matchRef, {
                    players: arrayUnion(userId)
                });

                // Generate Debt (only if price > 0 and not on waitlist)
                if (match.price > 0) {
                    await FinanceService.addTransaction(
                        userId,
                        match.groupId,
                        match.price,
                        `Inscripción Partido ${match.date instanceof Timestamp ? match.date.toDate().toLocaleDateString() : ''}`,
                        'SYSTEM',
                        'MATCH_PAYMENT'
                    );
                }
                return { status: 'ADDED_TO_SQUAD' };
            } else {
                // Add to Waitlist
                transaction.update(matchRef, {
                    waitlist: arrayUnion(userId)
                });
                return { status: 'ADDED_TO_WAITLIST' };
            }
        });
    },

    /**
     * User leaves a match.
     * Handles refund/debt cancellation and waitlist promotion.
     */
    async leaveMatch(matchId: string, userId: string) {
        return await runTransaction(db, async (transaction) => {
            const matchRef = doc(db, 'matches', matchId);
            const matchSnap = await transaction.get(matchRef);
            if (!matchSnap.exists()) throw new Error("Partido no encontrado");

            const match = matchSnap.data() as Match;

            if (match.isLocked) throw new Error("El partido está bloqueado");

            const isSquad = match.players.includes(userId);
            const isWaitlist = match.waitlist.includes(userId);

            if (!isSquad && !isWaitlist) throw new Error("No estás apuntado");

            // 1. Remove user
            if (isSquad) {
                transaction.update(matchRef, {
                    players: arrayRemove(userId)
                });

                // Revert Debt if applicable
                if (match.price > 0) {
                    await FinanceService.addTransaction(
                        userId,
                        match.groupId,
                        -match.price, // Negative amount to effectively "refund" or cancel debt
                        `Salida Partido ${match.date instanceof Timestamp ? match.date.toDate().toLocaleDateString() : ''}`,
                        'SYSTEM',
                        'MATCH_REFUND'
                    );
                }

                // 2. Promote from Waitlist if available
                if (match.waitlist.length > 0) {
                    const nextUser = match.waitlist[0];
                    transaction.update(matchRef, {
                        waitlist: arrayRemove(nextUser),
                        players: arrayUnion(nextUser) // Add to end of squad
                    });

                    // Charge Debt to Promoted User
                    if (match.price > 0) {
                        await FinanceService.addTransaction(
                            nextUser,
                            match.groupId,
                            match.price,
                            `Promoción Waitlist Partido ${match.date instanceof Timestamp ? match.date.toDate().toLocaleDateString() : ''}`,
                            'SYSTEM',
                            'MATCH_PAYMENT'
                        );
                    }
                }

            } else {
                // Just remove from waitlist (no money involved)
                transaction.update(matchRef, {
                    waitlist: arrayRemove(userId)
                });
            }
        });
    },

    /**
     * Admin manually adds a player (Compatible with 'closed' matches).
     * Bypasses 'open' restrictions but respects maxPlayers logic if desired, or forcing it.
     * Here we implement "Force Add" which might bypass typical flow, but usually standard logic is preferred.
     * We'll assume Admin adds to Squad directly.
     */
    async adminAddPlayer(matchId: string, userId: string, target: 'players' | 'waitlist' = 'players') {
        const matchRef = doc(db, 'matches', matchId);
        const matchSnap = await getDoc(matchRef);
        if (!matchSnap.exists()) throw new Error("Partido no encontrado");
        const match = matchSnap.data() as Match;

        if (target === 'players') {
            await updateDoc(matchRef, {
                players: arrayUnion(userId)
            });
            // Charge Debt
            if (match.price > 0) {
                await FinanceService.addTransaction(
                    userId,
                    match.groupId,
                    match.price,
                    `Convocatoria Admin Partido`,
                    'ADMIN',
                    'MATCH_PAYMENT'
                );
            }
        } else {
            await updateDoc(matchRef, {
                waitlist: arrayUnion(userId)
            });
        }
    },

    async adminRemovePlayer(matchId: string, userId: string) {
        // Reuse leaveMatch logic but triggered by admin? 
        // Or specific logic. Using leaveMatch ensures waitlist promotion runs.
        await this.leaveMatch(matchId, userId);
    },

    /**
     * Closes the match, saves stats, and locks it.
     */
    async closeMatch(matchId: string, stats: Match['stats']) {
        const matchRef = doc(db, 'matches', matchId);
        await updateDoc(matchRef, {
            status: 'COMPLETED',
            isLocked: true,
            stats: stats
        });
    }
};
