"use client";

import { useState, useEffect } from "react";
import { X, Calendar, MapPin, Users, Trophy, Shield, Lock, AlertTriangle, Loader2, CheckCircle2, Clock } from "lucide-react";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthContext } from "@/context/AuthContext";
import { Match, MatchStats } from "@/types/business";
import { MatchService } from "@/services/MatchService";
import { toast } from "sonner"; // Assuming toast is available or use standard alert

interface MatchDetailModalProps {
    matchId: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function MatchDetailModal({ matchId, isOpen, onClose }: MatchDetailModalProps) {
    const { user, userData } = useAuthContext();
    const [match, setMatch] = useState<Match | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Stats Form State
    const [homeScore, setHomeScore] = useState(0);
    const [awayScore, setAwayScore] = useState(0);
    const [mvpId, setMvpId] = useState("");
    const [chronicle, setChronicle] = useState("");

    useEffect(() => {
        if (!isOpen || !matchId) return;

        setLoading(true);
        const unsubscribe = onSnapshot(doc(db, "matches", matchId), (doc) => {
            if (doc.exists()) {
                const data = { id: doc.id, ...doc.data() } as Match;
                setMatch(data);
                // Pre-fill stats if they exist
                if (data.stats) {
                    setHomeScore(data.stats.homeScore || 0);
                    setAwayScore(data.stats.awayScore || 0);
                    setMvpId(data.stats.mvpId || "");
                    setChronicle(data.stats.chronicle || "");
                }
            } else {
                onClose(); // Match deleted?
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [matchId, isOpen]);

    if (!isOpen) return null;

    const isSquad = user && match?.players?.includes(user.uid);
    const isWaitlist = user && match?.waitlist?.includes(user.uid);
    const isFull = match && (match.players?.length || 0) >= (match.maxPlayers || 0);
    const isAdmin = userData?.role === 'superadmin' || (userData?.role === 'admin' && match?.groupId && userData?.adminCallbackGroupId === match.groupId); // Simplified admin check needed? Or reuse logic

    const handleJoin = async () => {
        if (!user || !match) return;
        setActionLoading(true);
        try {
            const result = await MatchService.joinMatch(match.id!, user.uid);
            // Toast success
            if (result.status === 'ADDED_TO_WAITLIST') {
                toast.warning("Lista de espera", { description: "El partido está lleno. Estás en lista de espera." });
            } else {
                toast.success("Inscrito", { description: "Te has unido al partido correctamente." });
            }
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setActionLoading(false);
        }
    };

    const handleLeave = async () => {
        if (!user || !match) return;
        if (!confirm("¿Seguro que quieres borrarte? Si hay lista de espera, tu plaza será ocupada inmediatamente.")) return;

        setActionLoading(true);
        try {
            await MatchService.leaveMatch(match.id!, user.uid);
            toast.success("Desapuntado", { description: "Has salido del partido." });
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setActionLoading(false);
        }
    };

    const handleCloseMatch = async () => {
        if (!match) return;
        setActionLoading(true);
        try {
            await MatchService.closeMatch(match.id!, {
                homeScore,
                awayScore,
                mvpId,
                chronicle
            });
            toast.success("Acta Cerrada", { description: "El partido ha sido finalizado." });
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            {match?.isLocked ? <Lock className="w-6 h-6 text-red-500" /> : <Calendar className="w-6 h-6 text-green-500" />}
                            Partido {match?.format || 'Futbol'}
                        </h2>
                        <p className="text-slate-400 mt-1 flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4" />
                            {match?.date instanceof Object ? match.date.toDate().toLocaleString() : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {loading ? (
                        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-green-500" /></div>
                    ) : match ? (
                        <>
                            {/* STATUS BANNER */}
                            {match.isLocked ? (
                                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center space-y-4">
                                    <div className="flex justify-center items-center gap-8 text-4xl font-bold font-mono text-white">
                                        <span>{match.stats?.homeScore || 0}</span>
                                        <span className="text-slate-600">-</span>
                                        <span>{match.stats?.awayScore || 0}</span>
                                    </div>
                                    <div className="text-center">
                                        <span className="inline-block px-3 py-1 bg-red-500/10 text-red-400 text-xs font-bold rounded-full border border-red-500/20">
                                            PARTIDO FINALIZADO
                                        </span>
                                    </div>
                                    {match.stats?.mvpId && (
                                        <div className="flex items-center justify-center gap-2 text-yellow-500 font-bold">
                                            <Trophy className="w-5 h-5" />
                                            <span>MVP: {match.stats.mvpId}</span>
                                        </div>
                                    )}
                                    {match.stats?.chronicle && (
                                        <p className="text-slate-400 text-sm italic max-w-lg mx-auto">
                                            "{match.stats.chronicle}"
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* SQUAD LIST */}
                                    <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-4">
                                        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center justify-between">
                                            <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Convocatoria</span>
                                            <span className={`${isFull ? 'text-red-400' : 'text-green-400'}`}>
                                                {match.players?.length || 0} / {match.maxPlayers}
                                            </span>
                                        </h3>
                                        <div className="space-y-2">
                                            {match.players?.map((playerId, idx) => (
                                                <div key={playerId} className="flex items-center gap-3 p-2 bg-slate-900 rounded border border-slate-800">
                                                    <div className="w-6 h-6 rounded-full bg-green-900/50 text-green-500 flex items-center justify-center text-xs font-bold border border-green-500/30">
                                                        {idx + 1}
                                                    </div>
                                                    <span className="text-sm text-slate-200 truncate flex-1">
                                                        {/* Fetch displayName logic needed or pass simplified list? Ideally backend/service resolved names or fetch separately. For now just ID if simple or need to fetch users.*/}
                                                        {/* We need User Display Names here. match.players is just IDs. 
                                                            We should probably fetch user details or have a cache. 
                                                            For now, just showing ID is bad. 
                                                            Assume we need to fetch 'users' collection where ID in match.players.
                                                        */}
                                                        User {playerId.slice(0, 5)}...
                                                    </span>
                                                </div>
                                            ))}
                                            {(match.players?.length || 0) === 0 && (
                                                <p className="text-slate-500 text-xs text-center py-4">Sin jugadores aún</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* WAITLIST */}
                                    <div className="bg-slate-950/50 rounded-xl border border-slate-800 p-4">
                                        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-orange-500" />
                                            Lista de Espera
                                            {match.waitlist?.length > 0 && <span className="bg-orange-500/20 text-orange-500 px-1.5 rounded text-xs">{match.waitlist.length}</span>}
                                        </h3>
                                        <div className="space-y-2">
                                            {match.waitlist?.map((playerId, idx) => (
                                                <div key={playerId} className="flex items-center gap-3 p-2 bg-slate-900 rounded border border-orange-900/30">
                                                    <span className="text-orange-500 text-xs font-bold">#{idx + 1}</span>
                                                    <span className="text-sm text-slate-400 truncate">
                                                        User {playerId.slice(0, 5)}...
                                                    </span>
                                                </div>
                                            ))}
                                            {(match.waitlist?.length || 0) === 0 && (
                                                <p className="text-slate-500 text-xs text-center py-4">Lista vacía</p>
                                            )}
                                        </div>

                                        {/* JOIN CONTROLS */}
                                        <div className="mt-6 space-y-2">
                                            {isSquad ? (
                                                <button
                                                    onClick={handleLeave}
                                                    disabled={actionLoading}
                                                    className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                                                >
                                                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                                    Borrarme del Partido
                                                </button>
                                            ) : isWaitlist ? (
                                                <button
                                                    onClick={handleLeave}
                                                    disabled={actionLoading}
                                                    className="w-full py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-500 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                                                >
                                                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                                    Salir de Lista de Espera
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={handleJoin}
                                                    disabled={match.type === 'closed' || actionLoading}
                                                    className={`w-full py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2
                                                        ${match.type === 'closed'
                                                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                                            : isFull
                                                                ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                                                : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20'
                                                        }`}
                                                >
                                                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isFull ? <Clock className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                                    {match.type === 'closed'
                                                        ? 'Partido Cerrado (Solo Invitación)'
                                                        : isFull
                                                            ? 'Unirse a Lista de Espera'
                                                            : 'Apuntarme al Partido'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ADMIN STATS PANEL */}
                            {isAdmin && !match.isLocked && (
                                <div className="border-t border-slate-800 pt-6 mt-6">
                                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-blue-500" />
                                        Gestión del Acta (Admin)
                                    </h3>
                                    <div className="bg-slate-950 p-4 rounded-xl space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">Goles Local</label>
                                                <input type="number" value={homeScore} onChange={e => setHomeScore(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white text-center font-mono font-bold" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">Goles Visitante</label>
                                                <input type="number" value={awayScore} onChange={e => setAwayScore(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white text-center font-mono font-bold" />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs text-slate-400 block mb-1">Crónica / Notas</label>
                                            <textarea value={chronicle} onChange={e => setChronicle(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white text-sm h-20" placeholder="Incidencias, resumen..." />
                                        </div>

                                        <button
                                            onClick={handleCloseMatch}
                                            disabled={actionLoading}
                                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                                        >
                                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                            Cerrar Acta y Finalizar
                                        </button>
                                    </div>
                                </div>
                            )}

                        </>
                    ) : (
                        <div className="text-center text-red-400">Error al cargar partido</div>
                    )}
                </div>
            </div>
        </div>
    );
}
