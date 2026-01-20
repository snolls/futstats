'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, Wallet, CheckCircle2, History, AlertTriangle, Plus, Minus, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs, doc, updateDoc, increment, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUserCustomData } from '@/types/user';

interface UserDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AppUserCustomData & { id: string; manualDebt?: number };
    onUpdate: () => void; // Trigger refresh in parent
}

interface PendingMatchItem {
    statId: string;
    matchId: string;
    date: Date;
    price: number;
    matchDateString: string;
}

export default function UserDetailModal({ isOpen, onClose, user, onUpdate }: UserDetailModalProps) {
    const [pendingMatches, setPendingMatches] = useState<PendingMatchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [manualDebtInput, setManualDebtInput] = useState("");

    // Fetch Pending Matches Details
    useEffect(() => {
        if (isOpen && user) {
            fetchPendingDetails();
        }
    }, [isOpen, user]);

    const fetchPendingDetails = async () => {
        setLoading(true);
        try {
            // 1. Get Pending Stats
            const q = query(
                collection(db, "match_stats"),
                where("userId", "==", user.id),
                where("paymentStatus", "==", "PENDING")
            );
            const snap = await getDocs(q);

            if (snap.empty) {
                setPendingMatches([]);
                setLoading(false);
                return;
            }

            const stats = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const matchIds = Array.from(new Set(stats.map((s: any) => s.matchId as string)));

            // 2. Fetch Match Details (Price & Date)
            // We can't use 'in' query efficiently if > 10, so let's do parallel getDoc for simplicity or chunks.
            // Given a user won't have THAT many pending matches, Promise.all is fine.
            const matchesData: Record<string, { date: Date, price: number }> = {};

            await Promise.all(matchIds.map(async (mid) => {
                const mDoc = await getDoc(doc(db, "matches", mid));
                if (mDoc.exists()) {
                    const d = mDoc.data();
                    matchesData[mid] = {
                        date: (d.date as Timestamp).toDate(),
                        price: d.pricePerPlayer || 0
                    };
                }
            }));

            // 3. Combine
            const combined: PendingMatchItem[] = stats.map((s: any) => {
                const mData = matchesData[s.matchId];
                if (!mData) return null;
                return {
                    statId: s.id,
                    matchId: s.matchId,
                    date: mData.date,
                    price: mData.price,
                    matchDateString: mData.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                };
            }).filter(Boolean) as PendingMatchItem[];

            // Sort by date desc
            combined.sort((a, b) => b.date.getTime() - a.date.getTime());

            setPendingMatches(combined);

        } catch (error) {
            console.error("Error fetching pending details:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsPaid = async (statId: string) => {
        setProcessingId(statId);
        try {
            await updateDoc(doc(db, "match_stats", statId), {
                paymentStatus: 'PAID'
            });
            // Remove from list locally
            setPendingMatches(prev => prev.filter(p => p.statId !== statId));
            onUpdate(); // Update parent total
        } catch (error) {
            console.error("Error updating payment:", error);
        } finally {
            setProcessingId(null);
        }
    };

    const handleManualDebtUpdate = async (type: 'add' | 'subtract') => {
        const val = parseFloat(manualDebtInput);
        if (isNaN(val) || val <= 0) return;

        setProcessingId('manual');
        try {
            const adjustment = type === 'add' ? val : -val;
            await updateDoc(doc(db, "users", user.id), {
                manualDebt: increment(adjustment)
            });
            onUpdate();
            setManualDebtInput("");
            // Optimistic update of prop? No, onUpdate triggers parent re-fetch which re-renders this modal? 
            // Actually parent re-render might close modal if we aren't careful? 
            // No, the modal isOpen is controlled by parent state. Re-render implies 'user' prop updates.
            // So we wait for prop update.
        } catch (error) {
            console.error("Error adjusting manual debt:", error);
        } finally {
            setProcessingId(null);
        }
    };

    if (!isOpen) return null;

    const totalPending = pendingMatches.reduce((acc, curr) => acc + curr.price, 0);
    const manualDebt = user.manualDebt || 0;
    const grandTotal = totalPending + manualDebt;
    const isClean = grandTotal === 0 && pendingMatches.length === 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-[95vw] max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400 border border-slate-700">
                            {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "??"}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">{user.displayName}</h3>
                            <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                    {/* Status Card */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between ${isClean ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${isClean ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                                {isClean ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                            </div>
                            <div>
                                <h4 className={`font-bold ${isClean ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {isClean ? 'Todo en orden' : 'Pagos Pendientes'}
                                </h4>
                                <p className="text-xs text-slate-400">Estado de cuenta actual</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`text-2xl font-black ${isClean ? 'text-emerald-400' : 'text-red-400'}`}>
                                {grandTotal > 0 ? '-' : ''}{Math.abs(grandTotal).toFixed(2)}€
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Deuda Total</div>
                        </div>
                    </div>

                    {/* Pending Matches Section */}
                    <div className="space-y-3">
                        <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            Partidos Pendientes
                        </h4>

                        {loading ? (
                            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
                        ) : pendingMatches.length === 0 ? (
                            <div className="text-center py-4 border border-dashed border-slate-800 rounded-xl bg-slate-900/50 text-slate-500 text-sm">
                                No hay partidos sin pagar.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {pendingMatches.map(match => (
                                    <div key={match.statId} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-white">{match.matchDateString}</span>
                                            <span className="text-xs text-slate-500">Precio partido</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-red-400">-{match.price}€</span>
                                            <button
                                                onClick={() => handleMarkAsPaid(match.statId)}
                                                disabled={processingId === match.statId}
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg shadow-emerald-900/20 transition-all active:scale-95 disabled:opacity-50"
                                            >
                                                {processingId === match.statId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Saldar'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Manual Debt Section */}
                    <div className="space-y-3 pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-amber-400" />
                                Ajustes Manuales / Multas
                            </h4>
                            <span className={`text-xs font-bold px-2 py-1 rounded border ${manualDebt !== 0 ? 'bg-slate-800 border-slate-700 text-white' : 'border-transparent text-slate-600'}`}>
                                Saldo manual: {manualDebt > 0 ? '-' : '+'}{Math.abs(manualDebt)}€
                            </span>
                        </div>

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    placeholder="Cantidad (ej: 5.00)"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                                    value={manualDebtInput}
                                    onChange={e => setManualDebtInput(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleManualDebtUpdate('add')} // Increases Debt (Negative balance technically, but displayed as Debt > 0)
                                    disabled={!manualDebtInput || processingId === 'manual'}
                                    className="flex items-center justify-center gap-2 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {processingId === 'manual' ? <Loader2 className="w-3 h-3 animate-spin " /> : <Plus className="w-3 h-3" />}
                                    Añadir Deuda
                                </button>
                                <button
                                    onClick={() => handleManualDebtUpdate('subtract')} // Reduces Debt
                                    disabled={!manualDebtInput || processingId === 'manual'}
                                    className="flex items-center justify-center gap-2 py-2 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-500 border border-emerald-900/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {processingId === 'manual' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minus className="w-3 h-3" />}
                                    Restar / Pagar
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
