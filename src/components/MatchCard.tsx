import { Calendar, MapPin, Users, Lock, Unlock } from 'lucide-react';
import { Match } from '@/types/business';

interface MatchCardProps {
    match: Match;
    onViewDetails: (matchId: string) => void;
    isAdmin: boolean;
}

export default function MatchCard({ match, onViewDetails, isAdmin }: MatchCardProps) {
    // LÓGICA DE SEGURIDAD PARA FECHAS
    const dateObj = (() => {
        // @ts-ignore - Handle mixed types (Timestamp | string)
        if (!match.date) return new Date(); // Fallback por si es null
        // Si es un Timestamp de Firestore (tiene .toDate)
        // @ts-ignore
        if (typeof match.date.toDate === 'function') {
            // @ts-ignore
            return match.date.toDate();
        }
        // Si es un String (ISO) o un número (Timestamp millis)
        // @ts-ignore
        return new Date(match.date);
    })();
    const formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const formattedTime = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Derived state
    const currentPlayers = match.players?.length || 0;
    const maxPlayers = match.maxPlayers || 0;
    const isFull = currentPlayers >= maxPlayers;
    const isOpen = match.type === 'open';

    return (
        <div
            onClick={() => onViewDetails(match.id!)}
            className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 hover:bg-gray-800/50 transition-all group relative overflow-hidden cursor-pointer"
        >
            {/* Status Indicator */}
            <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold rounded-bl-xl flex items-center gap-1
                ${match.status === 'SCHEDULED' ? (isFull ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400') : ''}
                ${match.status === 'COMPLETED' ? 'bg-slate-700 text-slate-400' : ''}
                ${match.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' : ''}
            `}>
                {match.status === 'SCHEDULED' && (
                    <>
                        <div className={`w-2 h-2 rounded-full ${isFull ? 'bg-orange-500' : 'bg-green-500'} animate-pulse`} />
                        {isFull ? 'LLENO' : 'DISPONIBLE'}
                    </>
                )}
                {match.status === 'COMPLETED' && 'FINALIZADO'}
                {match.status === 'CANCELLED' && 'CANCELADO'}
            </div>

            <div className="flex items-start justify-between mt-4">
                <div className="space-y-3 w-full">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            {isOpen ? (
                                <span className="text-[10px] uppercase font-bold text-blue-400 bg-blue-400/10 px-1.5 rounded border border-blue-400/20">ABIERTO</span>
                            ) : (
                                <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-400/10 px-1.5 rounded border border-slate-400/20">CERRADO</span>
                            )}
                            <h3 className="text-lg font-bold text-white capitalize leading-tight">{formattedDate}</h3>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <span>{formattedTime}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Users className={`w-4 h-4 ${isFull ? 'text-orange-500' : 'text-green-500'}`} />
                            <span className={isFull ? 'text-orange-400' : 'text-slate-300'}>
                                {currentPlayers} / {maxPlayers}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center text-xs">
                <span className="text-slate-500 font-mono">
                    {match.format || 'Fútbol 7'}
                </span>
                <span className="font-medium text-green-500 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                    Ver Detalles &rarr;
                </span>
            </div>
        </div>
    );
}
