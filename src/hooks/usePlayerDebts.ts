import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, increment, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface DebtMatchItem {
    statId: string;
    matchId: string;
    date: Date;
    price: number;
    matchDateString: string;
    paymentStatus: 'PENDING' | 'PAID';
}

interface UsePlayerDebtsReturn {
    pendingMatches: DebtMatchItem[];
    paidMatches: DebtMatchItem[]; // Historial reciente de pagados
    totalDebt: number;   // matchesDebt + manualDebt
    matchesDebt: number; // Solo deuda depuradas
    manualDebt: number;  // Deuda manual / ajustes
    loading: boolean;
    toggleMatchPayment: (statId: string, currentStatus: 'PENDING' | 'PAID') => Promise<void>;
    updateManualDebt: (amount: number) => Promise<void>;
    processSmartPayment: (amount: number) => Promise<void>;
}

export function usePlayerDebts(userId: string): UsePlayerDebtsReturn {
    const [pendingMatches, setPendingMatches] = useState<DebtMatchItem[]>([]);
    const [paidMatches, setPaidMatches] = useState<DebtMatchItem[]>([]);
    const [manualDebt, setManualDebt] = useState(0);
    const [loading, setLoading] = useState(true);

    // 1. Escuchar perfil de usuario (Deuda Manual)
    useEffect(() => {
        if (!userId) return;
        const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setManualDebt(data.debt ?? (data.manualDebt || 0));
            }
        });
        return () => unsub();
    }, [userId]);

    // 2. Escuchar match_stats del usuario
    useEffect(() => {
        if (!userId) return;
        setLoading(true);

        // Traemos todos los stats del usuario para poder mostrar historial
        // En una app real con miles de partidos, limitaríamos con limit(50) o por fecha.
        const q = query(
            collection(db, 'match_stats'),
            where('userId', '==', userId)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const stats = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

            if (stats.length === 0) {
                setPendingMatches([]);
                setPaidMatches([]);
                setLoading(false);
                return;
            }

            // Obtener detalles de los partidos (Fecha y Precio)
            // Agrupamos IDs para hacer fetch eficiente (aunque Firestore no tiene 'IN' ilimitado, 
            // asumimos volumen razonable o hacemos fetch individual por simplicidad y caché del cliente)
            const matchIds = Array.from(new Set(stats.map((s: any) => s.matchId as string)));

            // Fetch de partidos
            // Nota: Podríamos usar getDocs(query(collection(db, 'matches'), where(documentId(), 'in', matchIds...)))
            // pero 'in' soporta max 10. Hacemos Promise.all con getDoc que es paralelo.
            const matchesData: Record<string, { date: Date, price: number }> = {};

            await Promise.all(matchIds.map(async (mid) => {
                const mSnap = await getDoc(doc(db, 'matches', mid));
                if (mSnap.exists()) {
                    const d = mSnap.data();
                    matchesData[mid] = {
                        date: d.date?.toDate ? d.date.toDate() : new Date(d.date),
                        price: d.pricePerPlayer || 0
                    };
                }
            }));

            // Procesar y combinar
            const processed: DebtMatchItem[] = stats.map((s: any) => {
                const mData = matchesData[s.matchId];
                if (!mData) return null;
                return {
                    statId: s.id,
                    matchId: s.matchId,
                    date: mData.date,
                    price: mData.price,
                    matchDateString: mData.date.toLocaleDateString('es-ES', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                    }),
                    paymentStatus: s.paymentStatus || 'PENDING'
                };
            }).filter(Boolean) as DebtMatchItem[];

            // Ordenar por fecha descendente
            processed.sort((a, b) => b.date.getTime() - a.date.getTime());

            // Separar listas
            setPendingMatches(processed.filter(m => m.paymentStatus !== 'PAID'));
            setPaidMatches(processed.filter(m => m.paymentStatus === 'PAID'));

            setLoading(false);

        }, (err) => {
            console.error("Error fetching dependencies:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId]);

    // Totales
    const matchesDebt = pendingMatches.reduce((acc, m) => acc + m.price, 0);
    const totalDebt = matchesDebt + manualDebt; // Asumiendo deuda manual positiva = debe

    // Acciones
    const toggleMatchPayment = async (statId: string, currentStatus: 'PENDING' | 'PAID') => {
        const newStatus = currentStatus === 'PENDING' ? 'PAID' : 'PENDING';
        try {
            await updateDoc(doc(db, 'match_stats', statId), {
                paymentStatus: newStatus
            });
        } catch (error) {
            console.error("Error toggling payment:", error);
            throw error;
        }
    };

    const updateManualDebt = async (amount: number) => {
        try {
            // Actualizamos ambos campos para consistencia
            await updateDoc(doc(db, 'users', userId), {
                debt: increment(amount),
                manualDebt: increment(amount)
            });
        } catch (error) {
            console.error("Error updating manual debt:", error);
            throw error;
        }
    };

    /**
     * Procesa un pago inteligente "en cascada".
     * 1. Paga partidos pendientes comenzando desde el más antiguo.
     * 2. Si sobra dinero, lo descuenta de la deuda manual.
     */
    const processSmartPayment = async (amount: number) => {
        if (!userId || amount <= 0) return;

        let remainingAmount = amount;

        // 1. Clonar y ordenar partidos pendientes por fecha ASCENDENTE (del más viejo al más nuevo)
        const sortedPending = [...pendingMatches].sort((a, b) => a.date.getTime() - b.date.getTime());

        for (const match of sortedPending) {
            if (remainingAmount >= match.price) {
                // Hay saldo suficiente para pagar este partido
                try {
                    await toggleMatchPayment(match.statId, 'PENDING'); // Cambia a PAID
                    remainingAmount -= match.price;
                } catch (error) {
                    console.error(`Error pagando partido ${match.matchId}:`, error);
                    // Si falla un pago, detenemos el proceso para evitar inconsistencias graves?
                    // O continuamos? Por seguridad, mejor detenerse o solo loguear.
                    // En este caso, continuamos intentando lo siguiente.
                }
            } else {
                // No alcanza para pagar este partido completo
                // Se detiene el pago de partidos
                break;
            }
        }

        // 2. Si sobra dinero, descontamos de la deuda manual
        if (remainingAmount > 0) {
            // Restar deuda manual significa 'incrementar' con valor negativo
            // Si el Amount es positivo (ej: pagó 20€), y sobraron 3€,
            // queremos REDUCIR la deuda en 3€.
            // updateManualDebt suma el valor, así que pasamos negativo.
            // NOTA: Esto permite que 'debt' se vuelva negativo, lo cual representa SALDO A FAVOR (Crédito).
            await updateManualDebt(-remainingAmount);
        }
    };

    return {
        pendingMatches,
        paidMatches,
        totalDebt,
        matchesDebt,
        manualDebt,
        loading,
        toggleMatchPayment,
        updateManualDebt,
        processSmartPayment
    };
}
