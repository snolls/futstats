import { Calendar, MapPin, Users } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface MatchData {
    id: string;
    date: Timestamp;
    location: string;
    status: string; // SCHEDULED, COMPLETED, CANCELLED
    groupId?: string;
}

interface MatchCardProps {
    match: MatchData;
    onViewDetails: (matchId: string) => void;
    isAdmin: boolean;
}

export default function MatchCard({ match, onViewDetails, isAdmin }: MatchCardProps) {
    const dateObj = match.date.toDate();
    const formattedDate = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const formattedTime = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all group relative overflow-hidden">
            {/* Status Indicator */}
            <div className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold rounded-bl-xl
                ${match.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-400' : ''}
                ${match.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : ''}
                ${match.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' : ''}
            `}>
                {match.status === 'SCHEDULED' && 'PROGRAMADO'}
                {match.status === 'COMPLETED' && 'FINALIZADO'}
                {match.status === 'CANCELLED' && 'CANCELADO'}
            </div>

            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white mb-2 capitalize">{formattedDate}</h3>

                    <div className="space-y-2 text-sm text-gray-400">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <span>{formattedTime} hs</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span>{match.location || 'Ubicación sin definir'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-5 pt-4 border-t border-gray-800 flex justify-end">
                <button
                    onClick={() => onViewDetails(match.id)}
                    className="text-sm font-medium text-green-500 hover:text-green-400 transition-colors flex items-center gap-1"
                >
                    Ver Detalles &rarr;
                </button>
            </div>
        </div>
    );
}
