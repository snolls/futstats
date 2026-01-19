"use client";

import { useState, useEffect } from "react";
import { X, Calendar, DollarSign, Users, AlertTriangle, Loader2, Trophy, Shield } from "lucide-react";
import { addDoc, collection, serverTimestamp, getDocs, query, where, writeBatch, doc, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthContext } from "@/context/AuthContext";

interface UserData {
    id: string;
    displayName: string;
    email: string;
    photoURL?: string;
}

interface GroupData {
    id: string;
    name: string;
    members?: string[];
}

interface CreateMatchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const GAME_FORMATS = ["5vs5", "6vs6", "7vs7", "8vs8", "9vs9", "10vs10", "11vs11"];

export default function CreateMatchModal({ isOpen, onClose }: CreateMatchModalProps) {
    const { user, userData } = useAuthContext();

    // Form State
    const [selectedGroupId, setSelectedGroupId] = useState("");
    const [format, setFormat] = useState("7vs7");
    const [date, setDate] = useState("");
    const [price, setPrice] = useState("");
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

    // Data State
    const [myGroups, setMyGroups] = useState<GroupData[]>([]);
    const [availableUsers, setAvailableUsers] = useState<UserData[]>([]);
    const [usersWithDebt, setUsersWithDebt] = useState<Set<string>>(new Set());

    // UI State
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingGroups, setIsFetchingGroups] = useState(false);
    const [isFetchingUsers, setIsFetchingUsers] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 1. Fetch Permitted Groups on Mount
    useEffect(() => {
        if (isOpen && user && userData) {
            const fetchGroups = async () => {
                setIsFetchingGroups(true);
                setError(null);
                try {
                    let q;
                    if (userData.role === 'superadmin') {
                        q = query(collection(db, "groups"));
                    } else {
                        q = query(collection(db, "groups"), where("adminIds", "array-contains", user.uid));
                    }

                    const snapshot = await getDocs(q);
                    const groups = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as GroupData[];

                    setMyGroups(groups);

                    if (groups.length === 1) {
                        setSelectedGroupId(groups[0].id);
                    }
                } catch (err) {
                    console.error("Error fetching groups:", err);
                    setError("Error al cargar tus grupos.");
                } finally {
                    setIsFetchingGroups(false);
                }
            };

            fetchGroups();
        }
    }, [isOpen, user, userData]);

    // 2. Fetch Users when Group Changes
    useEffect(() => {
        if (!selectedGroupId || !isOpen) {
            setAvailableUsers([]);
            return;
        }

        const fetchGroupMembers = async () => {
            setIsFetchingUsers(true);
            setError(null);
            setSelectedUsers([]);

            try {
                const group = myGroups.find(g => g.id === selectedGroupId);
                if (!group) return;

                let membersToFetch = group.members || [];

                if (membersToFetch.length === 0) {
                    setAvailableUsers([]);
                    setIsFetchingUsers(false);
                    return;
                }

                const users: UserData[] = [];
                const chunkSize = 10;

                for (let i = 0; i < membersToFetch.length; i += chunkSize) {
                    const chunk = membersToFetch.slice(i, i + chunkSize);
                    if (chunk.length > 0) {
                        const q = query(
                            collection(db, "users"),
                            where(documentId(), "in", chunk)
                        );
                        const snapshot = await getDocs(q);
                        snapshot.forEach(doc => {
                            users.push({ id: doc.id, ...doc.data() } as UserData);
                        });
                    }
                }

                setAvailableUsers(users);

                const debts = new Set<string>();

                for (let i = 0; i < users.length; i += chunkSize) {
                    const userChunk = users.slice(i, i + chunkSize);
                    const ids = userChunk.map(u => u.id);

                    if (ids.length > 0) {
                        const debtQ = query(
                            collection(db, "match_stats"),
                            where("paymentStatus", "==", "PENDING"),
                            where("userId", "in", ids)
                        );
                        const debtSnap = await getDocs(debtQ);
                        debtSnap.forEach(doc => {
                            const data = doc.data();
                            if (data.userId) debts.add(data.userId);
                        });
                    }
                }
                setUsersWithDebt(debts);

            } catch (err) {
                console.error("Error fetching group members:", err);
                setError("Error al cargar jugadores para este grupo.");
            } finally {
                setIsFetchingUsers(false);
            }
        };

        fetchGroupMembers();
    }, [selectedGroupId, isOpen, myGroups]);


    const toggleUser = (userId: string) => {
        setSelectedUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const hasSelectedDebtors = selectedUsers.some(id => usersWithDebt.has(id));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !price || selectedUsers.length === 0 || !user || !selectedGroupId) return;

        setIsLoading(true);
        setError(null);

        try {
            const startDateTime = new Date(date);

            // 1. Create Match
            const matchRef = await addDoc(collection(db, "matches"), {
                groupId: selectedGroupId,
                format: format,
                date: startDateTime,
                pricePerPlayer: Number(price),
                createdBy: user.uid,
                status: "SCHEDULED",
                createdAt: serverTimestamp(),
                playerCount: selectedUsers.length,
            });

            // 2. Create Match Stats
            const batch = writeBatch(db);

            selectedUsers.forEach(userId => {
                const statsRef = doc(collection(db, "match_stats"));
                batch.set(statsRef, {
                    matchId: matchRef.id,
                    userId: userId,
                    paymentStatus: "PENDING",
                    goals: 0,
                    assists: 0,
                    team: "PENDING",
                    createdAt: serverTimestamp(),
                });
            });

            await batch.commit();

            setDate("");
            setPrice("");
            setSelectedUsers([]);
            onClose();

        } catch (err) {
            console.error("Error creating match:", err);
            setError("Error al crear el partido. Inténtelo de nuevo.");
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
                        <Calendar className="w-5 h-5 text-green-500" />
                        Nuevo Partido
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
                                {error}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-blue-400" />
                                    Grupo
                                </label>
                                {isFetchingGroups ? (
                                    <div className="h-10 bg-gray-800 rounded animate-pulse" />
                                ) : (
                                    <select
                                        value={selectedGroupId}
                                        onChange={(e) => setSelectedGroupId(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                        required
                                    >
                                        <option value="" disabled>-- Selecciona un Grupo --</option>
                                        {myGroups.map(group => (
                                            <option key={group.id} value={group.id}>{group.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                    <Trophy className="w-4 h-4 text-yellow-500" />
                                    Formato
                                </label>
                                <select
                                    value={format}
                                    onChange={(e) => setFormat(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                                >
                                    {GAME_FORMATS.map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Fecha y Hora</label>
                                <input
                                    type="datetime-local"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none [color-scheme:dark]"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Precio por Persona</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" />
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Seleccionar Jugadores {availableUsers.length > 0 && `(${availableUsers.length} disp.)`}
                                </label>
                                <span className="text-xs text-gray-500">
                                    {selectedUsers.length} seleccionados
                                </span>
                            </div>

                            {!selectedGroupId ? (
                                <div className="bg-gray-900/50 border border-gray-800 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-gray-500">
                                    <Shield className="w-8 h-8 mb-2 opacity-20" />
                                    <p className="text-sm">Selecciona un grupo primero</p>
                                </div>
                            ) : isFetchingUsers ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                                </div>
                            ) : availableUsers.length === 0 ? (
                                <div className="bg-gray-900/50 border border-gray-800 border-dashed rounded-lg p-8 text-center text-gray-500 text-sm">
                                    No se encontraron jugadores en este grupo.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                                    {availableUsers.map(user => {
                                        const isSelected = selectedUsers.includes(user.id);
                                        const hasDebt = usersWithDebt.has(user.id);

                                        return (
                                            <div
                                                key={user.id}
                                                onClick={() => toggleUser(user.id)}
                                                className={`
                          flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all select-none
                          ${isSelected
                                                        ? 'bg-green-500/10 border-green-500/50'
                                                        : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                                                    }
                        `}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-400'}`}>
                                                        {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "??"}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={`text-sm font-medium ${isSelected ? 'text-green-400' : 'text-gray-300'}`}>
                                                            {user.displayName || "Usuario Desconocido"}
                                                        </span>
                                                        {hasDebt && (
                                                            <span className="text-[10px] text-red-400 flex items-center gap-1">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                Pago Pendiente
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {hasDebt && (
                                                    <div className="text-red-500" title="Usuario con pagos pendientes">
                                                        <AlertTriangle className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || selectedUsers.length === 0 || !selectedGroupId}
                            className={`
                px-6 py-2 text-sm font-bold text-white rounded-lg shadow-lg transition-all flex items-center gap-2
                ${hasSelectedDebtors
                                    ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20'
                                    : 'bg-green-600 hover:bg-green-500 shadow-green-500/20'
                                }
                ${(isLoading || selectedUsers.length === 0 || !selectedGroupId) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {hasSelectedDebtors ? 'Confirmar (con Deudas)' : 'Crear Partido'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
