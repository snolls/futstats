'use client';

import { useRef, useState } from 'react';
import { X, Calendar, Wallet, CheckCircle2, AlertTriangle, Plus, Minus, Loader2, History, RotateCcw, Pencil, Save, Users } from 'lucide-react';
import { usePlayerDebts } from '@/hooks/usePlayerDebts';
import { AppUserCustomData } from '@/types/user';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDocs, collection, query, where, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useAuthContext } from '@/context/AuthContext';

interface UserDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AppUserCustomData & { id: string; manualDebt?: number };
    onUpdate: () => void; // Trigger refresh in parent
}

export default function UserDetailModal({ isOpen, onClose, user, onUpdate }: UserDetailModalProps) {
    const {
        pendingMatches,
        paidMatches,
        totalDebt,
        matchesDebt,
        manualDebt,
        loading,
        toggleMatchPayment,
        updateManualDebt,
        processSmartPayment
    } = usePlayerDebts(user?.id);

    // Auth Context for valid groups to manage
    const { user: currentUser, userData: currentUserData } = useAuthContext();

    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [manualDebtInput, setManualDebtInput] = useState("");
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState("");
    const [isSavingName, setIsSavingName] = useState(false);

    // Group Management State
    const [manageableGroups, setManageableGroups] = useState<{ id: string, name: string }[]>([]);
    const [isFetchingGroups, setIsFetchingGroups] = useState(false);

    // Estado para el diálogo de confirmación de pago inteligente
    const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
    const [pendingPaymentAmount, setPendingPaymentAmount] = useState(0);

    const handleTogglePayment = async (statId: string, currentStatus: 'PENDING' | 'PAID') => {
        setProcessingId(statId);
        try {
            await toggleMatchPayment(statId, currentStatus);
            onUpdate();
        } catch (error) {
            console.error("Error toggling payment:", error);
        } finally {
            setProcessingId(null);
        }
    };

    const startEditingName = () => {
        setEditNameValue(user.displayName || "");
        setIsEditingName(true);
    };

    const saveName = async () => {
        if (!editNameValue.trim() || editNameValue === user.displayName) {
            setIsEditingName(false);
            return;
        }
        setIsSavingName(true);
        try {
            const userRef = doc(db, "users", user.id);
            await updateDoc(userRef, { displayName: editNameValue.trim() });
            onUpdate(); // Refresh parent
            setIsEditingName(false);
        } catch (error) {
            console.error("Error updating name:", error);
        } finally {
            setIsSavingName(false);
        }
    };

    const initiateManualUpdate = (type: 'add' | 'subtract') => {
        const val = parseFloat(manualDebtInput);
        if (isNaN(val) || val <= 0) return;

        if (type === 'subtract' && pendingMatches.length > 0) {
            // INTERCEPTAR: Si intenta cancelar deuda (pagar) y tiene partidos pendientes
            setPendingPaymentAmount(val);
            setShowPaymentConfirm(true);
        } else {
            // Flujo normal (Añadir deuda o Pagar sin partidos pendientes)
            executeManualUpdate(type, val);
        }
    };

    const executeManualUpdate = async (type: 'add' | 'subtract', amount: number) => {
        setProcessingId('manual');
        try {
            const adjustment = type === 'add' ? amount : -amount;
            await updateManualDebt(adjustment);
            onUpdate();
            setManualDebtInput("");
            setShowPaymentConfirm(false);
        } catch (error) {
            console.error("Error adjusting manual debt:", error);
        } finally {
            setProcessingId(null);
        }
    };

    const executeSmartPayment = async () => {
        setProcessingId('smart-payment');
        try {
            await processSmartPayment(pendingPaymentAmount); // La función del hook hace la magia
            onUpdate();
            setManualDebtInput("");
            setShowPaymentConfirm(false);
        } catch (error) {
            console.error("Error processing smart payment:", error);
        } finally {
            setProcessingId(null);
        }
    };

    // --- Group Management Logic --- //
    const fetchManageableGroups = async () => {
        if (!currentUser || isFetchingGroups || manageableGroups.length > 0) return;
        setIsFetchingGroups(true);
        try {
            let q;
            if (currentUserData?.role === 'superadmin') {
                q = query(collection(db, "groups"));
            } else {
                q = query(collection(db, "groups"), where("adminIds", "array-contains", currentUser.uid));
            }
            const snap = await getDocs(q);
            setManageableGroups(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
        } catch (err) {
            console.error("Error fetching groups for detail modal", err);
        } finally {
            setIsFetchingGroups(false);
        }
    };

    // Load groups when modal opens
    if (isOpen && manageableGroups.length === 0 && !isFetchingGroups) {
        fetchManageableGroups();
    }

    const toggleGroupAssociation = async (groupId: string, isAssociated: boolean) => {
        setProcessingId(`group-${groupId}`);
        try {
            const userRef = doc(db, "users", user.id);
            if (isAssociated) {
                // Remove
                await updateDoc(userRef, {
                    associatedGroups: arrayRemove(groupId)
                });
            } else {
                // Add
                await updateDoc(userRef, {
                    associatedGroups: arrayUnion(groupId)
                });
            }
            onUpdate();
        } catch (err) {
            console.error("Error toggling group:", err);
        } finally {
            setProcessingId(null);
        }
    };

    if (!isOpen) return null;

    const isDebt = totalDebt > 0.01;
    const isCredit = totalDebt < -0.01;
    const isClean = !isDebt && !isCredit;

    // Configuración de estilo según estado
    let statusConfig = {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        iconBg: 'bg-emerald-500/20',
        iconColor: 'text-emerald-500',
        titleColor: 'text-emerald-400',
        amountColor: 'text-emerald-400',
        icon: CheckCircle2,
        title: 'Todo en orden',
        desc: 'Sin deudas activas'
    };

    if (isDebt) {
        statusConfig = {
            bg: 'bg-red-500/10',
            border: 'border-red-500/20',
            iconBg: 'bg-red-500/20',
            iconColor: 'text-red-500',
            titleColor: 'text-red-400',
            amountColor: 'text-red-400',
            icon: AlertTriangle,
            title: 'Pagos Pendientes',
            desc: 'Tiene pagos o multas pendientes'
        };
    } else if (isCredit) {
        statusConfig = {
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
            iconBg: 'bg-emerald-500/20',
            iconColor: 'text-emerald-500',
            titleColor: 'text-emerald-400',
            amountColor: 'text-emerald-400',
            icon: Wallet,
            title: 'Saldo a Favor',
            desc: 'El usuario tiene crédito disponible'
        };
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-[95vw] max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">

                {/* OVERLAY DE CONFIRMACIÓN DE PAGO */}
                {showPaymentConfirm && (
                    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 rounded-2xl animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl max-w-md w-full shadow-2xl space-y-4">
                            <div className="flex items-center gap-3 text-amber-500 mb-2">
                                <AlertTriangle className="w-8 h-8" />
                                <h3 className="text-xl font-bold text-white">Atención</h3>
                            </div>

                            <p className="text-slate-300 text-sm leading-relaxed">
                                El usuario tiene <strong className="text-white">{pendingMatches.length} partidos pendientes</strong> por un valor de <strong className="text-red-400">{matchesDebt.toFixed(2)}€</strong>.
                            </p>

                            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                                <p className="text-xs text-slate-400 mb-1">Importe a pagar:</p>
                                <p className="text-2xl font-bold text-emerald-400">{pendingPaymentAmount.toFixed(2)}€</p>
                            </div>

                            <p className="text-slate-400 text-xs">
                                ¿Cómo quieres aplicar este pago?
                            </p>

                            <div className="grid gap-3">
                                <button
                                    onClick={executeSmartPayment}
                                    disabled={processingId === 'smart-payment'}
                                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20 active:scale-95 disabled:opacity-50"
                                >
                                    {processingId === 'smart-payment' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    <div className="text-left">
                                        <div className="text-sm">Saldar Partidos Antiguos</div>
                                        <div className="text-[10px] text-blue-200 font-normal">Prioriza partidos y el resto a cuenta manual</div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => executeManualUpdate('subtract', pendingPaymentAmount)}
                                    disabled={processingId === 'manual'}
                                    className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold rounded-lg flex items-center justify-center gap-2 transition-all border border-slate-700 disabled:opacity-50"
                                >
                                    {processingId === 'manual' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5 text-slate-500" />}
                                    <div className="text-left">
                                        <div className="text-sm">Solo Ajuste Manual</div>
                                        <div className="text-[10px] text-slate-500 font-normal">Ignorar partidos pendientes</div>
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={() => setShowPaymentConfirm(false)}
                                className="w-full mt-2 text-slate-500 hover:text-white text-xs py-2 transition-colors"
                            >
                                Cancelar operación
                            </button>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400 border border-slate-700">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <span>{user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "??"}</span>
                            )}
                        </div>
                        <div>
                            {isEditingName ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        value={editNameValue}
                                        onChange={(e) => setEditNameValue(e.target.value)}
                                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:border-blue-500 outline-none w-40"
                                        autoFocus
                                    />
                                    <button onClick={saveName} disabled={isSavingName} className="text-emerald-500 hover:text-emerald-400">
                                        {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    </button>
                                </div>
                            ) : (
                                <h3 className="text-lg font-bold text-white flex items-center gap-2 group">
                                    {user.displayName}
                                    <button onClick={startEditingName} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-blue-400">
                                        <Pencil className="w-3 h-3" />
                                    </button>
                                </h3>
                            )}

                            <div className="flex items-center gap-2">
                                {!user.isGuest && user.role !== 'guest' ? (
                                    <p className="text-xs text-slate-400">{user.email}</p>
                                ) : (
                                    <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                                        Invitado
                                    </span>
                                )}
                                {/* Display Groups Badge */}
                                <div className="flex flex-wrap gap-1">
                                    {(user.associatedGroups || []).length > 0 && <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 rounded">{user.associatedGroups?.length} Grupos</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                    {/* Ficha de Estado Dinámica */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between mb-6 ${statusConfig.bg} ${statusConfig.border}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${statusConfig.iconBg} ${statusConfig.iconColor}`}>
                                <statusConfig.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className={`font-bold ${statusConfig.titleColor}`}>
                                    {statusConfig.title}
                                </h4>
                                <p className="text-xs text-slate-400">
                                    {statusConfig.desc}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`text-2xl font-black ${statusConfig.amountColor}`}>
                                {isDebt ? '-' : isCredit ? '+' : ''}{Math.abs(totalDebt).toFixed(2)}€
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                                Total: {matchesDebt.toFixed(2)}€ Partidos + {manualDebt.toFixed(2)}€ Manual
                            </div>
                        </div>
                    </div>

                    {/* Sección de Partidos con Pestañas */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-400" />
                                Gestión de Partidos
                            </h4>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setActiveTab('pending')}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${activeTab === 'pending' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                >
                                    Pendientes ({pendingMatches.length})
                                </button>
                                <button
                                    onClick={() => setActiveTab('history')}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                >
                                    Historial
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
                        ) : activeTab === 'pending' ? (
                            // LISTA DE PENDIENTES
                            pendingMatches.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/50 text-slate-500 text-sm">
                                    No hay partidos sin pagar.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    {pendingMatches.map(match => (
                                        <div key={match.statId} className="flex items-center justify-between p-3 bg-red-950/20 border border-red-900/30 rounded-lg hover:border-red-700/50 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-white">{match.matchDateString}</span>
                                                <span className="text-xs text-red-400">Pendiente de pago</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-red-400">-{match.price.toFixed(2)}€</span>
                                                <button
                                                    onClick={() => handleTogglePayment(match.statId, 'PENDING')}
                                                    disabled={processingId === match.statId}
                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg shadow-emerald-900/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    {processingId === match.statId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'SALDAR'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : (
                            // LISTA DE HISTORIAL (PAGADOS)
                            paidMatches.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/50 text-slate-500 text-sm">
                                    No hay historial reciente.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    {paidMatches.map(match => (
                                        <div key={match.statId} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg opacity-75 hover:opacity-100 transition-opacity">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-400 decoration-slate-600">{match.matchDateString}</span>
                                                <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Pagado</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-slate-500 line-through">{match.price.toFixed(2)}€</span>
                                                <button
                                                    onClick={() => handleTogglePayment(match.statId, 'PAID')}
                                                    disabled={processingId === match.statId}
                                                    className="px-3 py-1.5 bg-slate-800 hover:bg-amber-900/40 text-slate-400 hover:text-amber-500 text-xs font-bold rounded border border-slate-700 hover:border-amber-900/50 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                                                    title="Marcar como NO pagado"
                                                >
                                                    {processingId === match.statId ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                                    DESHACER
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                    {/* Sección de Deuda Manual */}
                    <div className="space-y-3 pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-amber-400" />
                                Ajustes Manuales / Multas
                            </h4>
                            {manualDebt < 0 ? (
                                <span className="text-xs font-bold px-2 py-1 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                                    Saldo disponible: {Math.abs(manualDebt).toFixed(2)}€
                                </span>
                            ) : (
                                <span className={`text-xs font-bold px-2 py-1 rounded border ${manualDebt > 0 ? 'bg-slate-800 border-slate-700 text-white' : 'border-transparent text-slate-600'}`}>
                                    Saldo: {manualDebt > 0 ? '-' : ''}{Math.abs(manualDebt).toFixed(2)}€
                                </span>
                            )}
                        </div>

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">

                            {/* ALERTA DE SEGURIDAD PARA DEUDA PENDIENTE */}
                            {matchesDebt > 0 && (
                                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-xs">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>
                                        El usuario tiene <strong>{matchesDebt.toFixed(2)}€</strong> en partidos pendientes.
                                        Usa el botón "Restar / Pagar" para decidir cómo aplicar el dinero.
                                    </p>
                                </div>
                            )}

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
                                    onClick={() => initiateManualUpdate('add')}
                                    disabled={!manualDebtInput || processingId === 'manual'}
                                    className="flex items-center justify-center gap-2 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {processingId === 'manual' ? <Loader2 className="w-3 h-3 animate-spin " /> : <Plus className="w-3 h-3" />}
                                    Añadir Deuda
                                </button>
                                <button
                                    onClick={() => initiateManualUpdate('subtract')}
                                    disabled={!manualDebtInput || processingId === 'manual' || processingId === 'smart-payment'}
                                    className="flex items-center justify-center gap-2 py-2 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-500 border border-emerald-900/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {processingId === 'manual' || processingId === 'smart-payment' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minus className="w-3 h-3" />}
                                    Restar / Pagar
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Sección de Grupos (Solo visible para Admin/Superadmin gestionando invitados/usuarios) */}
                    {manageableGroups.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-slate-800">
                            <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                <Users className="w-4 h-4 text-blue-400" />
                                Membresía en Grupos
                            </h4>
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {manageableGroups.map(group => {
                                    const isAssociated = user.associatedGroups?.includes(group.id);
                                    const isLoading = processingId === `group-${group.id}`;
                                    return (
                                        <label key={group.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${isAssociated ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isAssociated ? 'bg-blue-500 border-blue-500' : 'border-slate-500'}`}>
                                                    {isAssociated && <CheckCircle2 className="w-3 h-3 text-white" />}
                                                </div>
                                                <span className={`text-sm font-medium ${isAssociated ? 'text-blue-100' : 'text-slate-400'}`}>{group.name}</span>
                                            </div>
                                            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={!!isAssociated}
                                                onChange={() => toggleGroupAssociation(group.id, !!isAssociated)}
                                                disabled={isLoading}
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
