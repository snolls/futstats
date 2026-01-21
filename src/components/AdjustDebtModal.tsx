"use client";

import { useState } from 'react';
import { X, DollarSign, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AdjustDebtModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (amount: number, reason: string) => Promise<void>;
    userName: string;
}

export default function AdjustDebtModal({ isOpen, onClose, onConfirm, userName }: AdjustDebtModalProps) {
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const val = parseFloat(amount);
        if (isNaN(val)) {
            toast.error("Ingresa un monto válido");
            return;
        }
        if (!reason.trim()) {
            toast.error("Ingresa un motivo");
            return;
        }

        try {
            setIsLoading(true);
            await onConfirm(val, reason);
            onClose();
            setAmount("");
            setReason("");
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 transform transition-all">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-blue-500" />
                        Ajustar Deuda
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-sm text-slate-400 mb-6">
                    Estás ajustando el saldo de <strong className="text-white">{userName}</strong>.
                    <br />
                    <span className="text-xs text-slate-500 mt-1 block">
                        • Valor <strong>positivo</strong> (ej: 5): Aumenta deuda (Multa).
                        <br />
                        • Valor <strong>negativo</strong> (ej: -5): Reduce deuda (Pago).
                    </span>
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Monto (€)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                            <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Motivo</label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Ej: Tarjeta Amarilla, Pago en efectivo..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Ajuste"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
