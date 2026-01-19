'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MatchStats } from '@/types/business';
import { AppUserCustomData } from '@/types/user';

interface PlayerStatRow {
    uid: string;
    displayName: string;
    matchesPlayed: number;
    goals: number;
    assists: number;
    mvps: number;
}

export default function StatsTable() {
    const [stats, setStats] = useState<PlayerStatRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // 1. Fetch all match stats
                const statsRef = collection(db, 'match_stats');
                const statsSnapshot = await getDocs(statsRef);

                // 2. Fetch all users to map names (Optimization: cache or fetch only needed)
                const usersRef = collection(db, 'users');
                const usersSnapshot = await getDocs(usersRef);
                const userMap: Record<string, string> = {};
                usersSnapshot.forEach(doc => {
                    const data = doc.data() as AppUserCustomData;
                    userMap[doc.id] = data.displayName || 'Unknown';
                });

                // 3. Aggregate Data
                const aggregation: Record<string, PlayerStatRow> = {};

                statsSnapshot.forEach(doc => {
                    const data = doc.data() as MatchStats;
                    const pid = data.playerId;

                    if (!aggregation[pid]) {
                        aggregation[pid] = {
                            uid: pid,
                            displayName: userMap[pid] || 'Unknown',
                            matchesPlayed: 0,
                            goals: 0,
                            assists: 0,
                            mvps: 0
                        };
                    }

                    aggregation[pid].matchesPlayed += 1;
                    aggregation[pid].goals += (data.goals || 0);
                    aggregation[pid].assists += (data.assists || 0);
                    if (data.isMvp) aggregation[pid].mvps += 1;
                });

                // Convert to array and sort by goals desc
                const sortedStats = Object.values(aggregation).sort((a, b) => b.goals - a.goals);
                setStats(sortedStats);

            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) return <div className="text-center p-4 text-gray-400">Cargando estadísticas...</div>;

    if (stats.length === 0) {
        return (
            <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg p-6 flex flex-col items-center justify-center min-h-[300px]">
                <div className="text-gray-500 text-center">
                    <h3 className="text-lg font-medium text-white mb-2">Clasificación de Jugadores</h3>
                    <p>No hay datos disponibles todavía.</p>
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
