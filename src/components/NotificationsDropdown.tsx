"use client";

import Link from 'next/link';

import { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import { SocialRequest } from '@/types/request';
import { RequestService } from '@/services/RequestService';
import { toast } from 'sonner';
import { useNotifications } from '@/context/NotificationsContext';

export default function NotificationsDropdown() {
    const { user, userData } = useAuthContext();
    // Use the context!
    const { notifications, unreadCount, loading } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleAccept = async (req: SocialRequest) => {
        if (!userData) return;
        try {
            setActionLoading(true);
            await RequestService.acceptRequest(userData as any, req);
            toast.success("Solicitud aceptada");
            // Context will auto-update via Firebase listener
            setIsOpen(false);
        } catch (e) {
            console.error(e);
            toast.error("Error al aceptar");
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async (req: SocialRequest) => {
        try {
            setActionLoading(true);
            await RequestService.rejectRequest(req);
            toast.success("Solicitud rechazada");
            // Context will auto-update
        } catch (e) {
            console.error(e);
            toast.error("Error al rechazar");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2 rounded-full transition-all duration-200 ${isOpen ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
                title="Notificaciones"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.25rem] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-gray-900 animate-in zoom-in">
                        {unreadCount > 9 ? '+9' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 ring-1 ring-white/5">
                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center sticky top-0 z-10">
                        <h3 className="font-bold text-white text-sm flex items-center gap-2">
                            Notificaciones
                            {unreadCount > 0 && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
                        </h3>
                        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="max-h-[20rem] overflow-y-auto custom-scrollbar">
                        {loading && notifications.length === 0 ? (
                            <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                <Bell className="w-8 h-8 text-slate-800 mb-2" />
                                <p className="text-slate-500 text-sm font-medium">No tienes notificaciones pendientes.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/50">
                                {notifications.map(req => (
                                    <div key={req.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                                        <div className="flex items-start gap-3">
                                            {req.userPhotoURL ? (
                                                <img src={req.userPhotoURL} alt={req.userName} className="w-9 h-9 rounded-full object-cover border border-slate-700" />
                                            ) : (
                                                <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 border border-slate-700">
                                                    {req.userName.slice(0, 2).toUpperCase()}
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <p className="text-sm text-slate-300 leading-snug">
                                                    <span className="font-bold text-white">{req.userName}</span>
                                                    {req.type === 'join_group' && (
                                                        <> solicita unirse a <span className="text-blue-400 font-medium">{req.targetGroupName}</span></>
                                                    )}
                                                    {req.type === 'request_admin' && (
                                                        <> solicita acceso como <span className="text-purple-400 font-medium">Organizador</span></>
                                                    )}
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                                                    {req.userEmail}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-3 pl-12">
                                            <button
                                                onClick={() => handleAccept(req)}
                                                disabled={actionLoading}
                                                className="flex-1 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 border border-emerald-600/20 hover:border-emerald-600/40 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                                            >
                                                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                Aceptar
                                            </button>
                                            <button
                                                onClick={() => handleReject(req)}
                                                disabled={actionLoading}
                                                className="flex-1 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-600/20 hover:border-red-600/40 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                                            >
                                                <X className="w-3 h-3" />
                                                Rechazar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="p-2 border-t border-slate-800 bg-slate-900/50 backdrop-blur">
                        <Link href="/dashboard" onClick={() => setIsOpen(false)} className="block w-full text-center text-xs text-slate-500 hover:text-white py-1 transition-colors">
                            Ver todas en Gestión
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
