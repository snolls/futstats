'use client';

import { useState, useEffect } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PLAYER_POSITIONS, PlayerPosition } from '@/types/user';
import { Trophy, Check, UserIcon, Activity } from 'lucide-react';

export default function OnboardingModal({ forceOpen }: { forceOpen?: boolean }) {
    const { user, userData } = useAuthContext();
    const [isVisible, setIsVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);

    // Form State
    const [nickname, setNickname] = useState('');
    const [position, setPosition] = useState<PlayerPosition>('CM');
    const [strongFoot, setStrongFoot] = useState<'right' | 'left' | 'ambidextrous'>('right');

    useEffect(() => {
        if (forceOpen) {
            setIsVisible(true);
            return;
        }

        // Show only if user is logged in, data is loaded, and onboarding is NOT completed
        if (user && userData) {
            if (userData.onboardingCompleted === false || userData.onboardingCompleted === undefined) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        }
    }, [user, userData, forceOpen]);

    const handleSubmit = async () => {
        if (!user) return;
        if (!nickname.trim()) {
            alert("Por favor elige un apodo.");
            return;
        }

        setLoading(true);
        try {
            // Use setDoc with merge to ensure document creation if it doesn't exist (e.g. Google Auth first time)
            await setDoc(doc(db, 'users', user.uid), {
                nickname: nickname.trim(),
                position,
                strongFoot,
                onboardingCompleted: true,
                email: user.email,
                displayName: user.displayName || nickname.trim(),
                role: userData?.role || 'user', // Preserve role if exists, else default to user
                photoURL: user.photoURL,
                updatedAt: new Date()
            }, { merge: true });

            // The listener in AuthContext should update userData, causing the modal to close via useEffect
            setIsVisible(false);
        } catch (error) {
            console.error("Error saving profile:", error);
            alert("Error al guardar perfil. Intenta de nuevo.");
        } finally {
            setLoading(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with heavy blur and block */}
            <div className="absolute inset-0 bg-gray-950/90 backdrop-blur-xl" />

            <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-8 pb-4 text-center">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-900/40">
                        <Trophy className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">¡Completa tu Ficha!</h2>
                    <p className="text-gray-400 text-sm">
                        Para participar en las estadísticas, necesitamos conocer tu perfil de jugador.
                    </p>
                </div>

                {/* Scrollable Content */}
                <div className="p-8 pt-2 overflow-y-auto space-y-6 custom-scrollbar">

                    {/* Nickname */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                            <UserIcon className="w-4 h-4 text-green-500" />
                            Apodo / Nombre de Camiseta
                        </label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="Ej. La Pulga"
                            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-green-500/50 outline-none transition-all placeholder:text-gray-600"
                            maxLength={20}
                        />
                        <p className="text-xs text-gray-500">Así aparecerás en las tablas de clasificación.</p>
                    </div>

                    {/* Position Grid */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-500" />
                            Posición Principal
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(PLAYER_POSITIONS).map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setPosition(key as PlayerPosition)}
                                    className={`
                                        p-2 rounded-lg text-xs font-medium border transition-all text-center
                                        ${position === key
                                            ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm'
                                            : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700 hover:bg-gray-800'}
                                    `}
                                >
                                    <span className="block font-bold mb-0.5 text-sm">{key}</span>
                                    <span className="opacity-70 text-[10px] truncate">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Strong Foot */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-300">Pierna Hábil</label>
                        <div className="flex bg-gray-950 p-1 rounded-xl border border-gray-800">
                            {(['left', 'right', 'ambidextrous'] as const).map((foot) => (
                                <button
                                    key={foot}
                                    onClick={() => setStrongFoot(foot)}
                                    className={`
                                        flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize
                                        ${strongFoot === foot
                                            ? 'bg-gray-800 text-white shadow-md'
                                            : 'text-gray-500 hover:text-gray-300'}
                                    `}
                                >
                                    {foot === 'left' ? 'Izquierda' : foot === 'right' ? 'Derecha' : 'Ambas'}
                                </button>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer Action */}
                <div className="p-8 pt-0 mt-auto">
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !nickname}
                        className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-900/20 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? 'Guardando...' : 'Completar Ficha'}
                        {!loading && <Check className="w-5 h-5" />}
                    </button>
                    {!nickname && <p className="text-center text-xs text-red-500/70 mt-2">El apodo es obligatorio</p>}
                </div>
            </div>
        </div>
    );
}
