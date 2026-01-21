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

    if (requests.length === 0) return null; // Or show empty bell? Usually hidden if empty or just bell without dot.
    // User requested "campanita con punto rojo". If 0, maybe just bell or nothing.
    // Let's show Bell always if Role is Admin/Superadmin? Or just if requests exist?
    // "Un indicador visual (campanita...) cuando alguien pide..." -> Implies reactive.
    // But helpful to have the center available.

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-gray-900" />
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 border-b border-gray-800 flex justify-between items-center">
                        <h3 className="font-bold text-white text-sm">Notificaciones</h3>
                        <span className="text-xs text-gray-500">{unreadCount} pendientes</span>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {requests.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-xs">
                                No hay notificaciones nuevas.
                            </div>
                        ) : (
                            requests.map(req => (
                                <div key={req.id} className="p-3 border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                                            {req.userName.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-gray-300">
                                                <span className="font-bold text-white">{req.userName}</span>
                                                {req.type === 'join_group' && (
                                                    <> quiere unirse a <span className="text-blue-400">{req.targetGroupName}</span></>
                                                )}
                                                {req.type === 'request_admin' && (
                                                    <> solicita ser <span className="text-purple-400">Organizador</span></>
                                                )}
                                            </p>
                                            <p className="text-[10px] text-gray-500 mt-1">
                                                {req.userEmail}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3 pl-11">
                                        <button
                                            onClick={() => handleAccept(req)}
                                            disabled={loading}
                                            className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center justify-center gap-1 disabled:opacity-50"
                                        >
                                            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                            Aceptar
                                        </button>
                                        <button
                                            onClick={() => handleReject(req)}
                                            disabled={loading}
                                            className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold rounded flex items-center justify-center gap-1"
                                        >
                                            <X className="w-3 h-3" />
                                            Rechazar
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
