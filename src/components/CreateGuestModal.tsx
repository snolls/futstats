"use client";

import { useState } from "react";
import { X, UserPlus, Euro, Loader2 } from "lucide-react";
import { createGuestUser } from "@/lib/users";

interface CreateGuestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGuestCreated?: () => void;
}

export default function CreateGuestModal({ isOpen, onClose, onGuestCreated }: CreateGuestModalProps) {
    const [name, setName] = useState("");
    const [initialDebt, setInitialDebt] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);
        try {
            const debtValue = initialDebt ? parseFloat(initialDebt) : 0;

            await createGuestUser(name, debtValue);

            setName("");
            setInitialDebt("");
            if (onGuestCreated) onGuestCreated();
            onClose();
        } catch (error) {
            console.error("Error creating guest:", error);
            // Aquí podrías poner un estado de error visual si quieres
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl transform transition-all flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-purple-400" />
                        Nuevo Invitado
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Nombre / Alias</label>
                            <input
                                type="text"
                                placeholder="Ej: Primo de Alex"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all outline-none"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                <Euro className="w-4 h-4 text-gray-500" />
                                Deuda Inicial (Opcional)
                            </label>
                            <input
                                type="number"
                                placeholder="0.00"
                                step="0.5"
                                value={initialDebt}
                                onChange={(e) => setInitialDebt(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all outline-none"
                            />
                            <p className="text-xs text-gray-500">
                                Positivo = Debe dinero. Negativo = Saldo a Favor.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || isLoading}
                            className="px-6 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-lg shadow-purple-900/20 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                            Crear Invitado
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
