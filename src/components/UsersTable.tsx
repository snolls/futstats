'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUserCustomData } from '@/types/user';
import { MatchStats, Match } from '@/types/business';
import { useAuthContext } from '@/context/AuthContext';
import { AlertTriangle, CheckCircle, Search, User as UserIcon } from 'lucide-react';

interface UserRow extends AppUserCustomData {
    id: string; // Document ID
    pendingDebtMatches: number; // Count of matches with pending payment
    totalDebt: number; // Estimated amount (calculated from match price)
}

export default function UsersTable() {
    const { user, userData } = useAuthContext();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const fetchUsersAndDebts = async () => {
            if (!user) return;
            setLoading(true);

            try {
                // 1. Determine Scope: Superadmin sees all, Admin sees group members
                let usersToFetch: string[] = [];
                let fetchAll = false;

                if (userData?.role === 'superadmin') {
                    fetchAll = true;
                } else {
                    // Fetch my admin groups
                    const groupsQ = query(collection(db, "groups"), where("adminIds", "array-contains", user.uid));
                    const groupsSnap = await getDocs(groupsQ);

                    const memberSet = new Set<string>();
                    groupsSnap.forEach(doc => {
                        const members = doc.data().members || [];
                        members.forEach((m: string) => memberSet.add(m));
                    });

                    usersToFetch = Array.from(memberSet);
                    if (usersToFetch.length === 0) {
                        setUsers([]);
                        setLoading(false);
                        return;
                    }
                }

                // 2. Fetch Users
                let userDocs: UserRow[] = [];
                if (fetchAll) {
                    const q = query(collection(db, "users")); // Might need limit for scale
                    const snap = await getDocs(q);
                    userDocs = snap.docs.map(d => ({ id: d.id, ...d.data(), pendingDebtMatches: 0, totalDebt: 0 } as UserRow));
                } else {
                    // Chunk fetch
                    const chunkSize = 10;
                    for (let i = 0; i < usersToFetch.length; i += chunkSize) {
                        const chunk = usersToFetch.slice(i, i + chunkSize);
                        if (chunk.length > 0) {
                            const q = query(collection(db, "users"), where(documentId(), "in", chunk));
                            const snap = await getDocs(q);
                            snap.forEach(d => {
                                userDocs.push({ id: d.id, ...d.data(), pendingDebtMatches: 0, totalDebt: 0 } as UserRow);
                            });
                        }
                    }
                }

                // 3. Fetch Pending Debts (for these users)
                // Filter: paymentStatus == 'PENDING'
                // We also need Match prices to calculate totalDebt.

                const statsQuery = query(collection(db, "match_stats"), where("paymentStatus", "==", "PENDING"));
                // If not superadmin, we should ideally restrict this query to matches in my groups or users in my list.
                // But reading 'paymentStatus' index matches is okay, we filter in memory by relevant userIds.
                const statsSnap = await getDocs(statsQuery);

                // We need match prices. Fetch all matches? Or just relevant ones?
                // Optimization: Fetch only matches referenced in pending stats.
                const relevantMatchIds = new Set<string>();
                statsSnap.forEach(doc => {
                    const data = doc.data() as MatchStats;
                    relevantMatchIds.add(data.matchId);
                });

                const matchPrices: Record<string, number> = {};
                if (relevantMatchIds.size > 0) {
                    // Chunk fetch matches
                    const mIds = Array.from(relevantMatchIds);
                    for (let i = 0; i < mIds.length; i += 10) {
                        const chunk = mIds.slice(i, i + 10);
                        const mq = query(collection(db, "matches"), where(documentId(), "in", chunk));
                        const mSnap = await getDocs(mq);
                        mSnap.forEach(d => {
                            const mData = d.data() as Match;
                            // Assuming pricePerPlayer is on match doc based on previous implementation
                            // Check CreateMatchModal: yes, 'pricePerPlayer'
                            matchPrices[d.id] = (d.data() as any).pricePerPlayer || 0;
                        });
                    }
                }

                // 4. Map Debts to Users
                const userDebtMap: Record<string, { count: number, total: number }> = {};

                statsSnap.forEach(doc => {
                    const data = doc.data() as MatchStats; // Watch out for type 'userId' 
                    const uid = data.userId;
                    if (!uid) return;

                    // Filter: Only care if uid is in our userDocs list (for Admin scope)
                    // If superadmin, care about all? Yes.
                    // But if fetchAll is true, userDocs has everyone. 
                    // If managed scope, userDocs has filtered list.

                    // Simple check: is this uid in our displayed list?
                    // We can map userDocs to a Set for O(1) lookup, but simple find is okay for small n.
                    // Better: build map first.
                });

                // Re-iterate with map approach

                statsSnap.forEach(doc => {
                    const data = doc.data() as MatchStats;
                    const uid = data.userId;
                    if (!uid) return;

                    if (!userDebtMap[uid]) {
                        userDebtMap[uid] = { count: 0, total: 0 };
                    }

                    userDebtMap[uid].count += 1;
                    const price = matchPrices[data.matchId] || 0;
                    userDebtMap[uid].total += price;
                });

                // Attach to users
                const finalUsers = userDocs.map(u => ({
                    ...u,
                    pendingDebtMatches: userDebtMap[u.id]?.count || 0,
                    totalDebt: userDebtMap[u.id]?.total || 0
                }));

                setUsers(finalUsers);

            } catch (error) {
                console.error("Error fetching users/debts:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsersAndDebts();
    }, [user, userData]);

    const filteredUsers = users.filter(u =>
        u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return (
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
    );

    return (
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-[500px]">
            {/* Header / Filter */}
            <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-blue-500" />
                    Listado de Jugadores
                    <span className="text-sm text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{users.length}</span>
                </h3>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Buscar usuario..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-800/50 text-gray-400 text-xs uppercase tracking-wider sticky top-0 bg-gray-900/95 backdrop-blur z-10">
                            <th className="p-4 font-medium">Usuario</th>
                            <th className="p-4 font-medium text-center">Partidos Pendientes</th>
                            <th className="p-4 font-medium text-right">Deuda Total</th>
                            <th className="p-4 font-medium text-center">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-sm">
                        {filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-gray-500">
                                    No se encontraron usuarios.
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map((u) => (
                                <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                                                {u.displayName?.slice(0, 2).toUpperCase() || "??"}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{u.displayName}</div>
                                                <div className="text-xs text-gray-500">{u.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        {u.pendingDebtMatches > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20">
                                                {u.pendingDebtMatches} partidos
                                            </span>
                                        ) : (
                                            <span className="text-gray-500">-</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {u.totalDebt > 0 ? (
                                            <span className="text-red-400 font-bold">
                                                - €{u.totalDebt.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">€0.00</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        {u.totalDebt > 0 ? (
                                            <div className="flex justify-center" title="Tiene deudas pendientes">
                                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                            </div>
                                        ) : (
                                            <div className="flex justify-center" title="Al día">
                                                <CheckCircle className="w-5 h-5 text-green-500/50" />
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
