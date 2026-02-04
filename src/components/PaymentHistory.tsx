"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, getDocs, collectionGroup, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PaymentLog } from "@/types/payment";
import { Loader2, ArrowRight } from "lucide-react";

interface PaymentHistoryProps {
    groupId: string;
    userId?: string;
}

export default function PaymentHistory({ groupId, userId }: PaymentHistoryProps) {
    const [logs, setLogs] = useState<PaymentLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [limitCount, setLimitCount] = useState(5);

    useEffect(() => {
        setLoading(true);
        let q;

        try {
            if (userId) {
                // Specific User Logs
                q = query(
                    collection(db, `users/${userId}/debt_logs`),
                    where("groupId", "==", groupId),
                    orderBy("timestamp", "desc"),
                    limit(limitCount)
                );
            } else {
                // Group Wide Logs (Collection Group)
                q = query(
                    collectionGroup(db, 'debt_logs'),
                    where("groupId", "==", groupId),
                    orderBy("timestamp", "desc"),
                    limit(limitCount)
                );
            }

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentLog));
                setLogs(fetchedLogs);
                setLoading(false);
            }, (error) => {
                console.error("Error listening to payment logs:", error);
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Error setting up logs listener:", error);
            setLoading(false);
        }
    }, [groupId, userId, limitCount]);

    const handleLoadMore = () => {
        setLimitCount(prev => prev + 5);
    };

    const handleShowLess = () => {
        setLimitCount(prev => Math.max(5, prev - 5));
    };

    if (loading && logs.length === 0) {
        return <div className="flex justify-center p-4"><Loader2 className="animate-spin text-blue-500" /></div>;
    }

    if (logs.length === 0) {
        return <div className="text-gray-500 text-center p-4">No hay historial de pagos en este grupo.</div>;
    }

    return (
        <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
            <div className="space-y-2">
                {logs.map(log => {
                    const isSettlement = log.type === 'DEBT_SETTLED';

                    // Color logic
                    let amountClass = "text-gray-300";
                    if (log.amount < 0) amountClass = "text-green-400"; // Reducing debt
                    else if (log.amount > 0) amountClass = "text-red-400"; // Increasing debt

                    return (
                        <div key={log.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm gap-2">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white">{log.userName}</span>
                                    <span className="text-xs text-gray-500">gestionado por {log.adminName}</span>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Fecha desconocida'}
                                </span>
                                {log.reason && <p className="text-xs text-gray-400 italic mt-1">"{log.reason}"</p>}
                            </div>

                            <div className="flex items-center gap-4 text-right ml-auto sm:ml-0">
                                <div className="flex flex-col items-end">
                                    <span className={`font-mono font-bold ${amountClass}`}>
                                        {log.amount > 0 ? '+' : ''}{log.amount.toFixed(2)} €
                                    </span>
                                    <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">
                                        {isSettlement ? 'PAGO COMPLETO' : log.type}
                                    </span>
                                </div>

                                <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
                                    <span>{log.previousBalance.toFixed(2)}</span>
                                    <ArrowRight className="w-3 h-3" />
                                    <span className="text-white font-medium">{log.newBalance.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Load More Button */}
            <div className="flex items-center gap-3 pt-2">
                {logs.length >= limitCount && (
                    <button
                        onClick={handleLoadMore}
                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cargar más"}
                    </button>
                )}

                {limitCount > 5 && (
                    <button
                        onClick={handleShowLess}
                        className="flex-1 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-500 hover:text-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        Ver menos
                    </button>
                )}
            </div>
        </div>
    );
}
