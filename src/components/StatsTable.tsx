'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MatchStats } from '@/types/business';
import { AppUserCustomData } from '@/types/user';
import { useAuthContext } from '@/context/AuthContext';
import { ArrowDown, ArrowUp, ArrowUpDown, User, Ghost } from 'lucide-react';

interface PlayerStatRow {
    uid: string;
    displayName: string;
    matchesPlayed: number;
    goals: number;
    assists: number;
    mvps: number;
    isGuest: boolean;
}

interface StatsTableProps {
    selectedGroupId?: string | null;
}

export default function StatsTable({ selectedGroupId }: StatsTableProps) {
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

                if (selectedGroupId) {
                    // CONTEXT: Specific Group
                    const q = query(collection(db, 'matches'), where('groupId', '==', selectedGroupId));
                    const snap = await getDocs(q);
                    relevantMatchIds = snap.docs.map(m => m.id);
                } else if (userData?.role === 'superadmin') {
                    // CONTEXT: Global (Superadmin)
                    const matchesSnap = await getDocs(collection(db, 'matches'));
                    relevantMatchIds = matchesSnap.docs.map(m => m.id);
                } else {
                    // CONTEXT: Global (Regular User/Admin) - Show matches from ALL my groups
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

                // Identify Users vs Guests
                const registeredUserIds = new Set<string>();
                allStats.forEach(s => {
                    if (!s.isGuest && s.userId) {
                        registeredUserIds.add(s.userId);
                    }
                });

                const userMap: Record<string, string> = {};
                if (registeredUserIds.size > 0) {
                    const uIdsArray = Array.from(registeredUserIds);
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

                    const isGuest = !!stat.isGuest;
                    // Use guest display name or map from registered users
                    const displayName = isGuest ? (stat.displayName || 'Invitado') : (userMap[pid] || 'Desconocido');

                    if (!aggregation[pid]) {
                        aggregation[pid] = {
                            uid: pid,
                            displayName: displayName,
                            matchesPlayed: 0,
                            goals: 0,
                            assists: 0,
                            mvps: 0,
                            isGuest: isGuest
                        };
                    }
                    aggregation[pid].matchesPlayed += 1;
                    aggregation[pid].goals += (stat.goals || 0);
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
        fetchStats();
    }, [user, userData, selectedGroupId]);

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
        <div className="w-full overflow-x-auto bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-lg shadow-lg">
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
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                    {sortedStats.map((player, index) => (
                        <tr key={player.uid} className="hover:bg-gray-800/30 transition-colors">
                            <td className="p-4 flex items-center gap-3">
                                <span className={`
                                        w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold
                                        ${index === 0 ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' :
                                        index === 1 ? 'bg-gray-300 text-black shadow-lg shadow-gray-400/20' :
                                            index === 2 ? 'bg-amber-700 text-white shadow-lg shadow-amber-900/40' : 'bg-gray-800 text-gray-400'}
                                    `}>
                                    {index + 1}
                                </span>
                                {player.isGuest ? (
                                    <div title="Invitado" className="p-1 rounded bg-amber-900/20">
                                        <Ghost className="w-4 h-4 text-amber-500" />
                                    </div>
                                ) : (
                                    <User className="w-4 h-4 text-gray-500" />
                                )}
                                <span className={player.isGuest ? "font-medium text-amber-200" : "font-medium text-white"}>
                                    {player.displayName}
                                </span>
                                {player.isGuest && <span className="text-[10px] uppercase text-amber-500/70 font-bold ml-1">(Inv)</span>}
                            </td>
                            <td className="p-4 text-center text-gray-300">{player.matchesPlayed}</td>
                            <td className="p-4 text-center font-bold text-green-400">{player.goals}</td>
                            <td className="p-4 text-center text-yellow-500">{player.mvps > 0 ? player.mvps : '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
