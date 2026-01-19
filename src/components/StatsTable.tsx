'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MatchStats } from '@/types/business';
import { AppUserCustomData } from '@/types/user';
import { useAuthContext } from '@/context/AuthContext';

interface PlayerStatRow {
    uid: string;
    displayName: string;
    matchesPlayed: number;
    goals: number;
    assists: number;
    mvps: number;
}

export default function StatsTable() {
    const { user, userData } = useAuthContext();
    const [stats, setStats] = useState<PlayerStatRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            // Only fetch if we have a user
            if (!user) return;

            setLoading(true);
            try {
                // 1. Get My Groups (Logic similar to CreateMatch but for visibility)
                // We need to find all groups where 'members' array-contains user.uid
                // Note: 'members' field was added recently. Legacy groups might not have it unless migrated or new.

                let myGroupIds: string[] = [];

                if (userData?.role === 'superadmin') {
                    // Superadmin sees all
                    // Just an empty array to signal 'all' or specific logic?
                    // Let's assume Superadmin sees stats for ALL matches in the system.
                } else {
                    const groupsQuery = query(collection(db, 'groups'), where('members', 'array-contains', user.uid));
                    const groupsSnap = await getDocs(groupsQuery);
                    myGroupIds = groupsSnap.docs.map(g => g.id);

                    if (myGroupIds.length === 0) {
                        setStats([]); // User is in no groups, sees no stats
                        setLoading(false);
                        return;
                    }
                }

                // 2. Fetch Aggregatable Data
                // Strategy: 
                // A) Fetch matches filtered by myGroupIds.
                // B) Fetch match_stats filtered by matchId IN (matches).

                let relevantMatchIds: string[] = [];

                if (userData?.role === 'superadmin') {
                    // Fetch ALL matches? Could be huge. Limit recent 100?
                    // For MVP StatsTable, maybe we fetch all matches
                    const matchesSnap = await getDocs(collection(db, 'matches'));
                    relevantMatchIds = matchesSnap.docs.map(m => m.id);
                } else {
                    // Chunk query matches by groupId
                    // Firestore 'in' limit is 10.
                    const matchRef = collection(db, 'matches');
                    const chunks = [];
                    for (let i = 0; i < myGroupIds.length; i += 10) {
                        chunks.push(myGroupIds.slice(i, i + 10));
                    }

                    for (const chunk of chunks) {
                        const q = query(matchRef, where('groupId', 'in', chunk));
                        const snap = await getDocs(q);
                        snap.forEach(doc => relevantMatchIds.push(doc.id));
                    }
                }

                if (relevantMatchIds.length === 0) {
                    setStats([]);
                    setLoading(false);
                    return;
                }

                // 3. Fetch Match Stats
                // match_stats has 'matchId'. Filter by relevantMatchIds.
                // Again, 'in' query limit 10. This can scale poorly if many matches.
                // OPTIMIZATION for Client-side heavy lifting (small scale): 
                // Fetch ALL match_stats and Filter JS side? NO, security rules usually prevent that.
                // Correct approach: We need to iterate chunks.

                const statsMap: Record<string, MatchStats[]> = {}; // Key: matchId -> Stats[] (not needed, we just need aggregation)
                const allStats: MatchStats[] = [];

                const statsRef = collection(db, 'match_stats');
                // Iterate chunks of match IDs
                for (let i = 0; i < relevantMatchIds.length; i += 10) {
                    const chunk = relevantMatchIds.slice(i, i + 10);
                    const q = query(statsRef, where('matchId', 'in', chunk));
                    const snap = await getDocs(q);
                    snap.forEach(d => allStats.push(d.data() as MatchStats));
                }

                // 4. Fetch User Names (Optimized: only for uids found in stats)
                const userIds = new Set(allStats.map(s => s.userId));
                const userMap: Record<string, string> = {};

                if (userIds.size > 0) {
                    // Chunk user fetches
                    const uIdsArray = Array.from(userIds);
                    for (let i = 0; i < uIdsArray.length; i += 10) {
                        const chunk = uIdsArray.slice(i, i + 10);
                        if (chunk.length > 0) {
                            // Use __name__ or uid field? Users usually docID=uid
                            const uQ = query(collection(db, 'users'), where(documentId(), 'in', chunk));
                            const uSnap = await getDocs(uQ);
                            uSnap.forEach(doc => {
                                const d = doc.data() as AppUserCustomData;
                                userMap[doc.id] = d.displayName || 'Desconocido';
                            });
                        }
                    }
                }

                // 5. Aggregate
                const aggregation: Record<string, PlayerStatRow> = {};

                allStats.forEach(stat => {
                    const pid = stat.userId;
                    if (!pid) return; // Should not happen

                    if (!aggregation[pid]) {
                        aggregation[pid] = {
                            uid: pid,
                            displayName: userMap[pid] || 'Desconocido',
                            matchesPlayed: 0,
                            goals: 0,
                            assists: 0,
                            mvps: 0
                        };
                    }

                    aggregation[pid].matchesPlayed += 1;
                    aggregation[pid].goals += (stat.goals || 0);
                    aggregation[pid].assists += (stat.assists || 0);
                    // Checking if there is an isMvp field logic? Assuming yes based on previous code.
                    const isMvp = (stat as any).isMvp;
                    if (isMvp) aggregation[pid].mvps += 1;
                });

                const sortedStats = Object.values(aggregation).sort((a, b) => b.goals - a.goals);
                setStats(sortedStats);

            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [user, userData]);

    if (loading) return (
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
        </div>
    );

    if (stats.length === 0) {
        return (
            <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg p-6 flex flex-col items-center justify-center min-h-[300px]">
                <div className="text-gray-500 text-center">
                    <h3 className="text-lg font-medium text-white mb-2">Clasificación de Jugadores</h3>
                    <p>No tienes acceso a estadísticas o no hay datos relevantes.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-800/50 text-gray-400 text-sm uppercase tracking-wider">
                            <th className="p-4 font-medium">Jugador</th>
                            <th className="p-4 font-medium text-center">PJ</th>
                            <th className="p-4 font-medium text-center">Goles</th>
                            <th className="p-4 font-medium text-center">Asistencias</th>
                            <th className="p-4 font-medium text-center">MVP</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {stats.map((player, index) => (
                            <tr key={player.uid} className="hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 flex items-center gap-3">
                                    <span className={`
                                        w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold
                                        ${index === 0 ? 'bg-yellow-500 text-black' :
                                            index === 1 ? 'bg-gray-400 text-black' :
                                                index === 2 ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400'}
                                    `}>
                                        {index + 1}
                                    </span>
                                    <span className="font-medium text-white">{player.displayName}</span>
                                </td>
                                <td className="p-4 text-center text-gray-300">{player.matchesPlayed}</td>
                                <td className="p-4 text-center font-bold text-green-400">{player.goals}</td>
                                <td className="p-4 text-center text-gray-300">{player.assists}</td>
                                <td className="p-4 text-center text-yellow-500">{player.mvps > 0 ? player.mvps : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
