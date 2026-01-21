"use client";

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Search, Users, Loader2 } from 'lucide-react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/context/AuthContext';
import { RequestService } from '@/services/RequestService';
import { toast } from 'sonner';

interface ExploreGroup {
    id: string;
    name: string;
    members: string[]; // List of IDs
    adminIds: string[];
    requestStatus?: 'none' | 'pending' | 'member';
}

export default function ExplorePage() {
    const { user } = useAuthContext();
    const [searchTerm, setSearchTerm] = useState("");
    const [groups, setGroups] = useState<ExploreGroup[]>([]);
    const [loading, setLoading] = useState(false);

    // Initial fetch of "Popular" or "Recent" groups
    const fetchGroups = async (term: string) => {
        setLoading(true);
        try {
            let q;
            if (term.trim()) {
                // Name search (Client side filtering for MVP as Firestore native search is limited)
                // We'll fetch a batch and filter.
                q = query(collection(db, "groups"), limit(50));
            } else {
                q = query(collection(db, "groups"), limit(20)); // Just recent/all
            }

            const snap = await getDocs(q);
            let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as any)) as ExploreGroup[];

            // Filter if term
            if (term.trim()) {
                const lower = term.toLowerCase();
                fetched = fetched.filter(g => g.name.toLowerCase().includes(lower));
            }

            // Determine status for each group relative to ME
            if (user) {
                // 1. Check if Member
                fetched = fetched.map(g => ({
                    ...g,
                    requestStatus: g.members?.includes(user.uid) ? 'member' : 'none'
                }));

                // 2. Check if Pending Request
                // We need to fetch MY requests to see if I have pending ones.
                const myReqsQ = query(
                    collection(db, "requests"),
                    where("userId", "==", user.uid),
                    where("type", "==", "join_group"),
                    where("status", "==", "pending")
                );
                const reqsSnap = await getDocs(myReqsQ);
                const pendingGroupIds = new Set(reqsSnap.docs.map(d => d.data().targetGroupId));

                fetched = fetched.map(g => ({
                    ...g,
                    requestStatus: g.requestStatus === 'member'
                        ? 'member'
                        : pendingGroupIds.has(g.id)
                            ? 'pending'
                            : 'none'
                }));
            }

            setGroups(fetched);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGroups("");
    }, [user]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchGroups(searchTerm);
    };

    const handleJoin = async (group: ExploreGroup) => {
        if (!user) return;
        try {
            // Optimistic Update
            setGroups(prev => prev.map(g => g.id === group.id ? { ...g, requestStatus: 'pending' } : g));

            await RequestService.createJoinRequest(
                { id: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL } as any,
                { id: group.id, name: group.name, adminIds: group.adminIds }
            );
            toast.success("Solicitud enviada");
        } catch (e) {
            console.error(e);
            toast.error("Error al enviar solicitud");
            // Revert
            setGroups(prev => prev.map(g => g.id === group.id ? { ...g, requestStatus: 'none' } : g));
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-4">Explorar Grupos</h1>
                    <form onSubmit={handleSearch} className="relative max-w-xl">
                        <Search className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar grupos por nombre..."
                            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-green-500 outline-none transition-all placeholder:text-gray-600"
                        />
                    </form>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                    </div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        No se encontraron grupos.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {groups.map(group => (
                            <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors">
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-start justify-between">
                                        <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center">
                                            <Users className="w-6 h-6 text-gray-400" />
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-gray-500">{group.members?.length || 0} miembros</span>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-xl font-bold text-white mb-1">{group.name}</h3>
                                        <p className="text-sm text-gray-500">Grupo de Fútbol</p>
                                    </div>

                                    <div className="pt-4 mt-auto border-t border-gray-800">
                                        {group.requestStatus === 'member' ? (
                                            <button disabled className="w-full py-2 bg-gray-800 text-gray-500 font-bold rounded-lg cursor-not-allowed">
                                                Ya eres miembro
                                            </button>
                                        ) : group.requestStatus === 'pending' ? (
                                            <button disabled className="w-full py-2 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-bold rounded-lg cursor-not-allowed">
                                                Solicitud Pendiente
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleJoin(group)}
                                                className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-green-900/20"
                                            >
                                                Solicitar Unirse
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
