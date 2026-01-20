import { useState, useEffect } from "react";
import { X, UserPlus, Euro, Loader2, Users } from "lucide-react";
import { useAuthContext } from "@/context/AuthContext";
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface CreateGuestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGuestCreated?: () => void;
}

export default function CreateGuestModal({ isOpen, onClose, onGuestCreated }: CreateGuestModalProps) {
    const { user } = useAuthContext();
    const [name, setName] = useState("");
    const [initialDebt, setInitialDebt] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Group Selection State
    const [myGroups, setMyGroups] = useState<{ id: string, name: string }[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen || !user) return;

        const fetchMyGroups = async () => {
            try {
                // Fetch groups where I am admin
                // Note: Superadmin might want to see all groups, but for now stick to managed groups logic
                // Or if role is superadmin, fetch all? Let's check user role if available, or just adminIds.
                // Safest is adminIds check for now as requested: "donde el usuario actual es Admin"
                const q = query(collection(db, 'groups'), where('adminIds', 'array-contains', user.uid));
                const snap = await getDocs(q);
                setMyGroups(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
            } catch (e) {
                console.error("Error fetching groups for guest:", e);
            }
        };

        fetchMyGroups();
        setSelectedGroupIds([]); // Reset selection on open
    }, [isOpen, user]);

    if (!isOpen) return null;

    const toggleGroup = (groupId: string) => {
        setSelectedGroupIds(prev =>
            prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !user) return;

        setIsLoading(true);
        try {
            const debtValue = initialDebt ? parseFloat(initialDebt) : 0;
            const batch = writeBatch(db);

            // 1. Create Guest Reference
            const guestRef = doc(collection(db, "users")); // Auto ID
            // const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; // Legacy format? 
            // It's better to use Firestore Auto ID for consistency, BUT previous code might rely on 'guest_' prefix.
            // Let's stick to standard Firestore IDs but add a field 'isGuest: true'.
            // OR use the requested prefix pattern if critical. 
            // The user request didn't specify ID format, but standard firestore ID is safer for collision. 
            // I'll use standard ID + role: 'guest'.

            const newGuestData = {
                displayName: name.trim(),
                email: "", // Guests don't have email usually
                role: "guest",
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                manualDebt: debtValue,
                associatedGroups: selectedGroupIds, // Link from Guest side
                photoURL: null,
                isGuest: true // Helper flag
            };

            batch.set(guestRef, newGuestData);

            // 2. Update Selected Groups
            selectedGroupIds.forEach(groupId => {
                const groupRef = doc(db, 'groups', groupId);
                batch.update(groupRef, {
                    // Note: Check if we use 'members' path or 'memberIds'. 
                    // Based on previous tasks, we standardized on 'members'. 
                    // CreateGroupModal uses `members`.
                    members: arrayUnion(guestRef.id)
                });
            });

            await batch.commit();

            setName("");
            setInitialDebt("");
            setSelectedGroupIds([]);

            if (onGuestCreated) onGuestCreated();
            onClose();
        } catch (error) {
            console.error("Error creating guest:", error);
            alert("Error al crear invitado.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl transform transition-all flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-purple-400" />
                        Nuevo Invitado
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Nombre / Alias</label>
                            <input
                                type="text"
                                placeholder="Ej: Primo de Alex"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all outline-none"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                <Euro className="w-4 h-4 text-slate-500" />
                                Deuda Inicial (Opcional)
                            </label>
                            <input
                                type="number"
                                placeholder="0.00"
                                step="0.5"
                                value={initialDebt}
                                onChange={(e) => setInitialDebt(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all outline-none"
                            />
                        </div>

                        {/* Group Selector */}
                        {myGroups.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-800">
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-2">
                                    <Users className="w-4 h-4 text-blue-400" />
                                    Asignar a Grupos:
                                </label>
                                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                                    {myGroups.map(group => (
                                        <label key={group.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-slate-600 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={selectedGroupIds.includes(group.id)}
                                                onChange={() => toggleGroup(group.id)}
                                                className="w-4 h-4 rounded border-slate-600 text-purple-600 focus:ring-purple-500/20 bg-slate-900"
                                            />
                                            <span className="text-sm text-slate-300 select-none">{group.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || isLoading}
                            className="px-6 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-lg shadow-purple-900/20 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                            Crear Invitado
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
