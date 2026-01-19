"use client";

import { useState, useEffect } from "react";
import { X, Users, Loader2, Save, Trash2, Shield, ShieldCheck, UserPlus, Search } from "lucide-react";
import { doc, updateDoc, getDocs, collection, query, where, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthContext } from "@/context/AuthContext";

interface GroupData {
    id: string;
    name: string;
    adminIds: string[];
    members?: string[];
}

interface UserData {
    id: string;
    displayName: string;
    email: string;
    photoURL?: string;
}

interface EditGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    groupData: GroupData | null;
    onUpdate: () => void; // Callback to refresh dashboard
}

export default function EditGroupModal({ isOpen, onClose, groupData, onUpdate }: EditGroupModalProps) {
    const { user, userData } = useAuthContext();
    const [name, setName] = useState("");
    const [members, setMembers] = useState<UserData[]>([]);
    const [admins, setAdmins] = useState<string[]>([]);

    // Search State
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<UserData[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && groupData) {
            setName(groupData.name);
            setAdmins(groupData.adminIds || []);
            fetchMembers(groupData.members || []);
            setSearchTerm("");
            setSearchResults([]);
            setError(null);
        }
    }, [isOpen, groupData]);

    const fetchMembers = async (memberIds: string[]) => {
        if (!memberIds.length) {
            setMembers([]);
            return;
        }

        setIsLoadingMembers(true);
        try {
            // Chunking if necessary, similar to CreateMatchModal
            const users: UserData[] = [];
            const chunkSize = 10;

            for (let i = 0; i < memberIds.length; i += chunkSize) {
                const chunk = memberIds.slice(i, i + chunkSize);
                if (chunk.length > 0) {
                    const q = query(collection(db, "users"), where("uid", "in", chunk)); // Assuming 'uid' is the field, or documentId()
                    // Correction: usually auth UID is document ID in 'users' collection
                    // Checking previous code: doc(db, "users", currentUser.uid) -> Document ID IS UID.
                    // So query should be where(documentId(), 'in', chunk)
                    const qDoc = query(collection(db, "users"), where("__name__", "in", chunk));
                    const snapshot = await getDocs(qDoc);
                    snapshot.forEach(doc => {
                        users.push({ id: doc.id, ...doc.data() } as UserData);
                    });
                }
            }
            setMembers(users);
        } catch (err) {
            console.error("Error cargando miembros:", err);
            setError("Error al cargar los miembros del grupo.");
        } finally {
            setIsLoadingMembers(false);
        }
    };

    const handleSearchUsers = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 3) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            // Simple search by display name (case sensitive usually in Firestore, requires better search for production)
            // For MVP: We fetch loose matches or maybe just rely on exact? 
            // Firestore simple search:
            const q = query(
                collection(db, "users"),
                where("displayName", ">=", term),
                where("displayName", "<=", term + '\uf8ff')
            );
            const snapshot = await getDocs(q);
            const results = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as UserData))
                .filter(u => !groupData?.members?.includes(u.id)); // Exclude existing members
            setSearchResults(results);
        } catch (err) {
            console.error("Error buscando usuarios:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const addMember = async (newMember: UserData) => {
        if (!groupData) return;
        try {
            const groupRef = doc(db, "groups", groupData.id);
            await updateDoc(groupRef, {
                members: arrayUnion(newMember.id)
            });
            setMembers(prev => [...prev, newMember]);
            setSearchResults([]);
            setSearchTerm("");
            onUpdate();
        } catch (err) {
            console.error("Error añadiendo miembro:", err);
            setError("No se pudo añadir al miembro.");
        }
    };

    const removeMember = async (memberId: string) => {
        if (!groupData) return;
        // Prevent removing self if I am the only admin, OR if I am a Superadmin (logic constraint from user)
        // Actually, logic challenge: If I am superadmin, I shouldn't leave the group? Or I shouldn't lose admin status?
        // User request: "el superadmin no se puede quitar el admin de los grupos" -> Should not toggle self-admin off.
        // This is 'removeMember' function (leaving group entirely).
        if (memberId === user?.uid) {
            // You generally shouldn't delete yourself via this modal unless specialized logic exists.
            // But specifically for Admins/Superadmins:
            if (admins.includes(memberId) && admins.length === 1) {
                setError("No puedes salirte del grupo si eres el único administrador.");
                return;
            }
        }

        try {
            const groupRef = doc(db, "groups", groupData.id);
            await updateDoc(groupRef, {
                members: arrayRemove(memberId),
                adminIds: arrayRemove(memberId) // Also remove metadata if they were admin
            });
            setMembers(prev => prev.filter(m => m.id !== memberId));
            setAdmins(prev => prev.filter(id => id !== memberId));
            onUpdate();
        } catch (err) {
            console.error("Error eliminando miembro:", err);
            setError("No se pudo eliminar al miembro.");
        }
    };

    const toggleAdmin = async (memberId: string) => {
        if (!groupData) return;
        const isAdmin = admins.includes(memberId);

        // Prevent self-demotion if only admin OR if Superadmin requirement
        if (memberId === user?.uid) {
            if (admins.length === 1 && isAdmin) {
                setError("No puedes dejar de ser administrador si eres el único.");
                return;
            }
            if (userData?.role === 'superadmin') {
                setError("El Superadmin no puede dejar de ser administrador.");
                return;
            }
        }

        try {
            const groupRef = doc(db, "groups", groupData.id);
            await updateDoc(groupRef, {
                adminIds: isAdmin ? arrayRemove(memberId) : arrayUnion(memberId)
            });
            setAdmins(prev => isAdmin ? prev.filter(id => id !== memberId) : [...prev, memberId]);
            onUpdate();
        } catch (err) {
            console.error("Error cambiando permisos:", err);
            setError("No se pudo actualizar los permisos.");
        }
    };

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupData || !name.trim()) return;
        setIsLoading(true);
        try {
            await updateDoc(doc(db, "groups", groupData.id), {
                name: name.trim()
            });
            onUpdate();
            onClose(); // Optional: close or stay open
        } catch (err) {
            console.error("Error actualizando nombre:", err);
            setError("No se pudo actualizar el nombre.");
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl transform transition-all my-8 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-800 shrink-0">
                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-500" />
                        Gestionar Grupo
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    {/* Rename Section */}
                    <form onSubmit={handleUpdateName} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Nombre del Grupo</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={isLoading || name === groupData?.name}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Add Member Section */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Añadir Miembros</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => handleSearchUsers(e.target.value)}
                                placeholder="Buscar por nombre (min 3 letras)..."
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        {/* Search Results Dropdown */}
                        {searchTerm.length >= 3 && (
                            <div className="bg-gray-950 border border-gray-800 rounded-lg mt-2 max-h-40 overflow-y-auto">
                                {isSearching ? (
                                    <div className="p-3 text-center text-gray-500 text-sm">Buscando...</div>
                                ) : searchResults.length === 0 ? (
                                    <div className="p-3 text-center text-gray-500 text-sm">No se encontraron usuarios.</div>
                                ) : (
                                    searchResults.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => addMember(u)}
                                            className="w-full text-left p-3 hover:bg-gray-800 flex items-center gap-3 transition-colors"
                                        >
                                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                                                {u.displayName?.slice(0, 2).toUpperCase()}
                                            </div>
                                            <span className="text-sm text-gray-300">{u.displayName}</span>
                                            <UserPlus className="w-4 h-4 ml-auto text-blue-500" />
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Members List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">Miembros ({members.length})</label>
                        </div>

                        {isLoadingMembers ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                        ) : MembersList(members, admins, user?.uid, toggleAdmin, removeMember)}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MembersList(
    members: UserData[],
    admins: string[],
    currentUserId: string | undefined,
    onToggleAdmin: (id: string) => void,
    onRemove: (id: string) => void
) {
    if (members.length === 0) {
        return <p className="text-gray-500 text-sm text-center py-4">Este grupo aún no tiene miembros.</p>;
    }

    return (
        <div className="space-y-2">
            {members.map(member => {
                const isAdmin = admins.includes(member.id);
                const isMe = member.id === currentUserId;

                return (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-950/50 rounded-lg border border-gray-800/50">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isAdmin ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
                                {member.displayName?.slice(0, 2).toUpperCase() || "??"}
                            </div>
                            <div>
                                <p className={`text-sm font-medium ${isAdmin ? 'text-blue-400' : 'text-gray-300'}`}>
                                    {member.displayName || "Usuario"} {isMe && "(Tú)"}
                                </p>
                                <p className="text-xs text-gray-600">{member.email}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Admin Toggle */}
                            <button
                                onClick={() => onToggleAdmin(member.id)}
                                title={isAdmin ? "Quitar Admin" : "Hacer Admin"}
                                className={`p-2 rounded-lg transition-colors ${isAdmin ? 'text-blue-400 hover:bg-blue-500/10' : 'text-gray-600 hover:text-blue-400 hover:bg-gray-800'}`}
                            >
                                {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                            </button>

                            {/* Remove Member */}
                            <button
                                onClick={() => onRemove(member.id)}
                                title="Eliminar del grupo"
                                className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
