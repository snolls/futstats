'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where, documentId, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/context/AuthContext';
import { AppUserCustomData } from '@/types/user';
import Navbar from '@/components/Navbar';
import { Shield, ShieldCheck, User, DollarSign, Wallet, History, X } from 'lucide-react';
import { PaymentService } from '@/services/PaymentService';
import { toast } from 'sonner';
import PaymentHistory from '@/components/PaymentHistory';
import ConfirmationModal from '@/components/ConfirmationModal';
import AdjustDebtModal from '@/components/AdjustDebtModal';

interface GroupSummary {
    id: string;
    name: string;
}

interface UserCardProps {
    user: AppUserCustomData & { id: string };
    selectedGroupId: string | null;
    onSettle: (userId: string, amount: number) => void;
    onAdjust: (userId: string) => void;
}

function HistoryModal({ groupId, onClose }: { groupId: string, onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <History className="w-5 h-5 text-blue-500" />
                        Historial de Pagos
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <PaymentHistory groupId={groupId} />
                </div>
            </div>
        </div>
    );
}

function UserCard({ user, selectedGroupId, onSettle, onAdjust }: UserCardProps) {
    const isSuperAdmin = user.role === 'superadmin';
    const isAdmin = user.role === 'admin';
    const debt = selectedGroupId ? (user.groupDebts?.[selectedGroupId] || 0) : 0;
    const hasDebt = debt > 0;
    const hasCredit = debt < 0;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center text-center shadow-lg hover:border-gray-700 transition-colors relative overflow-hidden">
            {/* Debt Indicator Strip */}
            {selectedGroupId && debt !== 0 && (
                <div className={`absolute top-0 left-0 w-full h-1 ${hasDebt ? 'bg-red-500' : 'bg-green-500'}`} />
            )}

            <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center text-2xl font-bold text-gray-400 mb-4">
                {user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "??"}
            </div>

            <h3 className="text-lg font-semibold text-white mb-1">
                {user.displayName || "Usuario sin nombre"}
            </h3>
            <p className="text-sm text-gray-500 mb-4 break-all">
                {user.email}
            </p>

            <div className={`
                inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border mb-4
                ${isSuperAdmin
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    : isAdmin
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-gray-800 text-gray-400 border-gray-700'}
            `}>
                {isSuperAdmin ? <ShieldCheck className="w-3 h-3" /> : isAdmin ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                {isSuperAdmin ? 'Superadmin' : isAdmin ? 'Administrador' : 'Jugador'}
            </div>

            {/* Debt Section */}
            {selectedGroupId && (
                <div className="w-full mt-auto pt-4 border-t border-gray-800">
                    <div className="flex items-center justify-between mb-3 px-2">
                        <span className="text-xs text-gray-500 uppercase tracking-widest">Saldo</span>
                        <span className={`text-lg font-bold ${hasDebt ? 'text-red-500' : hasCredit ? 'text-green-500' : 'text-gray-400'}`}>
                            {debt.toFixed(2)} €
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => onSettle(user.id, debt)}
                            disabled={debt === 0}
                            className="flex items-center justify-center gap-1 py-2 bg-green-600/10 hover:bg-green-600/20 text-green-500 border border-green-600/20 rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Wallet className="w-3 h-3" />
                            Saldar
                        </button>
                        <button
                            onClick={() => onAdjust(user.id)}
                            className="flex items-center justify-center gap-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-xs font-bold transition-all"
                        >
                            <DollarSign className="w-3 h-3" />
                            Ajustar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function UsersPage() {
    const { user, userData, loading } = useAuthContext();
    const router = useRouter();
    const [users, setUsers] = useState<(AppUserCustomData & { id: string })[]>([]);
    const [fetching, setFetching] = useState(true);

    // Group Selector State
    const [groups, setGroups] = useState<GroupSummary[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    // Modal States
    const [settleModal, setSettleModal] = useState<{ isOpen: boolean, userId: string, debt: number }>({ isOpen: false, userId: '', debt: 0 });
    const [adjustModal, setAdjustModal] = useState<{ isOpen: boolean, userId: string, userName: string }>({ isOpen: false, userId: '', userName: '' });

    // ... (useEffect for groups remains)
    // ... (useEffect for users remains)

    // Handlers that OPEN modals
    const handleSettleClick = (userId: string, currentDebt: number) => {
        setSettleModal({ isOpen: true, userId, debt: currentDebt });
    };

    const handleAdjustClick = (userId: string) => {
        const u = users.find(u => u.id === userId);
        setAdjustModal({ isOpen: true, userId, userName: u?.displayName || 'Usuario' });
    };

    // Actual Execution Handlers (Confirms)
    const confirmSettleDebt = async () => {
        const { userId, debt } = settleModal;
        if (!selectedGroupId || !user || !userData) return;

        try {
            await PaymentService.settleDebt(
                { uid: user.uid, role: userData.role, displayName: userData.displayName || 'Admin' } as any,
                { id: userId } as any,
                selectedGroupId
            );
            toast.success("Deuda saldada.");
            setUsers(prev => prev.map(u => {
                if (u.id === userId) {
                    return { ...u, groupDebts: { ...u.groupDebts, [selectedGroupId]: 0 } };
                }
                return u;
            }));
        } catch (e) {
            console.error(e);
            toast.error("Error al saldar deuda.");
        }
    };

    const confirmAdjustDebt = async (amount: number, reason: string) => {
        const { userId } = adjustModal;
        if (!selectedGroupId || !user || !userData) return;

        try {
            await PaymentService.adjustDebt(
                { uid: user.uid, role: userData.role, displayName: userData.displayName || 'Admin' } as any,
                { id: userId } as any,
                selectedGroupId,
                amount,
                'ADJUSTMENT',
                reason
            );
            toast.success("Saldo ajustado.");
            setUsers(prev => prev.map(u => {
                if (u.id === userId) {
                    const old = u.groupDebts?.[selectedGroupId] || 0;
                    return { ...u, groupDebts: { ...u.groupDebts, [selectedGroupId]: old + amount } };
                }
                return u;
            }));
        } catch (e) {
            console.error(e);
            toast.error("Error al ajustar.");
        }
    };


    if (loading || fetching) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white selection:bg-green-500/30">
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Directorio de Jugadores</h1>
                        <p className="text-gray-400">
                            {users.length} usuarios encontrados
                        </p>
                    </div>

                    {/* Group Selector */}
                    {/* Group Selector & Actions */}
                    {groups.length > 0 && (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
                                <label className="text-sm font-medium text-gray-400">Gestionando:</label>
                                <select
                                    value={selectedGroupId || ''}
                                    onChange={(e) => setSelectedGroupId(e.target.value)}
                                    className="bg-transparent text-white text-sm focus:outline-none"
                                >
                                    <option value="" disabled>Selecciona...</option>
                                    {userData?.role === 'superadmin' && (
                                        <option value="ALL">Vista Global</option>
                                    )}
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedGroupId && selectedGroupId !== 'ALL' && (
                                <button
                                    onClick={() => setShowHistory(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/20 rounded-lg text-sm font-bold transition-all"
                                >
                                    <History className="w-4 h-4" />
                                    Ver Historial
                                </button>
                            )}
                        </div>
                    )}

                    {showHistory && selectedGroupId && selectedGroupId !== 'ALL' && (
                        <HistoryModal groupId={selectedGroupId} onClose={() => setShowHistory(false)} />
                    )}
                    {userData?.role === 'superadmin' && (
                        <div className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-wider rounded-lg border border-purple-500/20">
                            Vista Global
                        </div>
                    )}
                </div>

                {users.length === 0 ? (
                    <div className="bg-gray-900/50 border border-gray-800 border-dashed rounded-xl p-12 text-center text-gray-500">
                        No se encontraron usuarios.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {users.map(u => (
                            <UserCard
                                key={u.id}
                                user={u}
                                selectedGroupId={selectedGroupId === 'ALL' ? null : selectedGroupId}
                                onSettle={handleSettleClick}
                                onAdjust={handleAdjustClick}
                            />
                        ))}
                    </div>
                )}

            </main>

            {/* Modals */}
            <ConfirmationModal
                isOpen={settleModal.isOpen}
                onClose={() => setSettleModal({ ...settleModal, isOpen: false })}
                onConfirm={confirmSettleDebt}
                title="Saldar Deuda"
                message={`¿Confirmas que se ha pagado la deuda de ${settleModal.debt.toFixed(2)}€?`}
                confirmText="Saldar"
                type="info"
            />

            <AdjustDebtModal
                isOpen={adjustModal.isOpen}
                onClose={() => setAdjustModal({ ...adjustModal, isOpen: false })}
                onConfirm={confirmAdjustDebt}
                userName={adjustModal.userName}
            />
        </div>
    );
}
