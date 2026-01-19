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
    const [date, setDate] = useState('');
    const [location, setLocation] = useState('');
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]); // Array of UIDs

    // Data State
    const [availablePlayers, setAvailablePlayers] = useState<PlayerSelection[]>([]);
    const [debts, setDebts] = useState<Record<string, boolean>>({}); // uid -> hasDebt
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Fetch available players (Mocking "All Users" for now, ideally strictly group members)
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
            if (selectedPlayers.length === 0) return;

            setValidating(true);
            const newDebts: Record<string, boolean> = {};

            // Optimize: Check only newly selected or check all in one query
            // Query match_stats where paymentStatus == 'PENDING' AND playerId IN selectedPlayers
            try {
                // Firestore 'in' query supports up to 10 items. If > 10, need multiple queries or client-side filtering.
                // For simplicity, we'll fetch pending stats for these players.

                // Chunking for 'in' query limit or just map over promises if list is small enough
                const statsRef = collection(db, 'match_stats');
                const q = query(
                    statsRef,
                    where('paymentStatus', '==', 'PENDING'),
                    where('playerId', 'in', selectedPlayers.slice(0, 10)) // Limit restriction handling needed for prod
                );

                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    const data = doc.data() as MatchStats;
                    newDebts[data.playerId] = true;
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

    const togglePlayer = (uid: string) => {
        setSelectedPlayers(prev =>
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedPlayers.length === 0) {
            setError("Selecciona al menos un jugador");
            return;
        }

        // Block if any debt
        const hasDebts = selectedPlayers.some(uid => debts[uid]);
        if (hasDebts) {
            setError("No se puede crear el partido. Hay jugadores con deudas pendientes.");
            return;
        }

        setLoading(true);
        setError('');

        try {
            // 1. Create Match
            const matchRef = await addDoc(collection(db, 'matches'), {
                date: date ? Timestamp.fromDate(new Date(date)) : Timestamp.now(),
                location,
                status: 'SCHEDULED',
                createdBy: user?.uid,
                createdAt: Timestamp.now()
            });

            // 2. Create Initial Stats/Participation for each player
            const promises = selectedPlayers.map(uid =>
                addDoc(collection(db, 'match_stats'), {
                    matchId: matchRef.id,
                    playerId: uid,
                    goals: 0,
                    assists: 0,
                    isMvp: false,
                    paymentStatus: 'PENDING', // Default to Pending
                    matchDate: date ? Timestamp.fromDate(new Date(date)) : Timestamp.now()
                })
            );

            await Promise.all(promises);

            setSuccess('Partido creado exitosamente');
            setTimeout(() => {
                onClose();
                setSuccess('');
                setSelectedPlayers([]);
                setDebts({});
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

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Error</p>
                                <p className="text-sm">{error}</p>
                            </div>
                        </div>
                    )}
                    {success && <div className="bg-green-500/10 text-green-500 p-3 rounded text-sm border border-green-500/20">{success}</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Seleccionar Jugadores</label>
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
                            {selectedPlayers.length} seleccionados. <span className="text-red-500 italic">Los jugadores con icono de dólar ('$') tienen deudas y bloquean el partido.</span>
                        </p>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors mr-3"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || validating || Object.values(debts).some(d => d)}
                            className="px-6 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white font-medium rounded-lg hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creando...' : 'Programar Partido'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
