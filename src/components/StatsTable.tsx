'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MatchStats } from '@/types/business';
import { AppUserCustomData } from '@/types/user';
import { useAuthContext } from '@/context/AuthContext';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

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
    const [sortConfig, setSortConfig] = useState<{ key: keyof PlayerStatRow; direction: 'asc' | 'desc' }>({
        key: 'goals',
        direction: 'desc'
    });

    useEffect(() => {
        const fetchStats = async () => {
            if (!user) return;
            // ... Fetch logic remains similar, but we remove Assists aggregation ...
            // Optimization: I'll preserve the fetch logic but filtering output
            setLoading(true);
            try {
                let myGroupIds: string[] = [];
                if (userData?.role !== 'superadmin') {
                    const groupsQuery = query(collection(db, 'groups'), where('members', 'array-contains', user.uid));
                    const groupsSnap = await getDocs(groupsQuery);
                    myGroupIds = groupsSnap.docs.map(g => g.id);
                    if (myGroupIds.length === 0) {
                        setStats([]); setLoading(false); return;
                    }
                }

                let relevantMatchIds: string[] = [];
                if (userData?.role === 'superadmin') {
                    const matchesSnap = await getDocs(collection(db, 'matches'));
                    relevantMatchIds = matchesSnap.docs.map(m => m.id);
                } else {
                    const matchRef = collection(db, 'matches');
                    const chunks = [];
                    for (let i = 0; i < myGroupIds.length; i += 10) chunks.push(myGroupIds.slice(i, i + 10));
                    for (const chunk of chunks) {
                        const q = query(matchRef, where('groupId', 'in', chunk));
                        const snap = await getDocs(q);
                        snap.forEach(doc => relevantMatchIds.push(doc.id));
                    }
                }

                if (relevantMatchIds.length === 0) {
                    setStats([]); setLoading(false); return;
                }

                const statsRef = collection(db, 'match_stats');
                const allStats: MatchStats[] = [];
                for (let i = 0; i < relevantMatchIds.length; i += 10) {
                    const chunk = relevantMatchIds.slice(i, i + 10);
                    const q = query(statsRef, where('matchId', 'in', chunk));
                    const snap = await getDocs(q);
                    snap.forEach(d => allStats.push(d.data() as MatchStats));
                }

                const userIds = new Set(allStats.map(s => s.userId));
                const userMap: Record<string, string> = {};
                if (userIds.size > 0) {
                    const uIdsArray = Array.from(userIds);
                    for (let i = 0; i < uIdsArray.length; i += 10) {
                        const chunk = uIdsArray.slice(i, i + 10);
                        if (chunk.length > 0) {
                            const uQ = query(collection(db, 'users'), where(documentId(), 'in', chunk));
                            const uSnap = await getDocs(uQ);
                            uSnap.forEach(doc => {
                                const d = doc.data() as AppUserCustomData;
                                userMap[doc.id] = d.displayName || 'Desconocido';
                            });
                        }
                    }
                }

                const aggregation: Record<string, PlayerStatRow> = {};
                allStats.forEach(stat => {
                    const pid = stat.userId;
                    if (!pid) return;
                    if (!aggregation[pid]) {
                        aggregation[pid] = {
                            uid: pid,
                            displayName: userMap[pid] || 'Desconocido',
                            matchesPlayed: 0,
                            goals: 0,
                            assists: 0, // Ignoring in UI
                            mvps: 0
                        };
                    }
                    aggregation[pid].matchesPlayed += 1;
                    aggregation[pid].goals += (stat.goals || 0);
                    // aggregation[pid].assists += (stat.assists || 0);
                    if ((stat as any).isMvp) aggregation[pid].mvps += 1;
                });

                // Initial Sort
                const sorted = Object.values(aggregation).sort((a, b) => b.goals - a.goals);
                setStats(sorted);

            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, [user, userData]);

    // Sorting Logic
    const handleSort = (key: keyof PlayerStatRow) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const sortedStats = [...stats].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const SortIcon = ({ column }: { column: keyof PlayerStatRow }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="w-4 h-4 ml-1 text-gray-600 opacity-50" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp className="w-4 h-4 ml-1 text-green-500" />
            : <ArrowDown className="w-4 h-4 ml-1 text-green-500" />;
    };

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
                            <th
                                className="p-4 font-medium text-center cursor-pointer hover:text-white transition-colors select-none"
                                onClick={() => handleSort('matchesPlayed')}
                            >
                                <div className="flex items-center justify-center">
                                    PJ <SortIcon column="matchesPlayed" />
                                </div>
                            </th>
                            <th
                                className="p-4 font-medium text-center cursor-pointer hover:text-white transition-colors select-none"
                                onClick={() => handleSort('goals')}
                            >
                                <div className="flex items-center justify-center">
                                    Goles <SortIcon column="goals" />
                                </div>
                            </th>
                            {/* Removed Assists */}
                            <th
                                className="p-4 font-medium text-center cursor-pointer hover:text-white transition-colors select-none"
                                onClick={() => handleSort('mvps')}
                            >
                                <div className="flex items-center justify-center">
                                    MVP <SortIcon column="mvps" />
                                </div>
                            </th>
                            {/* Placeholder for Win% (Not implemented due to schema limitation, but logic structure is here) */}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {sortedStats.map((player, index) => (
                            <tr key={player.uid} className="hover:bg-gray-800/30 transition-colors">
                                <td className="p-4 flex items-center gap-3">
                                    <span className={`
                                        w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold
                                        ${index === 0 && sortConfig.key === 'goals' ? 'bg-yellow-500 text-black' :
                                            index === 1 && sortConfig.key === 'goals' ? 'bg-gray-400 text-black' :
                                                index === 2 && sortConfig.key === 'goals' ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400'}
                                    `}>
                                        {index + 1}
                                    </span>
                                    <span className="font-medium text-white">{player.displayName}</span>
                                </td>
                                <td className="p-4 text-center text-gray-300">{player.matchesPlayed}</td>
                                <td className="p-4 text-center font-bold text-green-400">{player.goals}</td>
                                <td className="p-4 text-center text-yellow-500">{player.mvps > 0 ? player.mvps : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
