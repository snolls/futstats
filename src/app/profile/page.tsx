"use client";

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useAuthContext } from '@/context/AuthContext';
import { UserService } from '@/services/UserService';
import { PLAYER_POSITIONS, PlayerPosition } from '@/types/user';
import { toast } from 'sonner';
import { Loader2, Save, Lock, User, Camera, AlertTriangle } from 'lucide-react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';

export default function ProfilePage() {
    const { user, userData, loading } = useAuthContext();
    const [saving, setSaving] = useState(false);

    // Form State
    const [displayName, setDisplayName] = useState("");
    const [nickname, setNickname] = useState("");
    const [position, setPosition] = useState<PlayerPosition | "">("");
    const [strongFoot, setStrongFoot] = useState<'right' | 'left' | 'ambidextrous' | "">("");
    const [photoURL, setPhotoURL] = useState("");

    // Password State
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    useEffect(() => {
        if (userData) {
            setDisplayName(userData.displayName || "");
            setNickname(userData.nickname || "");
            setPosition((userData.position as PlayerPosition) || "");
            setStrongFoot(userData.strongFoot || "");
            setPhotoURL(userData.photoURL || "");
        }
    }, [userData]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        try {
            setSaving(true);
            await UserService.updateUserProfile(user.uid, {
                displayName,
                nickname,
                position: position || undefined,
                strongFoot: strongFoot || undefined,
                photoURL
            });
            toast.success("Perfil actualizado");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar perfil");
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) return;

        if (newPassword.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("Las contraseñas no coinciden");
            return;
        }

        try {
            setSaving(true);
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            toast.success("Contraseña actualizada exitosamente");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            console.error(error);
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                toast.error("Contraseña actual incorrecta");
            } else {
                toast.error("Error al cambiar contraseña");
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-green-500" />
            </div>
        );
    }

    if (!user) {
        return <div className="min-h-screen bg-gray-950 text-white p-8">No autorizado</div>;
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <Navbar />

            <main className="max-w-4xl mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
                    <User className="w-8 h-8 text-green-500" />
                    Mi Perfil
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Profile Data Column */}
                    <div className="space-y-6">
                        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
                            <h2 className="text-xl font-bold mb-6 text-gray-200">Datos Personales</h2>
                            <form onSubmit={handleSaveProfile} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Nombre Visible</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500 transition-all"
                                        placeholder="Tu nombre completo"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Apodo (Opcional)</label>
                                    <input
                                        type="text"
                                        value={nickname}
                                        onChange={(e) => setNickname(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500 transition-all"
                                        placeholder="Cómo te dicen en la cancha"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Posición</label>
                                        <select
                                            value={position}
                                            onChange={(e) => setPosition(e.target.value as PlayerPosition)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500 transition-all appearance-none text-white"
                                        >
                                            <option value="">Selecciona...</option>
                                            {Object.entries(PLAYER_POSITIONS).map(([key, label]) => (
                                                <option key={key} value={key}>{label} ({key})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Pie Hábil</label>
                                        <select
                                            value={strongFoot}
                                            onChange={(e) => setStrongFoot(e.target.value as any)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500 transition-all appearance-none text-white"
                                        >
                                            <option value="">Selecciona...</option>
                                            <option value="right">Diestro</option>
                                            <option value="left">Zurdo</option>
                                            <option value="ambidextrous">Ambidiestro</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Foto URL</label>
                                    <div className="relative">
                                        <Camera className="absolute left-3 top-2.5 w-5 h-5 text-gray-600" />
                                        <input
                                            type="url"
                                            value={photoURL}
                                            onChange={(e) => setPhotoURL(e.target.value)}
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500 transition-all placeholder:text-gray-700"
                                            placeholder="https://..."
                                        />
                                    </div>
                                    {photoURL && (
                                        <div className="mt-2 w-16 h-16 rounded-full overflow-hidden border-2 border-gray-700 relative">
                                            <img src={photoURL} alt="Preview" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg shadow-green-900/20 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    Guardar Cambios
                                </button>
                            </form>
                        </section>
                    </div>

                    {/* Security Column */}
                    <div className="space-y-6">
                        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Lock className="w-24 h-24 text-red-500" />
                            </div>
                            <h2 className="text-xl font-bold mb-6 text-gray-200 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-red-500" />
                                Seguridad
                            </h2>

                            <form onSubmit={handleChangePassword} className="space-y-4 relative z-10">
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
                                    <h3 className="text-sm font-bold text-red-400 flex items-center gap-2 mb-1">
                                        <AlertTriangle className="w-4 h-4" />
                                        Zona Sensible
                                    </h3>
                                    <p className="text-xs text-red-300/80">
                                        Para cambiar tu contraseña, necesitas ingresar tu contraseña actual.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Contraseña Actual</label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 transition-all"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Nueva Contraseña</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 transition-all"
                                        placeholder="Mínimo 6 caracteres"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Confirmar Nueva Contraseña</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 transition-all"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={saving || !currentPassword || !newPassword}
                                    className="w-full py-3 bg-red-600/10 hover:bg-red-600 hover:text-white text-red-500 font-bold rounded-lg border border-red-600/20 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                                    Cambiar Contraseña
                                </button>
                            </form>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
