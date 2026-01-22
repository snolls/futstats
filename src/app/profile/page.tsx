'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, User, Camera, Shield, Footprints } from 'lucide-react';
import Image from 'next/image';

export default function ProfilePage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    // Form States
    const [displayName, setDisplayName] = useState('');
    const [photoURL, setPhotoURL] = useState('');
    const [position, setPosition] = useState('Medio');
    const [foot, setFoot] = useState('Diestro');

    // UI States
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch User Data from Firestore (Source of Truth)
    useEffect(() => {
        const fetchUserData = async () => {
            if (authLoading) return;
            if (!user) {
                router.push('/login');
                return;
            }

            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setDisplayName(data.displayName || user.displayName || '');
                    setPhotoURL(data.photoURL || user.photoURL || '');
                    setPosition(data.position || 'Medio');
                    setFoot(data.foot || 'Diestro');
                } else {
                    // Fallback to Auth data if doc doesn't exist (edge case)
                    setDisplayName(user.displayName || '');
                    setPhotoURL(user.photoURL || '');
                }
            } catch (error) {
                console.error("Error fetching user data:", error);
                toast.error("Error al cargar datos del perfil.");
            } finally {
                setIsLoadingData(false);
            }
        };

        fetchUserData();
    }, [user, authLoading, router]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setIsSaving(true);
        try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                displayName,
                photoURL,
                position,
                foot,
                updatedAt: new Date(),
            });

            toast.success("Perfil actualizado correctamente");
            router.push('/'); // Or stay? User asked to redirect to Dashboard.
        } catch (error) {
            console.error("Error updating profile:", error);
            toast.error("Error al guardar los cambios.");
        } finally {
            setIsSaving(false);
        }
    };

    if (authLoading || isLoadingData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!user) return null; // Router will handle redirect

    return (
        <div className="min-h-screen bg-slate-950 px-4 py-8 md:py-12 flex items-center justify-center">
            <div className="w-full max-w-2xl">

                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
                        Editar Mi Perfil
                    </h1>
                    <p className="text-slate-400 text-sm md:text-base">
                        Personaliza cómo te ven los demás jugadores.
                    </p>
                </div>

                {/* Card */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl backdrop-blur-sm">
                    <form onSubmit={handleSave} className="space-y-6">

                        {/* Section: Avatar */}
                        <div className="flex flex-col items-center gap-4 mb-8">
                            <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-slate-800 bg-slate-950 overflow-hidden shadow-lg group">
                                {photoURL ? (
                                    <img
                                        src={photoURL}
                                        alt="Avatar Preview"
                                        className="w-full h-full object-cover transition-opacity group-hover:opacity-75"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = '';
                                            // Fallback logic handled by conditional render on re-render if cleared, 
                                            // but standard img onError just breaks image. 
                                            // Simple fix: If error, maybe show placeholder? 
                                            // For now, let's keep it simple.
                                        }}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                                        <User className="w-12 h-12" />
                                    </div>
                                )}
                            </div>
                            <div className="w-full max-w-sm">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                    URL de Foto (Avatar)
                                </label>
                                <div className="relative">
                                    <Camera className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={photoURL}
                                        onChange={(e) => setPhotoURL(e.target.value)}
                                        placeholder="https://ejemplo.com/tu-foto.jpg"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    />
                                </div>
                                <p className="text-[10px] text-slate-600 mt-1 ml-1">
                                    Pega un enlace directo a una imagen (jpg, png).
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Display Name */}
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                    Apodo / Nombre Visible
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        placeholder="Ej: Alex El Goleador"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Position */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                    Posición Favorita
                                </label>
                                <div className="relative">
                                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <select
                                        value={position}
                                        onChange={(e) => setPosition(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="Portero">Portero</option>
                                        <option value="Defensa">Defensa</option>
                                        <option value="Medio">Medio</option>
                                        <option value="Delantero">Delantero</option>
                                    </select>
                                </div>
                            </div>

                            {/* Foot */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                    Pierna Hábil
                                </label>
                                <div className="relative">
                                    <Footprints className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <select
                                        value={foot}
                                        onChange={(e) => setFoot(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="Diestro">Diestro</option>
                                        <option value="Zurdo">Zurdo</option>
                                        <option value="Ambidiestro">Ambidiestro</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-6 border-t border-slate-800 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Guardar Cambios
                                    </>
                                )}
                            </button>
                        </div>

                    </form>
                </div>
            </div>
        </div>
    );
}
