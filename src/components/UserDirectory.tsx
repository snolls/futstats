'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, documentId, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUserCustomData } from '@/types/user';
import { User as UserIcon, Shield, ShieldCheck, Trash2, LayoutGrid, List as ListIcon, Banknote, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import clsx from 'clsx';
import UserDetailModal from './UserDetailModal';
import ConfirmationModal from './ConfirmationModal';
import UserCard, { UserActions } from './UserCard';

interface UserDirectoryProps {
    currentUser: { uid: string, role?: string, displayName?: string | null };
}

interface EnrichedUser extends AppUserCustomData {
    id: string;
    totalDebt: number; // manualDebt + pendingMatches
    pendingMatchCount: number;
}

export default function UserDirectory({ currentUser }: UserDirectoryProps) {
    const [users, setUsers] = useState<EnrichedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [showDebtorsOnly, setShowDebtorsOnly] = useState(false);

    // Modal State
    const [selectedUserForDetail, setSelectedUserForDetail] = useState<EnrichedUser | null>(null);

    const [confirmationState, setConfirmationState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'danger' | 'info';
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'info', onConfirm: () => { } });

    const fetchUsers = async () => {
        // Keep loading silent if we are just refreshing data after an action
        // But initially true
        if (users.length === 0) setLoading(true);

        try {
            let usersList: (AppUserCustomData & { id: string })[] = [];

            // 1. Fetch Users
            if (currentUser.role === 'superadmin') {
                const q = query(collection(db, "users"));
                const snap = await getDocs(q);
                usersList = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUserCustomData & { id: string }));
            } else {
                // Admin: Fetch Group Members
                const groupsQ = query(collection(db, "groups"), where("adminIds", "array-contains", currentUser.uid));
                const groupsSnap = await getDocs(groupsQ);

                const memberSet = new Set<string>();
                groupsSnap.forEach(doc => {
                    const data = doc.data();
                    const members = data.members || [];
                    const admins = data.adminIds || [];
                    members.forEach((m: string) => memberSet.add(m));
                    admins.forEach((a: string) => memberSet.add(a));
                });

                const uids = Array.from(memberSet);

                if (uids.length > 0) {
                    const chunkSize = 10;
                    for (let i = 0; i < uids.length; i += chunkSize) {
                        const chunk = uids.slice(i, i + chunkSize);
                        const q = query(collection(db, "users"), where(documentId(), "in", chunk));
                        const snap = await getDocs(q);
                        snap.forEach(d => {
                            usersList.push({ id: d.id, ...d.data() } as AppUserCustomData & { id: string });
                        });
                    }
                }
            }

            // 2. Calculate Debt
            const enrichedUsers: EnrichedUser[] = [];
            if (usersList.length > 0) {
                const userIds = usersList.map(u => u.id);
                const pendingStatsMap: Record<string, { count: number, matchIds: Set<string> }> = {};
                const chunkSize = 10;
                const allMatchIds = new Set<string>();

                for (let i = 0; i < userIds.length; i += chunkSize) {
                    const chunk = userIds.slice(i, i + chunkSize);
                    const q = query(collection(db, "match_stats"), where("userId", "in", chunk), where("paymentStatus", "==", "PENDING"));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        const data = doc.data();
                        const uid = data.userId;
                        if (!pendingStatsMap[uid]) pendingStatsMap[uid] = { count: 0, matchIds: new Set() };
                        pendingStatsMap[uid].count++;
                        pendingStatsMap[uid].matchIds.add(data.matchId);
                        allMatchIds.add(data.matchId);
                    });
                }

                const matchPriceMap: Record<string, number> = {};
                const matchIdsArray = Array.from(allMatchIds);
                for (let i = 0; i < matchIdsArray.length; i += chunkSize) {
                    const chunk = matchIdsArray.slice(i, i + chunkSize);
                    if (chunk.length > 0) {
                        const q = query(collection(db, "matches"), where(documentId(), "in", chunk));
                        const snap = await getDocs(q);
                        snap.forEach(doc => {
                            matchPriceMap[doc.id] = doc.data().pricePerPlayer || 0;
                        });
                    }
                }

                usersList.forEach(u => {
                    const manual = u.manualDebt || 0;
                    let pendingVal = 0;
                    let pendingCount = 0;

                    if (pendingStatsMap[u.id]) {
                        pendingCount = pendingStatsMap[u.id].count;
                        pendingStatsMap[u.id].matchIds.forEach(mid => {
                            pendingVal += (matchPriceMap[mid] || 0);
                        });
                    }

                    enrichedUsers.push({
                        ...u,
                        totalDebt: manual + pendingVal,
                        pendingMatchCount: pendingCount
                    });
                });
            }

            enrichedUsers.sort((a, b) => {
                const roleScore = (r: string) => r === 'superadmin' ? 3 : r === 'admin' ? 2 : 1;
                return roleScore(b.role) - roleScore(a.role);
            });

            setUsers(enrichedUsers);

            // If a user is selected, ensure their data is updated in the modal logic
            if (selectedUserForDetail) {
                const updated = enrichedUsers.find(u => u.id === selectedUserForDetail.id);
                if (updated) setSelectedUserForDetail(updated);
            }

        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [currentUser]);

    const confirmAction = (title: string, message: string, type: 'danger' | 'info', action: () => void) => {
        setConfirmationState({
            isOpen: true,
            title,
            message,
            type,
            onConfirm: action
        });
    };

    const handleDeleteUser = async (userId: string) => {
        confirmAction(
            "Eliminar Usuario",
            "¿Estás seguro de que deseas eliminar este usuario? Esta acción es irreversible y eliminará todos sus datos.",
            'danger',
            async () => {
                try {
                    await deleteDoc(doc(db, "users", userId));
                    setUsers(prev => prev.filter(u => u.id !== userId));
                } catch (error) {
                    console.error("Error deleting user:", error);
                }
            }
        );
    };

    const handleUpdateRole = async (userId: string, newRole: 'admin' | 'user' | 'superadmin') => {
        confirmAction(
            "Actualizar Rol",
            `¿Confirmas el cambio de rol a ${newRole.toUpperCase()} para este usuario?`,
            'info',
            async () => {
                try {
                    await updateDoc(doc(db, "users", userId), { role: newRole });
                    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
                } catch (error) {
                    console.error("Error updating role:", error);
                }
            }
        );
    };

    // Replace old Adjust Debt with Open Detail Modal
    const openUserDetail = (user: EnrichedUser) => {
        setSelectedUserForDetail(user);
    };

    if (loading && users.length === 0) return <div className="text-center py-10 text-gray-400">Cargando usuarios...</div>;

    const filteredUsers = showDebtorsOnly ? users.filter(u => u.totalDebt > 0) : users;

    return (
        <div className="space-y-6">
            {/* Modals */}
            {selectedUserForDetail && (
                <UserDetailModal
                    isOpen={!!selectedUserForDetail}
                    onClose={() => setSelectedUserForDetail(null)}
                    user={selectedUserForDetail}
                    onUpdate={fetchUsers}
                />
            )}

            <ConfirmationModal
                isOpen={confirmationState.isOpen}
                onClose={() => setConfirmationState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmationState.onConfirm}
                title={confirmationState.title}
                message={confirmationState.message}
                type={confirmationState.type}
            />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white">Directorio de Jugadores</h2>
                    <p className="text-sm text-gray-400">
                        {users.length} usuarios encontrados
                        {showDebtorsOnly && <span className="text-amber-500 font-bold ml-1">({filteredUsers.length} con deuda)</span>}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none bg-gray-900 border border-gray-800 px-3 py-2 rounded-lg hover:border-gray-700 transition-colors">
                        <input
                            type="checkbox"
                            checked={showDebtorsOnly}
                            onChange={e => setShowDebtorsOnly(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500/20 bg-gray-800"
                        />
                        <span className={clsx("text-sm font-medium", showDebtorsOnly ? "text-white" : "text-gray-400")}>
                            Solo Deudores
                        </span>
                    </label>

                    <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={clsx("p-2 rounded-md transition-colors", viewMode === 'grid' ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300")}
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={clsx("p-2 rounded-md transition-colors", viewMode === 'list' ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300")}
                        >
                            <ListIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredUsers.map(u => (
                        <UserCard
                            key={u.id}
                            user={u}
                            currentUser={currentUser}
                            onDelete={handleDeleteUser}
                            onRoleUpdate={handleUpdateRole}
                            onOpenDetail={() => openUserDetail(u)}
                        />
                    ))}
                </div>
            ) : (
                <div className="w-full overflow-x-auto bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl max-w-full">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider bg-gray-900/50">
                                <th className="p-4 font-medium">Usuario</th>
                                <th className="p-4 font-medium">Email</th>
                                <th className="p-4 font-medium">Rol</th>
                                <th className="p-4 font-medium">Estado de Cuenta</th>
                                <th className="p-4 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {filteredUsers.map(u => (
                                <UserRow
                                    key={u.id}
                                    user={u}
                                    currentUser={currentUser}
                                    onDelete={handleDeleteUser}
                                    onRoleUpdate={handleUpdateRole}
                                    onOpenDetail={() => openUserDetail(u)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// --- SUB-COMPONENTS ---

// --- SUB-COMPONENTS MOVED TO UserCard.tsx ---

function UserRow({ user, currentUser, onDelete, onRoleUpdate, onOpenDetail }: any) {
    const RoleIcon = user.role === 'superadmin' ? ShieldCheck : user.role === 'admin' ? Shield : UserIcon;
    const debt = user.totalDebt || 0;
    const pendingMatches = user.pendingMatchCount || 0;
    const isDebtor = debt > 0;

    return (
        <tr
            onClick={onOpenDetail}
            className={clsx(
                "transition-colors border-l-2 cursor-pointer",
                isDebtor ? "bg-red-900/5 hover:bg-red-900/10 border-red-500" : "hover:bg-gray-900/30 border-transparent"
            )}>
            <td className="p-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center text-xs font-bold text-gray-500 border border-gray-800">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt={user.displayName} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <span>{user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "??"}</span>
                        )}
                    </div>
                    <div>
                        <span className="text-sm font-medium text-white block group-hover:text-blue-400">{user.displayName || "Sin Nombre"}</span>
                        {isDebtor && <span className="text-[10px] text-red-400 font-bold">PAGOS PENDIENTES</span>}
                    </div>
                </div>
            </td>
            <td className="p-4 text-sm text-gray-400">{user.email}</td>
            <td className="p-4">
                <div className="flex items-center gap-2 text-xs text-gray-300">
                    <RoleIcon className="w-3 h-3" />
                    <span className="capitalize">{user.role}</span>
                </div>
            </td>
            <td className="p-4">
                {debt !== 0 ? (
                    <div className="flex flex-col">
                        <span className={clsx("text-sm font-bold flex items-center gap-1", isDebtor ? "text-red-500" : "text-green-500")}>
                            {isDebtor ? '-' : '+'}{Math.abs(debt).toFixed(2)}€
                        </span>
                        {pendingMatches > 0 && <span className="text-[10px] text-gray-500">{pendingMatches} partidos por pagar</span>}
                    </div>
                ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-800/50 px-2 py-1 rounded w-fit">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        Al día
                    </span>
                )}
            </td>
            <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                <UserActions
                    user={user}
                    currentUser={currentUser}
                    onDelete={onDelete}
                    onRoleUpdate={onRoleUpdate}
                    onOpenDetail={onOpenDetail}
                />
            </td>
        </tr>
    );
}
