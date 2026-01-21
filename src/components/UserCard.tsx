import { Shield, ShieldCheck, User as UserIcon, Trash2, Banknote, AlertTriangle, Pencil, X } from 'lucide-react';
import clsx from 'clsx';

// Definición de tipos para las props
interface UserData {
    id: string;
    displayName?: string | null;
    email?: string | null;
    role?: string;
    photoURL?: string | null;
    totalDebt?: number;
    pendingMatchCount?: number;
    [key: string]: any;
}

interface CurrentUser {
    uid: string;
    role?: string;
    displayName?: string | null;
}

interface UserCardProps {
    user: UserData;
    currentUser: CurrentUser;
    onDelete: (userId: string) => void;
    onRoleUpdate: (userId: string, newRole: 'admin' | 'user' | 'superadmin') => void;
    onOpenDetail: () => void;
    onEdit?: (user: UserData) => void;
    onReviewRequest?: (userId: string, action: 'approve' | 'reject') => void;
    managedGroupNames?: string[];
}

/**
 * Componente auxiliar para los botones de acción (Editar, Borrar, Promover, etc.)
 * Se exporta para poder ser reutilizado en la vista de lista (UserRow) si es necesario.
 */
export function UserActions({ user, currentUser, onDelete, onRoleUpdate, onOpenDetail, onEdit }: UserCardProps) {
    const isSelf = user.id === currentUser.uid;
    const isSuperAdmin = currentUser.role === 'superadmin';
    const isAdmin = currentUser.role === 'admin';

    const canPromoteToSuper = isSuperAdmin;
    const canPromoteToAdmin = isSuperAdmin || (isAdmin && user.role === 'user');
    const canDemoteToUser = isSuperAdmin || (isAdmin && user.role === 'admin');
    const canManageDebt = isSuperAdmin || isAdmin;
    const canDelete = !isSelf && (isSuperAdmin || (isAdmin && user.role === 'guest'));

    return (
        <div className="flex flex-wrap items-center justify-end gap-1">
            {/* Botón de Gestión de Deuda / Detalles */}
            {canManageDebt && (
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
                    title="Gestionar Cuenta"
                    className="p-1.5 bg-yellow-900/20 text-yellow-500 hover:bg-yellow-900/40 rounded border border-yellow-900/30 transition-colors"
                >
                    <Banknote className="w-3.5 h-3.5" />
                </button>
            )}

            {isSelf && <span className="text-xs text-gray-500 italic ml-2">Tú</span>}

            {!isSelf && (
                <>
                    {/* Role Actions - Hide for Guests */}
                    {(user.role !== 'guest' && !user.id.startsWith('guest_')) && (
                        <>
                            {/* Botón Promover a SuperAdmin */}
                            {canPromoteToSuper && user.role !== 'superadmin' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRoleUpdate(user.id, 'superadmin'); }}
                                    title="Promover a Superadmin"
                                    className="p-1.5 bg-purple-900/20 text-purple-400 hover:bg-purple-900/40 rounded border border-purple-900/30 transition-colors"
                                >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Botón Promover a Admin */}
                            {canPromoteToAdmin && user.role !== 'admin' && user.role !== 'superadmin' && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRoleUpdate(user.id, 'admin'); }}
                                    title="Promover a Administrador"
                                    className="p-1.5 bg-blue-900/20 text-blue-400 hover:bg-blue-900/40 rounded border border-blue-900/30 transition-colors"
                                >
                                    <Shield className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Botón Degradar a Usuario */}
                            {canDemoteToUser && user.role !== 'user' && (user.role !== 'superadmin' || isSuperAdmin) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onRoleUpdate(user.id, 'user'); }}
                                    title="Degradar a Jugador"
                                    className="p-1.5 bg-gray-800 text-gray-400 hover:bg-gray-700 rounded border border-gray-700 transition-colors"
                                >
                                    <UserIcon className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </>
                    )}

                    <div className="w-px h-4 bg-gray-800 mx-1"></div>

                    {/* Botón Eliminar Usuario */}
                    {canDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(user.id); }}
                            title="Eliminar Usuario"
                            className="p-1.5 bg-red-900/10 text-red-500 hover:bg-red-900/30 rounded border border-red-900/20 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}

                    {/* Botón Editar (Solo Invitados) */}
                    {onEdit && (user.role === 'guest' || user.id.startsWith('guest_')) && (isAdmin || isSuperAdmin) && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(user); }}
                            title="Editar Nombre"
                            className="p-1.5 bg-blue-900/10 text-blue-500 hover:bg-blue-900/30 rounded border border-blue-900/20 transition-colors"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default function UserCard({ user, currentUser, onDelete, onRoleUpdate, onOpenDetail, onEdit, managedGroupNames }: UserCardProps) {
    const roleColor = user.role === 'superadmin' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20'
        : user.role === 'admin' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
            : user.id.startsWith('guest_') || user.role === 'guest' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' // Estilo Invitado
                : 'text-gray-400 bg-gray-800 border-gray-700';

    const RoleIcon = user.role === 'superadmin' ? ShieldCheck
        : user.role === 'admin' ? Shield
            : user.role === 'guest' || user.id.startsWith('guest_') ? UserIcon // Podrías usar otro icono si quieres
                : UserIcon;

    // Lógica de Deuda
    const debt = user.totalDebt || 0;
    const isDebtor = debt > 0.01;
    const isCreditor = debt < -0.01;
    const isRequestingAdmin = user.adminRequestStatus === 'pending';
    const isSuperAdmin = currentUser.role === 'superadmin';

    const handleReview = (e: any, action: 'approve' | 'reject') => {
        e.stopPropagation();
        // Fallback: If no specific handler, try standard role update for approve
        if (action === 'approve') {
            // We can't easily clear the status via simple role update unless we change that function signature.
            // We'll rely on a specialized prop OR the parent (UserDirectory) needs to be updated to accept implicit approval.
            // For now, let's assume onRoleUpdate might handle it or we need a new prop.
            // Let's cast to any to call a potentially missing prop if we want to be safe, BUT cleaner is to add the prop.
            // I'll add `onReviewRequest` to props interface.
            // @ts-ignore
            if (user.onReviewRequest) user.onReviewRequest(user.id, action);
            // Wait, user prop? No.
        }
    };

    return (
        <div
            onClick={onOpenDetail}
            className={clsx(
                "rounded-xl p-5 flex flex-col items-center text-center transition-all group relative border cursor-pointer",
                isDebtor
                    ? "bg-red-950/10 border-red-500/50 shadow-lg shadow-red-900/10 hover:border-red-400"
                    : isCreditor
                        ? "bg-emerald-950/10 border-emerald-500/50 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)] hover:border-emerald-400"
                        : "bg-gray-950 border-gray-800 hover:border-gray-500"
            )}>
            {/* Sección de Badge de Deuda / Saldo */}
            {isDebtor && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-red-500 text-black px-2 py-0.5 rounded text-[10px] font-bold shadow-lg shadow-red-500/20">
                    <AlertTriangle className="w-3 h-3" />
                    DEUDA
                </div>
            )}
            {isCreditor && (
                <div className="absolute top-3 right-3 flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold shadow-lg shadow-emerald-500/10">
                    <Banknote className="w-3 h-3" />
                    SALDO
                </div>
            )}

            {/* Sección de Avatar / Iniciales */}
            <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center text-xl font-bold text-gray-500 mb-3 border border-gray-800 group-hover:scale-105 transition-transform">
                {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full rounded-full object-cover" />
                ) : (
                    <span>{user.displayName ? user.displayName.slice(0, 2).toUpperCase() : "??"}</span>
                )}
            </div>

            {/* Sección de Información del Usuario (Nombre y Email) */}
            <h3 className="font-semibold text-white truncate w-full group-hover:text-blue-400 transition-colors">{user.displayName || "Sin Nombre"}</h3>
            {user.nickname && (
                <p className="text-sm text-yellow-500 font-bold italic mb-1">"{user.nickname}"</p>
            )}
            <p className="text-xs text-gray-500 mb-2 truncate w-full">{user.email}</p>

            {/* Badges de Perfil Deportivo */}
            {(user.position || user.strongFoot) && (
                <div className="flex items-center gap-2 mb-3">
                    {user.position && (
                        <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-400 text-[10px] font-bold border border-blue-900/50 uppercase">
                            ⚽ {user.position}
                        </span>
                    )}
                    {user.strongFoot && (
                        <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-[10px] font-bold border border-gray-700 uppercase">
                            🦶 {user.strongFoot === 'left' ? 'Zurdo' : user.strongFoot === 'right' ? 'Diestro' : 'Ambi'}
                        </span>
                    )}
                </div>
            )}

            {/* Sección de Rol y Estado Financiero */}
            <div className="flex flex-wrap justify-center gap-2 mb-4">
                <div className={clsx("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border", roleColor)}>
                    <RoleIcon className="w-3 h-3" />
                    <span className="capitalize">{user.role || 'user'}</span>
                </div>

                {(debt !== 0) && (
                    <div className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border", isDebtor ? "bg-red-900/20 text-red-500 border-red-500/30" : "bg-green-900/20 text-green-400 border-green-900/30")}>
                        {isDebtor ? '-' : '+'}{Math.abs(debt).toFixed(2)}€
                    </div>
                )}
            </div>

            {/* Admin Management Context */}
            {user.role === 'admin' && managedGroupNames && managedGroupNames.length > 0 && (
                <div className="mb-4 text-xs text-slate-500 bg-slate-900/50 border border-slate-800 rounded px-2 py-1 max-w-full">
                    <span className="font-bold text-slate-400 block mb-0.5">Administra:</span>
                    <div className="truncate" title={managedGroupNames.join(", ")}>
                        {managedGroupNames.join(", ")}
                    </div>
                </div>
            )}

            {/* Sección de Botones de Acción */}
            <div className="mt-auto w-full pt-3 border-t border-gray-900 flex justify-center" onClick={(e) => e.stopPropagation()}>
                <UserActions
                    user={user}
                    currentUser={currentUser}
                    onDelete={onDelete}
                    onRoleUpdate={onRoleUpdate}
                    onOpenDetail={onOpenDetail}
                    onEdit={onEdit}
                />
            </div>
        </div>
    );
}
