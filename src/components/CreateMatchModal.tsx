"use client";

import { useState, useEffect } from "react";
import { X, Calendar, Euro, Users, AlertTriangle, Loader2, Trophy, Shield, UserPlus } from "lucide-react";
import { addDoc, collection, serverTimestamp, getDocs, query, where, writeBatch, doc, documentId, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthContext } from "@/context/AuthContext";
import { createGuestUser } from "@/lib/users";

interface UserData {
    id: string;
    displayName: string;
    email: string;
    photoURL?: string;
    debt?: number;
    manualDebt?: number;
    role?: string;
}

interface GroupData {
    id: string;
    name: string;
    members?: string[];
    adminIds?: string[];
}

interface GuestUser {
    id: string;
    displayName: string;
    isGuest: true;
}

interface CreateMatchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const GAME_FORMATS = ["5vs5", "6vs6", "7vs7", "8vs8", "9vs9", "10vs10", "11vs11"];

const FORMAT_REQUIREMENTS: Record<string, number> = {
    "5vs5": 10,
    "6vs6": 12,
    "7vs7": 14,
    "8vs8": 16,
    "9vs9": 18,
    "10vs10": 20,
    "11vs11": 22
};

export default function CreateMatchModal({ isOpen, onClose }: CreateMatchModalProps) {
    const { user, userData } = useAuthContext();

    // Form State
    const [selectedGroupId, setSelectedGroupId] = useState("");
    const [format, setFormat] = useState("7vs7");
    const [date, setDate] = useState("");
    const [price, setPrice] = useState("");
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [guests, setGuests] = useState<GuestUser[]>([]); // Deprecated/Legacy ad-hoc guests if needed, but we focus on User-Guests now
    const [guestNameInput, setGuestNameInput] = useState("");
    const [isCreatingGuest, setIsCreatingGuest] = useState(false);
    const [showGuestInput, setShowGuestInput] = useState(false);

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
            setSelectedUserIds([]);
            setGuests([]);

            try {
                const group = myGroups.find(g => g.id === selectedGroupId);
                if (!group) return;

                let membersToFetch = new Set([...(group.members || []), ...(group.adminIds || [])]);
                const memberList = Array.from(membersToFetch);

                if (memberList.length === 0) {
                    setAvailableUsers([]);
                    setIsFetchingUsers(false);
                    return;
                }

                const users: UserData[] = [];
                const chunkSize = 10;

                for (let i = 0; i < memberList.length; i += chunkSize) {
                    const chunk = memberList.slice(i, i + chunkSize);
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
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleQuickGuest = async () => {
        if (!guestNameInput.trim()) return;

        setIsCreatingGuest(true);
        try {
            const name = guestNameInput.trim();
            // 1. Create in Firestore via Utility
            // Pass selectedGroupId to link this guest to the current group context
            const newGuestData = await createGuestUser(name, 0, selectedGroupId ? [selectedGroupId] : []);

            // 2. Add to Local State
            const newGuestUser: UserData = {
                id: newGuestData.id,
                displayName: newGuestData.displayName || name,
                email: newGuestData.email || "",
                photoURL: newGuestData.photoURL || undefined,
                debt: 0,
                manualDebt: 0,
                role: 'guest'
            };

            setAvailableUsers(prev => [newGuestUser, ...prev]);

            // 3. Auto-Select
            setSelectedUserIds(prev => [...prev, newGuestUser.id]);

            // 4. Reset & Feedback
            setGuestNameInput("");


        } catch (error) {
            console.error("Error creating quick guest:", error);
            setError("Error al crear al invitado.");
        } finally {
            setIsCreatingGuest(false);
            setShowGuestInput(false); // Hide input after creation
        }
    };

    const removeGuest = (guestId: string) => {
        setGuests(prev => prev.filter(g => g.id !== guestId));
    };

    const hasSelectedDebtors = selectedUserIds.some(id => usersWithDebt.has(id));
    const totalSelected = selectedUserIds.length + guests.length;
    const requiredPlayers = FORMAT_REQUIREMENTS[format] || 0;
    const isPlayerCountValid = totalSelected === requiredPlayers;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !price || !isPlayerCountValid || !user || !selectedGroupId) return;

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
                playerCount: totalSelected,
            });

            // 2. Create Match Stats
            const batch = writeBatch(db);
            let autoPaidCount = 0;

            // Regular Users
            selectedUserIds.forEach(userId => {
                const statsRef = doc(collection(db, "match_stats"));

                // Lógica de Cobro Automático (Smart Pay)
                const userObj = availableUsers.find(u => u.id === userId);
                const currentDebt = userObj?.debt ?? 0; // Si es negativo, es SALDO A FAVOR
                const priceNum = Number(price);

                // Si tiene suficiente crédito (ej: debt es -10 y el precio es 5. -10 <= -5 es TRUE)
                const canPayWithCredit = currentDebt <= -priceNum;

                if (canPayWithCredit) {
                    // 1. Marcar partido como PAGADO
                    batch.set(statsRef, {
                        matchId: matchRef.id,
                        userId: userId,
                        paymentStatus: "PAID", // Auto-pagado
                        goals: 0,
                        assists: 0,
                        team: "PENDING",
                        createdAt: serverTimestamp(),
                    });

                    // 2. Descontar del saldo (Incrementar deuda negativa acerca a cero)
                    // Ej: Deuda -10. Increment(5) -> -5.
                    const userRef = doc(db, "users", userId);
                    batch.update(userRef, {
                        debt: increment(priceNum),
                        manualDebt: increment(priceNum)
                    });

                    autoPaidCount++;
                } else {
                    // Comportamiento normal (Pendiente)
                    batch.set(statsRef, {
                        matchId: matchRef.id,
                        userId: userId,
                        paymentStatus: "PENDING",
                        goals: 0,
                        assists: 0,
                        team: "PENDING",
                        createdAt: serverTimestamp(),
                    });
                }
            });

            if (autoPaidCount > 0) {

            }

            // Guests (Legacy ad-hoc support, usually empty now)
            guests.forEach(guest => {
                const statsRef = doc(collection(db, "match_stats"));
                batch.set(statsRef, {
                    matchId: matchRef.id,
                    userId: guest.id,
                    displayName: guest.displayName,
                    isGuest: true,
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
            setSelectedUserIds([]);
            setGuests([]);
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
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-[95vw] max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl transform transition-all my-8 flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-green-500" />
                        Nuevo Partido
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
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
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-blue-400" />
                                    Grupo
                                </label>
                                {isFetchingGroups ? (
                                    <div className="h-10 bg-slate-800 rounded animate-pulse" />
                                ) : (
                                    <select
                                        value={selectedGroupId}
                                        onChange={(e) => setSelectedGroupId(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
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
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                    <Trophy className="w-4 h-4 text-yellow-500" />
                                    Formato ({requiredPlayers} jugadores)
                                </label>
                                <select
                                    value={format}
                                    onChange={(e) => setFormat(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                                >
                                    {GAME_FORMATS.map(f => (
                                        <option key={f} value={f}>{f} ({FORMAT_REQUIREMENTS[f]} jugadores)</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Fecha y Hora</label>
                                <input
                                    type="datetime-local"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none [color-scheme:dark]"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Precio por Persona</label>
                                <div className="relative">
                                    <Euro className="absolute left-3 top-2.5 w-5 h-5 text-slate-500" />
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Convocatoria
                                </label>
                                <span className={`text-xs font-bold px-2 py-1 rounded ${isPlayerCountValid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {totalSelected} / {requiredPlayers} Jugadores
                                </span>
                            </div>

                            {!showGuestInput ? (
                                <button
                                    type="button"
                                    onClick={() => setShowGuestInput(true)}
                                    className="w-full py-2 bg-slate-950 border border-slate-700 border-dashed rounded-lg text-slate-400 hover:text-white hover:border-slate-600 transition-colors flex items-center justify-center gap-2 text-sm"
                                >
                                    <UserPlus className="w-4 h-4" />
                                    Nuevo Invitado
                                </button>
                            ) : (
                                <div className="flex gap-2 mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="relative flex-1">
                                        <UserPlus className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                        <input
                                            type="text"
                                            placeholder="Nombre Invitado..."
                                            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-green-500 outline-none"
                                            value={guestNameInput}
                                            onChange={e => setGuestNameInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleQuickGuest())}
                                            disabled={isCreatingGuest}
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleQuickGuest}
                                        disabled={!guestNameInput.trim() || isCreatingGuest}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        {isCreatingGuest ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                        <span className="hidden sm:inline">Crear</span>
                                        <span className="sm:hidden">Crear</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowGuestInput(false)}
                                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg"
                                        disabled={isCreatingGuest}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {!selectedGroupId ? (
                                <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-slate-500">
                                    <Shield className="w-8 h-8 mb-2 opacity-20" />
                                    <p className="text-sm">Selecciona un grupo primero</p>
                                </div>
                            ) : isFetchingUsers ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                                </div>
                            ) : availableUsers.length === 0 ? (
                                <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-lg p-8 text-center text-slate-500 text-sm">
                                    No se encontraron jugadores en este grupo.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                                    {/* Guests List */}
                                    {guests.map(guest => (
                                        <div
                                            key={guest.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 select-none"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-amber-900/40 text-amber-500 border border-amber-500/20">
                                                    IN
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-amber-100">
                                                        {guest.displayName}
                                                    </span>
                                                    <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                                                        Invitado
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeGuest(guest.id)}
                                                className="text-gray-500 hover:text-red-400 p-1"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Registered Users List */}
                                    {availableUsers.map(user => {
                                        const isSelected = selectedUserIds.includes(user.id);
                                        const hasDebt = usersWithDebt.has(user.id);
                                        const isGuestUser = user.role === 'guest' || user.id.startsWith('guest_');

                                        return (
                                            <div
                                                key={user.id}
                                                onClick={() => toggleUser(user.id)}
                                                className={`
                                                    flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all select-none
                                                    ${isSelected
                                                        ? 'bg-green-500/10 border-green-500/50'
                                                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-green-500 text-black' : 'bg-slate-800 text-slate-400'}`}>
                                                        {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "??"}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={`text-sm font-medium ${isSelected ? 'text-green-400' : 'text-slate-300'}`}>
                                                            {user.displayName || "Usuario Desconocido"}
                                                            {isGuestUser && <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/30">INVITADO</span>}
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

                    <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !isPlayerCountValid || !selectedGroupId}
                            className={`
                px-6 py-2 text-sm font-bold text-white rounded-lg shadow-lg transition-all flex items-center gap-2
                ${hasSelectedDebtors
                                    ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20'
                                    : 'bg-green-600 hover:bg-green-500 shadow-green-500/20'
                                }
                ${(isLoading || !isPlayerCountValid || !selectedGroupId) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {!isPlayerCountValid
                                ? `Faltan ${Math.abs(requiredPlayers - totalSelected)}`
                                : hasSelectedDebtors ? 'Confirmar (con Deudas)' : 'Crear Partido'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
