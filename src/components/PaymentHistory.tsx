"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PaymentLog } from "@/types/payment";
import { Loader2, ArrowRight } from "lucide-react";

interface PaymentHistoryProps {
    groupId: string;
}

export default function PaymentHistory({ groupId }: PaymentHistoryProps) {
    const [logs, setLogs] = useState<PaymentLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            try {
                // Fetch last 50 logs for this group
                const q = query(
                    collection(db, "payment_logs"),
                    where("groupId", "==", groupId),
                    orderBy("timestamp", "desc"),
                    limit(50)
                );
                const snap = await getDocs(q);
                const fetchedLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentLog));
                setLogs(fetchedLogs);
            } catch (error) {
                console.error("Error fetching payment logs:", error);
            } finally {
                setLoading(false);
            }
        };

        if (groupId) {
            fetchLogs();
        }
    }, [groupId]);

    if (loading) {
        return <div className="flex justify-center p-4"><Loader2 className="animate-spin text-blue-500" /></div>;
    }

    if (logs.length === 0) {
        return <div className="text-gray-500 text-center p-4">No hay historial de pagos en este grupo.</div>;
    }

    return (
        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar bg-gray-900/50 p-4 rounded-lg border border-gray-800">
            {logs.map(log => {
                const isSettlement = log.type === 'DEBT_SETTLED';
                const isFine = log.type === 'FINE';
                const isAdjustment = log.type === 'ADJUSTMENT';

                // Color logic
                let amountClass = "text-gray-300";
                if (log.amount < 0) amountClass = "text-green-400"; // Reducing debt
                else if (log.amount > 0) amountClass = "text-red-400"; // Increasing debt

                // If settled, amount is negative of balance, so green.

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
    );
}
