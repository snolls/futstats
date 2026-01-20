'use client';

import { useState, useEffect } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Search, Users, Loader2, Check, Clock, Send } from 'lucide-react';
import { X } from 'lucide-react';

interface GroupFinderModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function GroupFinderModal({ isOpen, onClose }: GroupFinderModalProps) {
    const { user, userData } = useAuthContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
    const [requests, setRequests] = useState<string[]>([]); // Group IDs with pending requests
    const [loading, setLoading] = useState(false);
    const [requestingGroupId, setRequestingGroupId] = useState<string | null>(null);

    // Fetch initial data
    useEffect(() => {
        if (!isOpen || !user) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch all groups (Optimization: In a real app, use limit or Algolia)
                const groupsSnap = await getDocs(collection(db, 'groups'));
                const fetchedGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setGroups(fetchedGroups);

                // Fetch my pending requests
                const requestsQ = query(
                    collection(db, 'group_requests'),
                    where('userId', '==', user.uid),
                    where('status', '==', 'pending')
                );
                const requestsSnap = await getDocs(requestsQ);
                setRequests(requestsSnap.docs.map(d => d.data().groupId));

            } catch (error) {
                console.error("Error fetching finder data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen, user]);

    const handleJoinRequest = async (group: any) => {
        if (!user) return;
        setRequestingGroupId(group.id);

        try {
            await addDoc(collection(db, 'group_requests'), {
                userId: user.uid,
                userName: user.displayName || 'Usuario',
                groupId: group.id,
                groupName: group.name,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            // Update local state to show 'Pending' immediately
            setRequests(prev => [...prev, group.id]);
            // alert(`Solicitud enviada a ${group.name}`);
        } catch (error) {
            console.error("Error sending request:", error);
            alert("Error al enviar solicitud.");
        } finally {
            setRequestingGroupId(null);
        }
    };

    const filteredGroups = groups.filter(g =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-xl flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Search className="w-5 h-5 text-blue-500" />
                            Explorar Grupos
                        </h2>
                        <p className="text-xs text-gray-400 mt-1">Busca y únete a ligas de fútbol.</p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search Input */}
                <div className="p-6 pb-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-3 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                        </div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 text-sm">
                            No se encontraron grupos con ese nombre.
                        </div>
                    ) : (
                        filteredGroups.map(group => {
                            const isMember = userData?.associatedGroups?.includes(group.id) || group.members?.includes(user?.uid);
                            const isPending = requests.includes(group.id);
                            const isProcessing = requestingGroupId === group.id;

                            return (
                                <div key={group.id} className="flex items-center justify-between p-4 bg-gray-950/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors">
                                    <div className="flex flex-col gap-1">
                                        <h3 className="font-bold text-white text-sm">{group.name}</h3>
                                        <div className="flex items-center gap-3 text-xs text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {(group.members || []).length} miembros
                                            </span>
                                        </div>
                                    </div>

                                    {isMember ? (
                                        <button
                                            disabled
                                            className="px-3 py-1.5 bg-green-500/10 text-green-500 text-xs font-bold rounded-lg border border-green-500/20 flex items-center gap-1 cursor-not-allowed opacity-80"
                                        >
                                            <Check className="w-3 h-3" />
                                            Ya eres miembro
                                        </button>
                                    ) : isPending ? (
                                        <button
                                            disabled
                                            className="px-3 py-1.5 bg-yellow-500/10 text-yellow-500 text-xs font-bold rounded-lg border border-yellow-500/20 flex items-center gap-1 cursor-not-allowed opacity-80"
                                        >
                                            <Clock className="w-3 h-3" />
                                            Solicitud enviada
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleJoinRequest(group)}
                                            disabled={isProcessing}
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                            Solicitar Unirse
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

            </div>
        </div>
    );
}
