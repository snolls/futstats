'use client';

import { AlertTriangle, Info } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    type?: 'danger' | 'info';
    confirmText?: string;
    cancelText?: string;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    type = 'danger',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar'
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-sm w-full p-6 transform transition-all scale-100">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className={`p-3 rounded-full ${type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        {type === 'danger' ? <AlertTriangle className="w-8 h-8" /> : <Info className="w-8 h-8" />}
                    </div>

                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <p className="text-slate-400 text-sm">{message}</p>

                    <div className="flex gap-3 w-full pt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => { onConfirm(); onClose(); }}
                            className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-transform hover:scale-105 ${type === 'danger'
                                    ? 'bg-red-600 hover:bg-red-500 shadow-red-500/20'
                                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                                }`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
