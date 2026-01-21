"use client";

import { useState } from "react";
import { X, Users, Loader2 } from "lucide-react";
import { collection, serverTimestamp, getDocs, query, where, writeBatch, doc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthContext } from "@/context/AuthContext";

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
    const { user } = useAuthContext();
    const [groupName, setGroupName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupName.trim() || !user) return;

        setIsLoading(true);
        setError(null);

        try {
            // Check for uniqueness
            const q = query(collection(db, "groups"), where("name", "==", groupName.trim()));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                setError("Ya existe un grupo con este nombre.");
                setIsLoading(false);
                return;
            }

            const batch = writeBatch(db);
            const groupRef = doc(collection(db, "groups"));
            const userRef = doc(db, "users", user.uid);

            const newGroup = {
                name: groupName.trim(),
                adminIds: [user.uid],
                members: [user.uid],
                createdAt: serverTimestamp(),
            };

            batch.set(groupRef, newGroup);
            batch.update(userRef, {
                associatedGroups: arrayUnion(groupRef.id)
            });

            await batch.commit();
            setGroupName("");
            onClose();
        } catch (err) {
            console.error("Error creating group:", err);
            setError("Failed to create group. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-[95vw] max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl transform transition-all flex flex-col max-h-[85vh] overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-slate-800">
                    <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-500" />
                        Crear Nuevo Grupo
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="groupName" className="text-sm font-medium text-slate-300">
                            Nombre del Grupo
                        </label>
                        <input
                            id="groupName"
                            type="text"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder="Ej: Liga de los Domingos"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                            autoFocus
                        />
                    </div>

                    <div className="pt-2 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !groupName.trim()}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Crear Grupo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
