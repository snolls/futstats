"use client";

import { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, Loader2 } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/context/AuthContext';
import { SocialRequest } from '@/types/request';
import { RequestService } from '@/services/RequestService';
import { toast } from 'sonner';

export default function NotificationsDropdown() {
    const { user, userData } = useAuthContext();
    const [requests, setRequests] = useState<SocialRequest[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Listen for requests
    useEffect(() => {
        if (!user || !userData) return;

        // Query Logic:
        // 1. If Superadmin: See 'request_admin'
        // 2. If Admin: See 'join_group' where auditors array-contains my UID.

        let q;
        if (userData.role === 'superadmin') {
            // Fetch ALL admin requests OR join requests where I am auditor (if I am also group admin)
            // Doing OR query in Firestore is hard. We might need two listeners or a broader query.
            // Simpler: Superadmin sees ALL 'request_admin'.
            // AND if they are group admins, they should see 'join_group' for their groups.
            // But 'auditors' field handles that. Superadmin keyword is special.
            q = query(
                collection(db, "requests"),
                where("auditors", "array-contains", "superadmin")
            );
            // Wait, we also want normal group requests if superadmin manages a group.
            // We can't do "array-contains 'superadmin' OR array-contains 'myUid'".
            // We will stick to role-based primary focus for MVP:
            // Superadmin sees Admin Requests. 
            // IMPROVEMENT: If I am superadmin AND a group admin, I missed group requests with above query.
            // Solution: We'll make two queries if needed, or just prioritize role requests. 
            // Let's LISTEN to 'auditors' array containing 'superadmin'.
            // AND separately listen to 'auditors' containing my UID? 
            // Let's implement generic 'auditors' logic. 
            // If I am superadmin, I should query where auditors contains 'superadmin'.
            // If I am any user, I query where auditors contains my UID.
        } else {
            q = query(
                collection(db, "requests"),
                where("auditors", "array-contains", user.uid)
            );
        }

        // Logic refinement: Superadmin query
        // If I use 'auditors' field on 'request_admin' as ['superadmin'], 
        // and 'join_group' as ['uid1', 'uid2'].
        // Superadmin needs to query: auditors contains 'superadmin' OR auditors contains 'myUid'.
        // Firestore doesn't support logical OR on different array-contains values easily.
        // We will implement TWO listeners for Superadmin.

        const unsubs: (() => void)[] = [];

        // Listener A: My UID (Group Admin requests)
        const q1 = query(collection(db, "requests"), where("auditors", "array-contains", user.uid));
        unsubs.push(onSnapshot(q1, (snap) => {
            updateRequests('uid', snap.docs.map(d => ({ id: d.id, ...d.data() } as SocialRequest)));
        }));

        // Listener B: 'superadmin' (Role requests) - Only if I am superadmin
        if (userData.role === 'superadmin') {
            const q2 = query(collection(db, "requests"), where("auditors", "array-contains", "superadmin"));
            unsubs.push(onSnapshot(q2, (snap) => {
                updateRequests('sa', snap.docs.map(d => ({ id: d.id, ...d.data() } as SocialRequest)));
            }));
        }

        // Helper to merge lists
        const resultsMap = new Map<string, SocialRequest[]>();
        const updateRequests = (key: string, list: SocialRequest[]) => {
            resultsMap.set(key, list);
            const merged = Array.from(resultsMap.values()).flat();
            // Dedup by ID
            const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
            // Sort desc
            unique.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            setRequests(unique);
            setUnreadCount(unique.length); // Assuming all in 'requests' collection are pending/unread
        };

        return () => unsubs.forEach(u => u());
    }, [user, userData]);

    const handleAccept = async (req: SocialRequest) => {
        if (!userData) return; // Should be impossible if we are here
        // We need to pass the current user as 'AppUserCustomData', effectively 'userData' 
        // but Typescript might complain about missing fields if 'userData' is partial.
        // We cast.
        try {
            setLoading(true);
            await RequestService.acceptRequest(userData as any, req);
            toast.success("Solicitud aceptada");
            setIsOpen(false);
        } catch (e) {
            console.error(e);
            toast.error("Error al aceptar");
        } finally {
            setLoading(false);
        }
    };

    const handleReject = async (req: SocialRequest) => {
        try {
            setLoading(true);
            await RequestService.rejectRequest(req);
            toast.success("Solicitud rechazada/eliminada");
        } catch (e) {
            console.error(e);
            toast.error("Error al rechazar");
        } finally {
            setLoading(false);
        }
    };

    // Always show the component, even if empty.
    // If empty, just don't show the red badge.

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2 rounded-full transition-all duration-200 ${isOpen ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
                title="Notificaciones"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 ring-1 ring-white/5">
                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center sticky top-0 z-10">
                        <h3 className="font-bold text-white text-sm flex items-center gap-2">
                            Notificaciones
                            {unreadCount > 0 && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
                        </h3>
                        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="max-h-[20rem] overflow-y-auto custom-scrollbar">
                        {requests.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                <Bell className="w-8 h-8 text-slate-800 mb-2" />
                                <p className="text-slate-500 text-sm font-medium">No tienes notificaciones pendientes.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/50">
                                {requests.map(req => (
                                    <div key={req.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                                        <div className="flex items-start gap-3">
                                            {req.userPhotoURL ? (
                                                <img src={req.userPhotoURL} alt={req.userName} className="w-9 h-9 rounded-full object-cover border border-slate-700" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 border border-slate-700">
                                                    {req.userName.slice(0, 2).toUpperCase()}
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <p className="text-sm text-slate-300 leading-snug">
                                                    <span className="font-bold text-white">{req.userName}</span>
                                                    {req.type === 'join_group' && (
                                                        <> solicita unirse a <span className="text-blue-400 font-medium">{req.targetGroupName}</span></>
                                                    )}
                                                    {req.type === 'request_admin' && (
                                                        <> solicita acceso como <span className="text-purple-400 font-medium">Organizador</span></>
                                                    )}
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                                                    {req.userEmail}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-3 pl-12">
                                            <button
                                                onClick={() => handleAccept(req)}
                                                disabled={loading}
                                                className="flex-1 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 border border-emerald-600/20 hover:border-emerald-600/40 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                                            >
                                                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                Aceptar
                                            </button>
                                            <button
                                                onClick={() => handleReject(req)}
                                                disabled={loading}
                                                className="flex-1 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-600/20 hover:border-red-600/40 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                                            >
                                                <X className="w-3 h-3" />
                                                Rechazar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
