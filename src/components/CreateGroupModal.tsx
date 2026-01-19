'use client';

import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { collection, addDoc, getDocs, Timestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { AppUserCustomData } from '@/types/user';

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface UserOption {
    uid: string;
    email: string;
    displayName: string;
}

export default function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
    const { user } = useAuth();
    const [groupName, setGroupName] = useState('');
    const [adminSearch, setAdminSearch] = useState('');
    const [searchResults, setSearchResults] = useState<UserOption[]>([]);
    const [selectedAdmins, setSelectedAdmins] = useState<UserOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Search users functionality
    useEffect(() => {
        const searchUsers = async () => {
            if (adminSearch.length < 3) {
                setSearchResults([]);
                return;
            }

            const usersRef = collection(db, 'users');
            // Simple search by email prefix (Note: Firestore native search is limited)
            // For production, Algolia or MeiliSearch is recommended.
            // Here we'll fetch a batch and filter client-side for this demo or use exact email match

            try {
                // Trying to find by email
                const q = query(usersRef, where('email', '>=', adminSearch), where('email', '<=', adminSearch + '\uf8ff'));
                const querySnapshot = await getDocs(q);

                const users: UserOption[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data() as AppUserCustomData;
                    users.push({
                        uid: doc.id,
                        email: data.email || '',
                        displayName: data.displayName || 'Unknown'
                    });
                });
                setSearchResults(users);
            } catch (err) {
                console.error("Error searching users", err);
            }
        };

        const debounce = setTimeout(searchUsers, 500);
        return () => clearTimeout(debounce);
    }, [adminSearch]);

    const handleAddAdmin = (user: UserOption) => {
        if (!selectedAdmins.find(u => u.uid === user.uid)) {
            setSelectedAdmins([...selectedAdmins, user]);
        }
        setAdminSearch('');
        setSearchResults([]);
    };

    const handleRemoveAdmin = (uid: string) => {
        setSelectedAdmins(selectedAdmins.filter(u => u.uid !== uid));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupName) {
            setError("El nombre del grupo es obligatorio");
            return;
        }
        if (selectedAdmins.length === 0) {
            setError("Selecciona al menos un administrador");
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            await addDoc(collection(db, 'groups'), {
                name: groupName,
                adminIds: selectedAdmins.map(u => u.uid),
                createdBy: user?.uid,
                createdAt: Timestamp.now()
            });
            setSuccess('Grupo creado exitosamente');
            setGroupName('');
            setSelectedAdmins([]);
            setTimeout(() => {
                onClose();
                setSuccess('');
            }, 1500);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
                <div className="flex justify-between items-center p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">Crear Nuevo Grupo</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && <div className="bg-red-500/10 text-red-500 p-3 rounded text-sm border border-red-500/20">{error}</div>}
                    {success && <div className="bg-green-500/10 text-green-500 p-3 rounded text-sm border border-green-500/20">{success}</div>}

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Nombre del Grupo</label>
                        <input
                            type="text"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500 transition-colors"
                            placeholder="Ej: Liga de los Jueves"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Buscar Administrador (Email)</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={adminSearch}
                                onChange={(e) => setAdminSearch(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 pl-10 text-white focus:outline-none focus:border-green-500 transition-colors"
                                placeholder="buscar@email.com"
                            />
                            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                        </div>

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="mt-2 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 max-h-40 overflow-y-auto">
                                {searchResults.map(result => (
                                    <button
                                        key={result.uid}
                                        type="button"
                                        onClick={() => handleAddAdmin(result)}
                                        className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm text-gray-300 hover:text-white transition-colors border-b border-gray-700 last:border-0"
                                    >
                                        {result.email} ({result.displayName})
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected Admins */}
                    {selectedAdmins.length > 0 && (
                        <div className="space-y-2">
                            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Admins Seleccionados</span>
                            <div className="flex flex-wrap gap-2">
                                {selectedAdmins.map(admin => (
                                    <div key={admin.uid} className="flex items-center gap-2 bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-sm border border-blue-500/30">
                                        <span>{admin.email}</span>
                                        <button type="button" onClick={() => handleRemoveAdmin(admin.uid)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors mr-3"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white font-medium rounded-lg hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Creando...' : 'Crear Grupo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
