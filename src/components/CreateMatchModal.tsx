'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, MapPin, DollarSign, AlertCircle } from 'lucide-react';
import { collection, addDoc, getDocs, Timestamp, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { AppUserCustomData } from '@/types/user';
import { MatchStats } from '@/types/business';

interface CreateMatchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface PlayerSelection extends AppUserCustomData {
    uid: string;
}

export default function CreateMatchModal({ isOpen, onClose }: CreateMatchModalProps) {
    const { user } = useAuth();

    // Form State
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [date, setDate] = useState('');
    const [location, setLocation] = useState('');
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]); // Array of UIDs
    const [guestName, setGuestName] = useState('');
    const [guests, setGuests] = useState<string[]>([]); // Array of guest names

    // Data State
    const [myGroups, setMyGroups] = useState<{ id: string, name: string }[]>([]);
    const [availablePlayers, setAvailablePlayers] = useState<PlayerSelection[]>([]);
    const [debts, setDebts] = useState<Record<string, boolean>>({}); // uid -> hasDebt

    // UI State
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showDebtConfirm, setShowDebtConfirm] = useState(false);

    // Fetch User's Groups
    useEffect(() => {
        const fetchGroups = async () => {
            if (!user?.uid) return;
            try {
                const q = query(collection(db, 'groups'), where('adminIds', 'array-contains', user.uid));
                const snapshot = await getDocs(q);
                const groups = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
                setMyGroups(groups);
            } catch (e) {
                console.error("Error fetching groups", e);
            }
        };
        if (isOpen) fetchGroups();
    }, [isOpen, user]);

    // Fetch available players (All users for now)
    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                const q = query(collection(db, 'users'));
                const snapshot = await getDocs(q);
                const players: PlayerSelection[] = [];
                snapshot.forEach(doc => {
                    players.push({ uid: doc.id, ...doc.data() as AppUserCustomData });
                });
                setAvailablePlayers(players);
            } catch (e) {
                console.error("Error fetching players", e);
            }
        };
        if (isOpen) fetchPlayers();
    }, [isOpen]);

    // DEBT VALIDATION LOGIC
    useEffect(() => {
        const validateDebts = async () => {
            if (selectedPlayers.length === 0) {
                setDebts({});
                return;
            }

            setValidating(true);
            const newDebts: Record<string, boolean> = {};

            try {
                // Check debts for selected players
                // Note: 'in' query supports max 10. We chunk it or just do one big query for all pending stats and filter in memory if needed.
                // For this implementation, we'll iterate or use 'in' chunks. For simplicity with small lists:
                const statsRef = collection(db, 'match_stats');
                // We'll just fetch ALL pending stats for these players. 
                // A better approach for scalability is querying where playerId == X and status == PENDING for each, or batched.
                // Let's use the 'in' query for the first 10 for demonstration, but for "PRO" robustness let's just do individual promises or a better query structure.

                // Let's optimize: Get all pending stats in the system (or filtered by context) might be too much.
                // We will perform a query for each selected player (parallelized) - reasonable for < 20 players.
                const debtPromises = selectedPlayers.map(async (uid) => {
                    const q = query(statsRef, where('playerId', '==', uid), where('paymentStatus', '==', 'PENDING'));
                    const snap = await getDocs(q);
                    return { uid, hasDebt: !snap.empty };
                });

                const results = await Promise.all(debtPromises);
                results.forEach(r => {
                    if (r.hasDebt) newDebts[r.uid] = true;
                });

                setDebts(newDebts);
            } catch (e) {
                console.error("Error validating debts", e);
            } finally {
                setValidating(false);
            }
        };

        const debounce = setTimeout(validateDebts, 500);
        return () => clearTimeout(debounce);
    }, [selectedPlayers]);

    // Cleanup when closing
    useEffect(() => {
        if (!isOpen) {
            setGuests([]);
            setSelectedPlayers([]);
            setGuestName('');
            setError('');
            setSuccess('');
            setShowDebtConfirm(false);
            setSelectedGroupId('');
        }
    }, [isOpen]);

    const togglePlayer = (uid: string) => {
        setSelectedPlayers(prev =>
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
        setShowDebtConfirm(false); // Reset confirmation if selection changes
    };

    const addGuest = () => {
        if (!guestName.trim()) return;
        setGuests([...guests, guestName.trim()]);
        setGuestName('');
    };

    const removeGuest = (index: number) => {
        setGuests(guests.filter((_, i) => i !== index));
    };

    const handleInitialSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!selectedGroupId) {
            setError("Debes seleccionar un grupo.");
            return;
        }
        if (!date) {
            setError("Debes seleccionar una fecha.");
            return;
        }
        if (selectedPlayers.length === 0 && guests.length === 0) {
            setError("Selecciona al menos un jugador o invitado.");
            return;
        }

        // Check debts
        const hasDebts = selectedPlayers.some(uid => debts[uid]);
        if (hasDebts && !showDebtConfirm) {
            setShowDebtConfirm(true); // Show confirmation "screen" or state
            return;
        }

        // Proceed to save
        saveMatch();
    };

    const saveMatch = async () => {
        setLoading(true);
        setError('');

        try {
            // 1. Create Match
            const matchRef = await addDoc(collection(db, 'matches'), {
                groupId: selectedGroupId,
                date: date ? Timestamp.fromDate(new Date(date)) : Timestamp.now(),
                location,
                status: 'SCHEDULED',
                createdBy: user?.uid,
                createdAt: Timestamp.now()
            });

            // 2. Create Stats for Regular Players
            const playerPromises = selectedPlayers.map(uid =>
                addDoc(collection(db, 'match_stats'), {
                    matchId: matchRef.id,
                    playerId: uid,
                    playerName: availablePlayers.find(p => p.uid === uid)?.displayName || 'Unknown',
                    goals: 0,
                    assists: 0,
                    isMvp: false,
                    paymentStatus: 'PENDING',
                    matchDate: date ? Timestamp.fromDate(new Date(date)) : Timestamp.now()
                })
            );

            // 3. Create Stats for Guests
            const guestPromises = guests.map(gName =>
                addDoc(collection(db, 'match_stats'), {
                    matchId: matchRef.id,
                    playerId: null, // No UID for guests
                    playerName: `${gName} (Invitado)`,
                    goals: 0,
                    assists: 0,
                    isMvp: false,
                    paymentStatus: 'PENDING',
                    matchDate: date ? Timestamp.fromDate(new Date(date)) : Timestamp.now()
                })
            );

            await Promise.all([...playerPromises, ...guestPromises]);

            setSuccess('Partido creado exitosamente');
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl shadow-2xl my-8">
                <div className="flex justify-between items-center p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">Nuevo Partido</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleInitialSubmit} className="p-6 space-y-6">
                    {/* Status Messages */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Atención</p>
                                <p className="text-sm">{error}</p>
                            </div>
                        </div>
                    )}
                    {success && <div className="bg-green-500/10 text-green-500 p-3 rounded text-sm border border-green-500/20">{success}</div>}

                    {/* Step 1: Group & Basics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Grupo</label>
                            <select
                                value={selectedGroupId}
                                onChange={(e) => setSelectedGroupId(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500 transition-colors"
                            >
                                <option value="">Selecciona un grupo...</option>
                                {myGroups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Fecha y Hora</label>
                            <div className="relative">
                                <input
                                    type="datetime-local"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500 transition-colors pl-10"
                                />
                                <Calendar className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Ubicación</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    placeholder="Ej: Canchas del Centro"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500 transition-colors pl-10"
                                />
                                <MapPin className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Players & Guests */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Seleccionar Jugadores</label>

                        {/* Guest input */}
                        <div className="flex gap-2 mb-3">
                            <input
                                type="text"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                placeholder="Nombre de invitado..."
                                className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white text-sm"
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGuest())}
                            />
                            <button
                                type="button"
                                onClick={addGuest}
                                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                            >
                                + Invitado
                            </button>
                        </div>

                        {/* Guest List */}
                        {guests.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {guests.map((g, i) => (
                                    <span key={i} className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-2 py-1 rounded text-xs flex items-center gap-1">
                                        {g}
                                        <button type="button" onClick={() => removeGuest(i)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* DB Players List */}
                        <div className="bg-gray-950 border border-gray-800 rounded-lg p-2 max-h-60 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {availablePlayers.map(player => {
                                const isSelected = selectedPlayers.includes(player.uid);
                                const hasDebt = debts[player.uid];

                                return (
                                    <div
                                        key={player.uid}
                                        onClick={() => togglePlayer(player.uid)}
                                        className={`
                                cursor-pointer p-2 rounded-lg border flex justify-between items-center transition-all
                                ${isSelected
                                                ? (hasDebt ? 'bg-red-500/10 border-red-500/50' : 'bg-green-500/10 border-green-500/50')
                                                : 'bg-gray-900 border-gray-800 hover:border-gray-700'}
                            `}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                                                {player.displayName?.charAt(0) || '?'}
                                            </div>
                                            <div className="truncate">
                                                <p className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                                    {player.displayName}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate">{player.email}</p>
                                            </div>
                                        </div>

                                        {hasDebt && (
                                            <div className="flex items-center text-red-500 text-xs font-bold" title="Deuda Pendiente">
                                                <DollarSign className="w-4 h-4" />
                                                <span>!</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            {(selectedPlayers.length + guests.length)} jugadores. <span className="text-red-500 italic">Los jugadores con icono de dólar ('$') tienen deudas.</span>
                        </p>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex flex-col gap-3 pt-4 border-t border-gray-800">
                        {showDebtConfirm && (
                            <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-center animate-pulse">
                                <p className="text-red-400 font-bold text-sm mb-2">⚠ Hay jugadores con deudas pendientes</p>
                                <p className="text-red-300/80 text-xs mb-3">¿Estás seguro de que deseas permitirles jugar?</p>
                                <div className="flex justify-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowDebtConfirm(false)}
                                        className="px-3 py-1 bg-gray-800 text-white text-xs rounded hover:bg-gray-700"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveMatch}
                                        className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-500"
                                    >
                                        Confirmar y Crear
                                    </button>
                                </div>
                            </div>
                        )}

                        {!showDebtConfirm && (
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors mr-3"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || validating}
                                    className="px-6 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white font-medium rounded-lg hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Creando...' : 'Programar Partido'}
                                </button>
                            </div>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
