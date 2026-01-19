'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from '@/context/AuthContext';
import { AppUserCustomData } from '@/types/user';
import Navbar from '@/components/Navbar';
import { Shield, ShieldCheck, User } from 'lucide-react';

interface UserCardProps {
    user: AppUserCustomData & { id: string };
}

function UserCard({ user }: UserCardProps) {
    const isSuperAdmin = user.role === 'superadmin';
    const isAdmin = user.role === 'admin';

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col items-center text-center shadow-lg hover:border-gray-700 transition-colors">
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
                inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border
                ${isSuperAdmin
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    : isAdmin
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-gray-800 text-gray-400 border-gray-700'}
            `}>
                {isSuperAdmin ? <ShieldCheck className="w-3 h-3" /> : isAdmin ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                {isSuperAdmin ? 'Superadmin' : isAdmin ? 'Administrador' : 'Jugador'}
            </div>
        </div>
    );
}

export default function UsersPage() {
    const { user, userData, loading } = useAuthContext();
    const router = useRouter();
    const [users, setUsers] = useState<(AppUserCustomData & { id: string })[]>([]);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
            return;
        }

        if (!loading && userData) {
            // Strict Access Control
            if (userData.role !== 'admin' && userData.role !== 'superadmin') {
                router.push('/');
                return;
            }

            const fetchUsers = async () => {
                try {
                    setFetching(true);
                    let usersList: (AppUserCustomData & { id: string })[] = [];

                    if (userData.role === 'superadmin') {
                        // Superadmin: Fetch ALL
                        const q = query(collection(db, "users"));
                        const snap = await getDocs(q);
                        usersList = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUserCustomData & { id: string }));
                    } else {
                        // Admin: Fetch Group Members
                        const groupsQ = query(collection(db, "groups"), where("adminIds", "array-contains", user!.uid));
                        const groupsSnap = await getDocs(groupsQ);

                        const memberSet = new Set<string>();
                        groupsSnap.forEach(doc => {
                            // Fallback for legacy
                            const data = doc.data();
                            const members = data.members || data.adminIds || [];
                            members.forEach((m: string) => memberSet.add(m));
                        });

                        const uids = Array.from(memberSet);

                        if (uids.length > 0) {
                            // Chunk fetch
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

                    // Sort: Admins first, then Users
                    usersList.sort((a, b) => {
                        const roleScore = (r: string) => r === 'superadmin' ? 3 : r === 'admin' ? 2 : 1;
                        return roleScore(b.role) - roleScore(a.role);
                    });

                    setUsers(usersList);
                } catch (error) {
                    console.error("Error fetching users:", error);
                } finally {
                    setFetching(false);
                }
            };

            fetchUsers();
        }
    }, [user, userData, loading, router]);

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
                            {userData?.role === 'admin' && " (en tus grupos)"}
                        </p>
                    </div>
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
                            <UserCard key={u.id} user={u} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
