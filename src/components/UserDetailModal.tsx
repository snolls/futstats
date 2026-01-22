'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { X, Calendar, Wallet, CheckCircle2, AlertTriangle, Plus, Minus, Loader2, History, RotateCcw, Pencil, Save, Users, Shield, ArrowRight } from 'lucide-react';
import { usePlayerDebts } from '@/hooks/usePlayerDebts';
import { AppUserCustomData, PLAYER_POSITIONS } from '@/types/user';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDocs, collection, query, where, arrayUnion, arrayRemove, writeBatch, onSnapshot } from 'firebase/firestore';
import { useAuthContext } from '@/context/AuthContext';
import { toast } from 'sonner';
import { UserService } from '@/services/UserService';
import { UserMinus, Ban } from 'lucide-react';

interface UserDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AppUserCustomData & { id: string; manualDebt?: number };
    groupId?: string | null; // Optional context
    onUpdate: () => void; // Trigger refresh in parent
}

export default function UserDetailModal({ isOpen, onClose, user, groupId, onUpdate }: UserDetailModalProps) {
    // --- LIVE DATA SYNC ---
    // Usamos un estado local sincronizado para reflejar cambios (grupos, deudas) en tiempo real
    const [liveUser, setLiveUser] = useState<AppUserCustomData & { id: string }>(user);

    useEffect(() => {
        if (!isOpen || !user.id) return;
        // Suscribirse a cambios en el usuario
        const unsub = onSnapshot(doc(db, "users", user.id), (docSnap) => {
            if (docSnap.exists()) {
                setLiveUser({ id: docSnap.id, ...docSnap.data() } as AppUserCustomData & { id: string });
            }
        });
        return () => unsub();
    }, [user.id, isOpen]);


    // Auth Context for valid groups to manage
    const { user: currentUser, userData: currentUserData } = useAuthContext();

    // --- 1. CONTEXTO ECONÓMICO ---
    const [selectedDebtContext, setSelectedDebtContext] = useState<string>("");

    // Group Management State (Moved up for dependencies)
    const [manageableGroups, setManageableGroups] = useState<{ id: string, name: string }[]>([]);
    const [isFetchingGroups, setIsFetchingGroups] = useState(false);



    // Safety Effect: If selected group is no longer associated (e.g. unchecked in UI), switch or clear.
    useEffect(() => {
        if (!liveUser || !selectedDebtContext) return;

        const isStillMember = liveUser.associatedGroups?.includes(selectedDebtContext);

        if (!isStillMember) {
            // Find intersection of associated groups and manageable groups
            const validGroups = liveUser.associatedGroups?.filter(ag => manageableGroups.some(mg => mg.id === ag)) || [];

            if (validGroups.length > 0) {
                // Switch to first valid group
                setSelectedDebtContext(validGroups[0]);
                toast.info(`Cambio automático: Contexto cambiado a grupo válido.`);
            } else {
                setSelectedDebtContext(''); // Reset total si no tiene grupos válidos
                toast.warning("El usuario ya no pertenece al grupo seleccionado.");
            }
        }
    }, [liveUser.associatedGroups, selectedDebtContext, manageableGroups]);

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
            setManageableGroups(snap.docs.map(d => ({
                id: d.id,
                name: d.data().name,
                adminIds: d.data().adminIds // Include for potential client-side checks
            })));
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

    // --- GLOBAL DATA HOOK ---
    // Initialize with undefined to fetch ALL matches and debts.
    // We will filter client-side for specific contexts.
    const {
        pendingMatches: allPendingMatches,
        paidMatches: allPaidMatches,
        totalDebt: globalTotalDebt,
        matchesDebt: globalMatchesDebt,
        manualDebt: globalManualDebt,
        loading,
        toggleMatchPayment,
        updateManualDebt,
        processSmartPayment
    } = usePlayerDebts(liveUser?.id, undefined);

    // --- FILTERED LISTS FOR EXTENDED UI ---
    // These lists are used for the "Partidos" tab list
    const filteredPendingMatches = useMemo(() => {
        if (!selectedDebtContext) return allPendingMatches;
        return allPendingMatches.filter(m => m.groupId === selectedDebtContext);
    }, [allPendingMatches, selectedDebtContext]);

    const filteredPaidMatches = useMemo(() => {
        if (!selectedDebtContext) return allPaidMatches;
        return allPaidMatches.filter(m => m.groupId === selectedDebtContext);
    }, [allPaidMatches, selectedDebtContext]);


    // --- VISIBLE GROUPS (PRIVACY FILTER) ---
    // Only show groups that are BOTH:
    // 1. Associated with the target user (liveUser.associatedGroups)
    // 2. Manageable by the current viewer (current user is admin or superadmin)
    const visibleGroups = useMemo(() => {
        if (!liveUser?.associatedGroups) return [];
        return manageableGroups.filter(mg => liveUser.associatedGroups?.includes(mg.id));
    }, [liveUser.associatedGroups, manageableGroups]);

    // --- UNIFIED DEBT CALCULATION ---
    // Calculates the unified balance for ANY group (or global if null)
    // Returns: { total, manual, matches }
    // Total is positive if debt.
    const calculateGroupBalance = (gid?: string | null) => {
        if (!gid) {
            // Global Case (Re-calculated based on VISIBLE groups only)
            // We cannot just use globalTotalDebt from the hook because that includes HIDDEN groups.
            // We must sum the balances of all visibleGroups.
            const visibleBalances = visibleGroups.map(g => calculateGroupBalance(g.id));

            return {
                total: visibleBalances.reduce((acc, b) => acc + b.total, 0),
                manual: visibleBalances.reduce((acc, b) => acc + b.manual, 0),
                matches: visibleBalances.reduce((acc, b) => acc + b.matches, 0)
            };
        }

        // Specific Group Case
        const manual = liveUser?.debts?.[gid] || 0;
        const matches = allPendingMatches
            .filter(m => m.groupId === gid)
            .reduce((acc, m) => acc + (m.price || 0), 0);

        return {
            total: manual + matches,
            manual,
            matches
        };
    };

    // Calculate Final Displayed Total for the Main Badge
    // If selectedDebtContext is present, show that group.
    // If NOT present (Global), use the privacy-safe global calculation.
    const groupFinancialStatus = useMemo(() => {
        return calculateGroupBalance(selectedDebtContext || null);
    }, [selectedDebtContext, visibleGroups, liveUser.debts, allPendingMatches]);

    const displayedTotal = groupFinancialStatus.total;

    // --- SMART AUTO-SELECTION LOGIC ---
    useEffect(() => {
        // Only run logic if NO context is currently selected
        if (selectedDebtContext) return;

        let targetGroup = '';

        // 1. Priority: Pending Matches (Urgent)
        if (allPendingMatches.length > 0) {
            const firstPending = allPendingMatches.find(m => m.paymentStatus === 'PENDING');
            if (firstPending && firstPending.groupId) {
                targetGroup = firstPending.groupId;
            }
        }

        // 2. Priority: Manual Debt
        if (!targetGroup && liveUser?.debts) {
            const debts = liveUser.debts || {};
            // User owes money (Positive Value)
            const groupWithDebt = Object.keys(debts).find(gid => debts[gid] > 0);
            if (groupWithDebt) targetGroup = groupWithDebt;
        }

        // 3. Fallback: First Associated Group
        if (!targetGroup && liveUser?.associatedGroups && liveUser.associatedGroups.length > 0) {
            targetGroup = liveUser.associatedGroups[0];
        }

        // Apply Selection if found and valid
        if (targetGroup) {
            setSelectedDebtContext(targetGroup);
        }

    }, [allPendingMatches, liveUser.debts, liveUser.associatedGroups, selectedDebtContext]);


    // --- SMART AUTO-SELECTION LOGIC (Moved here) ---

    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [manualDebtInput, setManualDebtInput] = useState("");
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState("");
    const [isSavingName, setIsSavingName] = useState(false);

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

    // State for Danger Action Confirmation
    const [dangerConfirm, setDangerConfirm] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        actionText: string;
        type: 'kick' | 'ban';
        onConfirm: () => void;
    } | null>(null);

    // Validar y tipar explícitamente los datos que vienen del user
    const [editNickname, setEditNickname] = useState(liveUser.nickname || "");
    const [editPosition, setEditPosition] = useState(liveUser.position || "CM");
    const [editStrongFoot, setEditStrongFoot] = useState<'right' | 'left' | 'ambidextrous'>(liveUser.strongFoot as any || "right");

    const canEditProfile = currentUserData?.role === 'superadmin' || currentUser?.uid === liveUser.id;

    const startEditingName = () => {
        if (!canEditProfile) return;
        setEditNameValue(liveUser.displayName || "");
        setEditNickname(liveUser.nickname || "");
        setEditPosition(liveUser.position || "CM");
        setEditStrongFoot(liveUser.strongFoot as any || "right");
        setIsEditingName(true);
    };

    const saveName = async () => {
        // Permitimos guardar incluso si no cambia nada para simplificar, o validamos cambios
        setIsSavingName(true);
        try {
            const userRef = doc(db, "users", user.id);
            await updateDoc(userRef, {
                displayName: editNameValue.trim(),
                nickname: editNickname.trim(),
                position: editPosition,
                strongFoot: editStrongFoot
            });
            onUpdate(); // Refresh parent
            setIsEditingName(false);
        } catch (error) {
            console.error("Error updating profile:", error);
        } finally {
            setIsSavingName(false);
        }
    };

    const initiateManualUpdate = (type: 'add' | 'subtract') => {
        const val = parseFloat(manualDebtInput);
        if (isNaN(val) || val <= 0) return;

        if (type === 'subtract' && filteredPendingMatches.length > 0) {
            // INTERCEPTAR: Si intenta cancelar deuda (pagar) y tiene partidos pendientes
            setPendingPaymentAmount(val);
            setShowPaymentConfirm(true);
        } else {
            // Flujo normal (Añadir deuda o Pagar sin partidos pendientes)
            executeManualUpdate(type, val);
        }
    };

    const executeManualUpdate = async (type: 'add' | 'subtract', amount: number) => {
        if (!selectedDebtContext) {
            toast.error("Selecciona un grupo para modificar la deuda manual.");
            return;
        }
        setProcessingId('manual');
        try {
            const adjustment = type === 'add' ? amount : -amount;
            // Pass selectedDebtContext to override hook's global context
            await updateManualDebt(adjustment, selectedDebtContext);
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
            // Pass selectedDebtContext to override hook
            await processSmartPayment(pendingPaymentAmount, selectedDebtContext || undefined);
            onUpdate();
            setManualDebtInput("");
            setShowPaymentConfirm(false);
        } catch (error) {
            console.error("Error processing smart payment:", error);
        } finally {
            setProcessingId(null);
        }
    };



    // --- Dropdown Options Logic (Fix for Reactivity) ---
    // --- Dropdown Options Logic (Fix for Reactivity) ---
    // Use visibleGroups directly for the dropdown to ensure consistency
    const dropdownOptions = visibleGroups;



    // --- Group Management Logic --- //


    const toggleGroupAssociation = async (groupId: string, isAssociated: boolean) => {
        setProcessingId(`group-${groupId}`);
        try {
            const batch = writeBatch(db);
            const userRef = doc(db, "users", user.id);
            const groupRef = doc(db, "groups", groupId);

            if (isAssociated) {
                // Remove from both: user.associatedGroups and group.members
                batch.update(userRef, {
                    associatedGroups: arrayRemove(groupId)
                });
                batch.update(groupRef, {
                    members: arrayRemove(user.id)
                });
            } else {
                // Add to both: user.associatedGroups and group.members
                batch.update(userRef, {
                    associatedGroups: arrayUnion(groupId)
                });
                batch.update(groupRef, {
                    members: arrayUnion(user.id)
                });
            }

            await batch.commit();
            onUpdate();
        } catch (err) {
            console.error("Error toggling group:", err);
        } finally {
            setProcessingId(null);
        }
    };

    const handleRequestAdmin = async () => {
        if (!user) return;

        try {
            setProcessingId('request-admin'); // Bloquea el botón
            const userRef = doc(db, 'users', user.id);

            await updateDoc(userRef, {
                adminRequestStatus: 'pending'
            });

            toast.success("Solicitud enviada al Superadmin");
        } catch (error) {
            console.error("Error solicitando admin:", error);
            toast.error("Error al enviar la solicitud");
        } finally {
            setProcessingId(null);
        }
    };

    const handleKickFromGroup = () => {
        if (!groupId) return;
        setDangerConfirm({
            isOpen: true,
            title: "Expulsar del Grupo",
            message: `¿Seguro que quieres expulsar a ${user.displayName} de este grupo? Esta acción solo revoca el acceso a este grupo.`,
            actionText: "Expulsar",
            type: 'kick',
            onConfirm: async () => {
                setProcessingId('kick-group');
                try {
                    await toggleGroupAssociation(groupId, true);
                    toast.success("Usuario expulsado.");
                    onClose();
                } catch (error) {
                    console.error("Error kicking user:", error);
                    toast.error("Error al expulsar.");
                } finally {
                    setProcessingId(null);
                    setDangerConfirm(null);
                }
            }
        });
    };

    const handleGlobalBan = () => {
        setDangerConfirm({
            isOpen: true,
            title: "ELIMINAR CUENTA Y BANEAR",
            message: `PELIGRO: ¿Estás seguro de que quieres ELIMINAR PERMANENTEMENTE a ${user.displayName}? Esta acción borrará estadísticas, deudas y todos sus datos. NO SE PUEDE DESHACER.`,
            actionText: "ELIMINAR Y BANEAR",
            type: 'ban',
            onConfirm: async () => {
                // Double check implicit in clicking the red button in UI
                setProcessingId('global-ban');
                try {
                    if (!currentUser) return;
                    // @ts-ignore
                    await UserService.deleteUserFull({ ...currentUserData, uid: currentUser.uid, role: currentUserData?.role || 'user' }, user.id);
                    toast.success("Usuario eliminado globalmente.");
                    onClose();
                    onUpdate();
                } catch (error) {
                    console.error("Error banning user:", error);
                    toast.error("Error al eliminar usuario.");
                } finally {
                    setProcessingId(null);
                    setDangerConfirm(null);
                }
            }
        });
    };

    if (!isOpen) return null;

    const isDebt = displayedTotal > 0.01;
    const isCredit = displayedTotal < -0.01;
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto py-10">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full sm:w-[95vw] max-w-2xl bg-slate-900 border-t sm:border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:h-auto overflow-hidden animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95">

                {/* DANGER CONFIRM OVERLAY */}
                {dangerConfirm?.isOpen && (
                    <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-red-500/30 p-6 rounded-xl max-w-sm w-full shadow-2xl space-y-4 text-center">
                            <div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-2">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white">{dangerConfirm.title}</h3>
                            <p className="text-slate-300 text-sm">{dangerConfirm.message}</p>

                            <div className="grid gap-3 pt-2">
                                <button
                                    onClick={dangerConfirm.onConfirm}
                                    disabled={!!processingId}
                                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg shadow-red-900/20 flex items-center justify-center gap-2"
                                >
                                    {processingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                    {dangerConfirm.actionText}
                                </button>
                                <button
                                    onClick={() => setDangerConfirm(null)}
                                    disabled={!!processingId}
                                    className="w-full py-2 text-slate-400 hover:text-white text-sm"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* OVERLAY DE CONFIRMACIÓN DE PAGO */}
                {showPaymentConfirm && (
                    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 rounded-2xl animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl max-w-md w-full shadow-2xl space-y-4">
                            <div className="flex items-center gap-3 text-amber-500 mb-2">
                                <AlertTriangle className="w-8 h-8" />
                                <h3 className="text-xl font-bold text-white">Atención</h3>
                            </div>

                            <p className="text-slate-300 text-sm leading-relaxed">
                                El usuario tiene <strong className="text-white">{filteredPendingMatches.length} partidos pendientes</strong> por un valor de <strong className="text-red-400">{filteredPendingMatches.reduce((acc, m) => acc + m.price, 0).toFixed(2)}€</strong>.
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
                                <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-700 mt-2">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase">Editar Perfil</h4>

                                    {/* Nombre Real */}
                                    <div>
                                        <label className="text-[10px] text-slate-400">Nombre Real</label>
                                        <input
                                            value={editNameValue}
                                            onChange={(e) => setEditNameValue(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm focus:border-blue-500 outline-none"
                                            placeholder="Nombre Completo"
                                        />
                                    </div>

                                    {/* Apodo */}
                                    <div>
                                        <label className="text-[10px] text-slate-400">Apodo</label>
                                        <input
                                            value={editNickname}
                                            onChange={(e) => setEditNickname(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm focus:border-blue-500 outline-none"
                                            placeholder="Ej. La Pulga"
                                        />
                                    </div>

                                    {/* Posición y Pie */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-slate-400">Posición</label>
                                            <select
                                                value={editPosition}
                                                onChange={(e) => setEditPosition(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm focus:border-blue-500 outline-none appearance-none"
                                            >
                                                {Object.entries(PLAYER_POSITIONS).map(([key, label]) => (
                                                    <option key={key} value={key}>{key} - {label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-400">Pierna</label>
                                            <select
                                                value={editStrongFoot}
                                                onChange={(e) => setEditStrongFoot(e.target.value as any)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm focus:border-blue-500 outline-none appearance-none"
                                            >
                                                <option value="right">Diestro</option>
                                                <option value="left">Zurdo</option>
                                                <option value="ambidextrous">Ambidextro</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                        <button onClick={() => setIsEditingName(false)} className="px-3 py-1 text-xs text-slate-400 hover:text-white">Cancelar</button>
                                        <button
                                            onClick={saveName}
                                            disabled={isSavingName}
                                            className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded flex items-center gap-1"
                                        >
                                            {isSavingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                            Guardar Cambios
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="group">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        {user.displayName}
                                        {canEditProfile && (
                                            <button onClick={startEditingName} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-blue-400 p-1">
                                                <Pencil className="w-3 h-3" />
                                            </button>
                                        )}
                                    </h3>
                                    {user.nickname && <p className="text-sm text-yellow-500 font-medium italic">"{user.nickname}"</p>}
                                    {(user.position || user.strongFoot) && (
                                        <div className="flex items-center gap-2 mt-1">
                                            {user.position && <span className="text-[10px] bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded border border-blue-900/50">⚽ {user.position}</span>}
                                            {user.strongFoot && <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">🦶 {user.strongFoot === 'left' ? 'L' : user.strongFoot === 'right' ? 'R' : 'LR'}</span>}
                                        </div>
                                    )}
                                </div>
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
                                    {(liveUser.associatedGroups || []).length > 0 && <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 rounded">{liveUser.associatedGroups?.length} Grupos</span>}
                                </div>
                            </div>

                            {/* Admin Request UI */}
                            {currentUser?.uid === user.id && user.role === 'user' && (
                                <div className="mt-2">
                                    {user.adminRequestStatus === 'pending' ? (
                                        <span className="text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-1 rounded font-bold flex items-center gap-1 inline-block">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Solicitud Pendiente
                                        </span>
                                    ) : user.adminRequestStatus === 'rejected' ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-1 rounded font-bold">
                                                Solicitud Rechazada
                                            </span>
                                            <button
                                                onClick={handleRequestAdmin}
                                                disabled={processingId === 'request-admin'}
                                                className="text-xs text-blue-400 hover:text-blue-300 underline"
                                            >
                                                Solicitar de nuevo
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleRequestAdmin}
                                            disabled={processingId === 'request-admin'}
                                            className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded font-bold transition-all flex items-center gap-2"
                                        >
                                            {processingId === 'request-admin' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                                            Solicitar Admin
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700/50 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-600">

                    {/* --- DESGLOSE DE DEUDAS (BETA) --- */}
                    {/* --- DESGLOSE DE DEUDAS (BETA) --- */}
                    {/* BADGES DE ESTADO FINANCIERO POR GRUPO */}
                    {visibleGroups.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {visibleGroups.map(group => {
                                // Unified Calc
                                const { total } = calculateGroupBalance(group.id);

                                const isDebt = total > 0.01;
                                const isCredit = total < -0.01;

                                let styleClass = "border-slate-800 text-slate-500 bg-slate-900"; // Neutro
                                if (isDebt) styleClass = "border-red-500/50 text-red-400 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.1)]";
                                if (isCredit) styleClass = "border-emerald-500/50 text-emerald-400 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]";

                                const isSelected = selectedDebtContext === group.id;

                                return (
                                    <button
                                        key={group.id}
                                        onClick={() => setSelectedDebtContext(isSelected ? "" : group.id)}
                                        className={`px-3 py-2 rounded-lg border ${styleClass} flex flex-col items-center justify-center min-w-[90px] transition-all duration-200 ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : 'hover:border-slate-600'}`}
                                    >
                                        <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 truncate max-w-[120px]">{group.name}</span>
                                        <span className="text-sm font-mono font-bold tracking-tight">
                                            {isDebt ? '-' : isCredit ? '+' : ''}{Math.abs(total).toFixed(2)}€
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}


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
                                {isDebt ? '-' : isCredit ? '+' : ''}{Math.abs(displayedTotal).toFixed(2)}€
                            </div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center justify-end gap-1">
                                {selectedDebtContext ? (
                                    <>
                                        <span className="opacity-50">En:</span>
                                        <span className={statusConfig.amountColor}>{manageableGroups.find(g => g.id === selectedDebtContext)?.name || '...'}</span>
                                    </>
                                ) : (
                                    <>Global</>
                                )}
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
                                    Pendientes ({filteredPendingMatches.length})
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
                            filteredPendingMatches.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/50 text-slate-500 text-sm">
                                    No hay partidos sin pagar.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filteredPendingMatches.map(match => (
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
                            filteredPaidMatches.length === 0 ? (
                                <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/50 text-slate-500 text-sm">
                                    No hay historial reciente.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filteredPaidMatches.map(match => (
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
                            {groupFinancialStatus.manual < 0 ? (
                                <span className="text-xs font-bold px-2 py-1 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                                    Saldo disponible: {Math.abs(groupFinancialStatus.manual).toFixed(2)}€
                                </span>
                            ) : (
                                <span className={`text-xs font-bold px-2 py-1 rounded border ${groupFinancialStatus.manual > 0 ? 'bg-slate-800 border-slate-700 text-white' : 'border-transparent text-slate-600'}`}>
                                    Saldo: {groupFinancialStatus.manual > 0 ? '-' : ''}{Math.abs(groupFinancialStatus.manual).toFixed(2)}€
                                </span>
                            )}
                        </div>

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">

                            {groupFinancialStatus.matches > 0 && (
                                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-xs">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>
                                        El usuario tiene <strong>{groupFinancialStatus.matches.toFixed(2)}€</strong> en partidos pendientes.
                                        Usa el botón "Restar / Pagar" para decidir cómo aplicar el dinero.
                                    </p>
                                </div>
                            )}

                            {/* SELECTOR DE CONTEXTO */}
                            <div>
                                <label className="text-[10px] text-slate-400 mb-1 block">Gestionando economía de:</label>
                                <select
                                    value={selectedDebtContext}
                                    onChange={(e) => setSelectedDebtContext(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:border-blue-500 outline-none mb-3"
                                >
                                    <option value="" disabled>-- Selecciona Grupo --</option>
                                    {/* Reactive Dropdown Options */}
                                    {dropdownOptions.map(group => (
                                        <option key={group.id} value={group.id}>
                                            {group.name}
                                        </option>
                                    ))}
                                    {/* Fallback for groups in debts but not associated? Removed for strictness. */}
                                </select>
                            </div>

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
                                    onClick={() => {
                                        if (!selectedDebtContext) return toast.error("Selecciona un grupo primero");
                                        initiateManualUpdate('add');
                                    }}
                                    disabled={!manualDebtInput || processingId === 'manual' || !selectedDebtContext}
                                    className="flex items-center justify-center gap-2 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 border border-red-900/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {processingId === 'manual' ? <Loader2 className="w-3 h-3 animate-spin " /> : <Plus className="w-3 h-3" />}
                                    Añadir Deuda
                                </button>
                                <button
                                    onClick={() => {
                                        if (!selectedDebtContext) return toast.error("Selecciona un grupo primero");
                                        initiateManualUpdate('subtract');
                                    }}
                                    disabled={!manualDebtInput || processingId === 'manual' || processingId === 'smart-payment' || !selectedDebtContext}
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
                                    const isAssociated = liveUser.associatedGroups?.includes(group.id);
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

                {/* DANGER ZONE */}
                {(groupId || currentUserData?.role === 'superadmin') && (user.id !== currentUser?.uid) && (
                    <div className="p-6 border-t border-slate-800 bg-red-950/10">
                        <h4 className="text-xs font-bold text-red-500 uppercase flex items-center gap-2 mb-3">
                            <AlertTriangle className="w-4 h-4" />
                            Zona de Peligro
                        </h4>

                        <div className="flex flex-col gap-3">
                            {/* Option 1: Kick from Context Group */}
                            {groupId && (
                                <button
                                    onClick={handleKickFromGroup}
                                    disabled={!!processingId}
                                    className="w-full flex items-center justify-between p-3 bg-red-900/20 hover:bg-red-900/30 border border-red-900/30 hover:border-red-500/50 rounded-lg group transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="bg-red-900/30 p-2 rounded text-red-400 group-hover:text-red-300">
                                            <UserMinus className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-bold text-red-200 group-hover:text-white">Expulsar del Grupo</div>
                                            <div className="text-xs text-red-400/70">Solo elimina a este usuario de este grupo</div>
                                        </div>
                                    </div>
                                    {processingId === 'kick-group' && <Loader2 className="w-4 h-4 animate-spin text-red-500" />}
                                </button>
                            )}

                            {/* Option 2: Global Ban (Superadmin Only) */}
                            {currentUserData?.role === 'superadmin' && (
                                <button
                                    onClick={handleGlobalBan}
                                    disabled={!!processingId}
                                    className="w-full flex items-center justify-between p-3 bg-red-950 hover:bg-red-900 border border-red-900 hover:border-red-600 rounded-lg group transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="bg-red-950 p-2 rounded text-red-500 group-hover:text-red-400">
                                            <Ban className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-bold text-white">Eliminar Cuenta y Banear</div>
                                            <div className="text-xs text-red-400">Acción destructiva global. Irreversible.</div>
                                        </div>
                                    </div>
                                    {processingId === 'global-ban' && <Loader2 className="w-4 h-4 animate-spin text-red-500" />}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
