"use client";

import { useState, useEffect } from "react";
import { getDocs, getDoc, collection, query, where, orderBy, deleteDoc, doc, updateDoc, writeBatch, arrayRemove, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppUserCustomData } from "@/types/user";
import { User as UserIcon, Shield, ShieldCheck, Trash2, LayoutGrid, List as ListIcon, Banknote, AlertTriangle, CheckCircle2, UserPlus, Search } from "lucide-react"; // UserPlus added
import clsx from "clsx";
import UserDetailModal from "./UserDetailModal";
import ConfirmationModal from "./ConfirmationModal";
import UserCard, { UserActions } from "./UserCard";
import CreateGuestModal from "./CreateGuestModal"; // Imported
import { toast } from "sonner";

interface UserDirectoryProps {
    currentUser: { uid: string; role?: string; displayName?: string | null };
}

interface GroupData {
    id: string;
    name: string;
    members?: string[];
    adminIds?: string[];
}

interface EnrichedUser extends AppUserCustomData {
    id: string;
    totalDebt: number; // manualDebt + pendingMatches
    pendingMatchCount: number;
}

export default function UserDirectory({ currentUser }: UserDirectoryProps) {
    const [users, setUsers] = useState<EnrichedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [showDebtorsOnly, setShowDebtorsOnly] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [groups, setGroups] = useState<GroupData[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string>("");

    // Guest States
    const [showGuests, setShowGuests] = useState(true);
    const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);

    // Modal State
    const [selectedUserForDetail, setSelectedUserForDetail] = useState<EnrichedUser | null>(null);

    const [confirmationState, setConfirmationState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: "danger" | "info";
        onConfirm: () => void;
    }>({ isOpen: false, title: "", message: "", type: "info", onConfirm: () => { } });

    const fetchUsers = async () => {
        if (users.length === 0) setLoading(true);

        try {
            let usersList: (AppUserCustomData & { id: string })[] = [];

            // 1. Fetch Users
            // 1. Fetch Users
            if (currentUser.role === "superadmin") {
                // Superadmin fetches ALL groups and ALL users
                const groupsQ = query(collection(db, "groups"));
                const groupsSnap = await getDocs(groupsQ);
                const loadedGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as GroupData));
                setGroups(loadedGroups);

                const q = query(collection(db, "users"));
                const snap = await getDocs(q);
                usersList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppUserCustomData & { id: string }));
            } else {
                // Admin: Fetch Groups where I am Admin
                const groupsQ = query(collection(db, "groups"), where("adminIds", "array-contains", currentUser.uid));
                const groupsSnap = await getDocs(groupsQ);
                const loadedGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as GroupData));
                setGroups(loadedGroups);

                const memberSet = new Set<string>();
                const myGroupIds: string[] = [];

                loadedGroups.forEach((group) => {
                    myGroupIds.push(group.id);
                    const members = group.members || [];
                    const admins = group.adminIds || [];
                    members.forEach((m: string) => memberSet.add(m));
                    admins.forEach((a: string) => memberSet.add(a));
                });

                // Fetch Regular Members
                const uids = Array.from(memberSet);
                if (uids.length > 0) {
                    const chunkSize = 10;
                    for (let i = 0; i < uids.length; i += chunkSize) {
                        const chunk = uids.slice(i, i + chunkSize);
                        const q = query(collection(db, "users"), where(documentId(), "in", chunk));
                        const snap = await getDocs(q);
                        snap.forEach((d) => {
                            usersList.push({ id: d.id, ...d.data() } as AppUserCustomData & { id: string });
                        });
                    }
                }

                // Fetch Users/Guests associated with these groups (via associatedGroups field)
                // Note: array-contains-any limits to 10 values. If an admin has > 10 groups, we chunk requests.
                if (myGroupIds.length > 0) {
                    const groupChunks = [];
                    for (let i = 0; i < myGroupIds.length; i += 10) {
                        groupChunks.push(myGroupIds.slice(i, i + 10));
                    }

                    for (const chunk of groupChunks) {
                        const guestQ = query(collection(db, "users"), where("associatedGroups", "array-contains-any", chunk));
                        const guestSnap = await getDocs(guestQ);
                        guestSnap.forEach((d) => {
                            // Avoid duplicates
                            if (!usersList.find(u => u.id === d.id)) {
                                usersList.push({ id: d.id, ...d.data() } as AppUserCustomData & { id: string });
                            }
                        });
                    }
                }
            }

            // 2. Calculate Debt
            const enrichedUsers: EnrichedUser[] = [];
            if (usersList.length > 0) {
                const userIds = usersList.map((u) => u.id);
                const pendingStatsMap: Record<string, { count: number; matchIds: Set<string> }> = {};
                const chunkSize = 10;
                const allMatchIds = new Set<string>();

                for (let i = 0; i < userIds.length; i += chunkSize) {
                    const chunk = userIds.slice(i, i + chunkSize);
                    const q = query(collection(db, "match_stats"), where("userId", "in", chunk), where("paymentStatus", "==", "PENDING"));
                    const snap = await getDocs(q);
                    snap.forEach((doc) => {
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
                        snap.forEach((doc) => {
                            matchPriceMap[doc.id] = doc.data().pricePerPlayer || 0;
                        });
                    }
                }

                usersList.forEach((u) => {
                    const manual = u.manualDebt || 0;
                    let pendingVal = 0;
                    let pendingCount = 0;

                    if (pendingStatsMap[u.id]) {
                        pendingCount = pendingStatsMap[u.id].count;
                        pendingStatsMap[u.id].matchIds.forEach((mid) => {
                            pendingVal += matchPriceMap[mid] || 0;
                        });
                    }

                    enrichedUsers.push({
                        ...u,
                        totalDebt: manual + pendingVal,
                        pendingMatchCount: pendingCount,
                    });
                });
            }

            enrichedUsers.sort((a, b) => {
                const roleScore = (r: string) => (r === "superadmin" ? 3 : r === "admin" ? 2 : 1);
                return roleScore(b.role) - roleScore(a.role);
            });

            setUsers(enrichedUsers);

            if (selectedUserForDetail) {
                const updated = enrichedUsers.find((u) => u.id === selectedUserForDetail.id);
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

    const confirmAction = (title: string, message: string, type: "danger" | "info", action: () => void) => {
        setConfirmationState({
            isOpen: true,
            title,
            message,
            type,
            onConfirm: action,
        });
    };

    const handleDeleteUser = async (userId: string) => {
        const userToDelete = users.find(u => u.id === userId);
        if (currentUser.role !== 'superadmin' && userToDelete?.role !== 'guest') {
            toast.error("No tienes permisos para eliminar usuarios registrados.");
            return;
        }

        confirmAction(
            "Eliminar Usuario",
            "¿Estás seguro de que deseas eliminar este usuario? Esta acción es irreversible y eliminará todos sus datos, incluyendo estadísticas y membresías.",
            "danger",
            async () => {
                try {
                    const batch = writeBatch(db);

                    // 1. Fetch Fresh User Data (to ensure we have all associatedGroups)
                    const userRef = doc(db, "users", userId);
                    const userSnap = await getDoc(userRef);

                    if (!userSnap.exists()) {
                        setUsers((prev) => prev.filter((u) => u.id !== userId));
                        return; // User already gone
                    }

                    const userData = userSnap.data();
                    const associatedGroups = userData?.associatedGroups || [];

                    // 2. Remove from Groups (Cleanup References)
                    if (associatedGroups.length > 0) {
                        associatedGroups.forEach((groupId: string) => {
                            const groupRef = doc(db, "groups", groupId);
                            batch.update(groupRef, {
                                members: arrayRemove(userId),
                                adminIds: arrayRemove(userId)
                            });
                        });
                    }

                    // 3. Delete Stats
                    const statsQ = query(collection(db, "match_stats"), where("userId", "==", userId));
                    const statsSnap = await getDocs(statsQ);
                    statsSnap.docs.forEach(statDoc => {
                        batch.delete(statDoc.ref);
                    });

                    // 4. Delete Requests
                    const requestsQ = query(collection(db, "group_requests"), where("userId", "==", userId));
                    const requestsSnap = await getDocs(requestsQ);
                    requestsSnap.docs.forEach(reqDoc => {
                        batch.delete(reqDoc.ref);
                    });

                    // 5. Delete User Doc
                    batch.delete(userRef);

                    await batch.commit();

                    setUsers((prev) => prev.filter((u) => u.id !== userId));
                    toast.success("Usuario eliminado correctamente.");
                } catch (error) {
                    console.error("Error deleting user:", error);
                    toast.error("Hubo un error al eliminar el usuario.");
                }
            }
        );
    };

    const handleUpdateRole = async (userId: string, newRole: "admin" | "user" | "superadmin") => {
        confirmAction(
            "Actualizar Rol",
            `¿Confirmas el cambio de rol a ${newRole.toUpperCase()} para este usuario?`,
            "info",
            async () => {
                try {
                    await updateDoc(doc(db, "users", userId), { role: newRole });
                    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
                } catch (error) {
                    console.error("Error updating role:", error);
                }
            }
        );
    };

    const handleReviewRequest = async (userId: string, action: 'approve' | 'reject') => {
        confirmAction(
            action === 'approve' ? "Aprobar Admin" : "Rechazar Solicitud",
            `¿Estás seguro de que quieres ${action === 'approve' ? 'aprobar' : 'rechazar'} la solicitud de administrador?`,
            action === 'approve' ? "info" : "danger",
            async () => {
                try {
                    await updateDoc(doc(db, "users", userId), {
                        role: action === 'approve' ? 'admin' : 'user', // If rejected, explicitly ensure user role
                        adminRequestStatus: action === 'approve' ? null : 'rejected'
                    });

                    setUsers(prev => prev.map(u => {
                        if (u.id === userId) {
                            return {
                                ...u,
                                role: action === 'approve' ? 'admin' : u.role,
                                adminRequestStatus: action === 'approve' ? null : 'rejected'
                            };
                        }
                        return u;
                    }));
                } catch (error) {
                    console.error("Error managing request:", error);
                }
            }
        );
    };

    const handleEditGuest = async (user: any) => {
        // En una implementación ideal, usaríamos un modal bonito.
        // Por agilidad y como pide "Editar Nombre", usaremos prompt nativo o extender lógica.
        // Dado que no tengo un modal de edición simple listo, usaré prompt. 
        // Si el usuario quiere algo más complejo, lo refactorizamos luego.
        const newName = window.prompt("Nuevo nombre para el invitado:", user.displayName || "");

        if (newName && newName.trim() !== "" && newName !== user.displayName) {
            try {
                await updateDoc(doc(db, "users", user.id), { displayName: newName.trim() });
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, displayName: newName.trim() } : u));
            } catch (error) {
                console.error("Error renaming guest:", error);
                toast.error("Error al actualizar nombre.");
            }
        }
    };

    const openUserDetail = (user: EnrichedUser) => {
        setSelectedUserForDetail(user);
    };

    if (loading && users.length === 0) return <div className="text-center py-10 text-gray-400">Cargando usuarios...</div>;

    const filteredUsers = users.filter(u => {
        if (showDebtorsOnly && u.totalDebt <= 0) return false;
        if (!showGuests && (u.role === 'guest' || u.isGuest)) return false; // Robust check

        // Group Filter
        if (selectedGroupId) {
            // Check implicit membership via groups data
            const group = groups.find(g => g.id === selectedGroupId);
            const isMember = group?.members?.includes(u.id) || group?.adminIds?.includes(u.id);
            // Check explicit association via user data
            const isAssociated = u.associatedGroups?.includes(selectedGroupId);

            if (!isMember && !isAssociated) return false;
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const nameMatch = u.displayName?.toLowerCase().includes(term);
            const emailMatch = u.email?.toLowerCase().includes(term);
            if (!nameMatch && !emailMatch) return false;
        }

        return true;
    });

    return (
        <div className="space-y-6">
            <CreateGuestModal
                isOpen={isGuestModalOpen}
                onClose={() => setIsGuestModalOpen(false)}
                onGuestCreated={fetchUsers}
            />

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
                onClose={() => setConfirmationState((prev) => ({ ...prev, isOpen: false }))}
                onConfirm={confirmationState.onConfirm}
                title={confirmationState.title}
                message={confirmationState.message}
                type={confirmationState.type}
            />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        Directorio de Jugadores
                        <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                            Total: {users.length}
                        </span>
                    </h2>

                    {/* Group Selector */}
                    {groups.length > 0 && (
                        <select
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            className="mt-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:border-blue-500 outline-none w-full sm:w-auto"
                        >
                            <option value="">Todos mis grupos</option>
                            {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    )}

                    <p className="text-sm text-gray-400 mt-1">
                        {users.length} usuarios encontrados
                        {showDebtorsOnly && <span className="text-amber-500 font-bold ml-1">({filteredUsers.length} con deuda)</span>}
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {/* Search Input */}
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar jugador..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Botón Nuevo Invitado */}
                        <button
                            onClick={() => setIsGuestModalOpen(true)}
                            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-purple-900/20"
                        >
                            <UserPlus className="w-4 h-4" />
                            <span className="hidden sm:inline">Nuevo Invitado</span>
                        </button>

                        <div className="h-8 w-px bg-gray-800 mx-1 hidden sm:block"></div>

                        {/* Filtros */}
                        <label className="flex items-center gap-2 cursor-pointer select-none bg-gray-900 border border-gray-800 px-3 py-2 rounded-lg hover:border-gray-700 transition-colors">
                            <input
                                type="checkbox"
                                checked={showDebtorsOnly}
                                onChange={(e) => setShowDebtorsOnly(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 text-green-500 focus:ring-green-500/20 bg-gray-800"
                            />
                            <span className={clsx("text-sm font-medium", showDebtorsOnly ? "text-white" : "text-gray-400")}>
                                Solo Deudores
                            </span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer select-none bg-gray-900 border border-gray-800 px-3 py-2 rounded-lg hover:border-gray-700 transition-colors" title="Mostrar/Ocultar Invitados">
                            <input
                                type="checkbox"
                                checked={showGuests}
                                onChange={e => setShowGuests(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 text-purple-500 focus:ring-purple-500/20 bg-gray-800"
                            />
                            <span className={clsx("text-sm font-medium", showGuests ? "text-purple-400" : "text-gray-500")}>
                                Invitados
                            </span>
                        </label>

                        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode("grid")}
                                className={clsx("p-2 rounded-md transition-colors", viewMode === "grid" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300")}
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setViewMode("list")}
                                className={clsx("p-2 rounded-md transition-colors", viewMode === "list" ? "bg-gray-800 text-white" : "text-gray-500 hover:text-gray-300")}
                            >
                                <ListIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredUsers.map((u) => (
                        <UserCard
                            key={u.id}
                            user={u}
                            currentUser={currentUser}
                            onDelete={handleDeleteUser}
                            onRoleUpdate={handleUpdateRole}
                            onOpenDetail={() => openUserDetail(u)}
                            onEdit={handleEditGuest}
                            onReviewRequest={handleReviewRequest}
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
                            {filteredUsers.map((u) => (
                                <UserRow
                                    key={u.id}
                                    user={u}
                                    currentUser={currentUser}
                                    onDelete={handleDeleteUser}
                                    onRoleUpdate={handleUpdateRole}
                                    onOpenDetail={() => openUserDetail(u)}
                                    // @ts-ignore - Prop drilling simple
                                    onEdit={handleEditGuest}
                                    onReviewRequest={handleReviewRequest}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function UserRow({ user, currentUser, onDelete, onRoleUpdate, onOpenDetail }: any) {
    const RoleIcon = user.role === "superadmin" ? ShieldCheck : user.role === "admin" ? Shield : UserIcon;
    const debt = user.totalDebt || 0;
    const pendingMatches = user.pendingMatchCount || 0;
    const isDebtor = debt > 0.01;
    const isCreditor = debt < -0.01;

    return (
        <tr
            onClick={onOpenDetail}
            className={clsx(
                "transition-colors border-l-2 cursor-pointer",
                isDebtor ? "bg-red-900/5 hover:bg-red-900/10 border-red-500" : isCreditor ? "bg-emerald-900/5 hover:bg-emerald-900/10 border-emerald-500" : "hover:bg-gray-900/30 border-transparent"
            )}
        >
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
                        {isCreditor && <span className="text-[10px] text-emerald-400 font-bold">SALDO A FAVOR</span>}
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
                        <span className={clsx("text-sm font-bold flex items-center gap-1", isDebtor ? "text-red-500" : "text-emerald-500")}>
                            {isDebtor ? "-" : "+"}{Math.abs(debt).toFixed(2)}€
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
                <UserActions user={user} currentUser={currentUser} onDelete={onDelete} onRoleUpdate={onRoleUpdate} onOpenDetail={onOpenDetail} />
            </td>
        </tr>
    );
}
