import { Timestamp } from 'firebase/firestore';

export type PaymentType = 'PAYMENT' | 'FINE' | 'ADJUSTMENT' | 'DEBT_SETTLED';

export interface PaymentLog {
    id?: string;
    adminId: string;      // Who performed the action
    adminName?: string;   // Denormalized for display
    userId: string;       // Affected user
    userName?: string;    // Denormalized
    groupId: string;      // In which group
    amount: number;       // Amount paid/adjusted
    previousBalance: number;
    newBalance: number;
    type: PaymentType;
    reason?: string;      // Optional note (e.g. "Tarjeta Amarilla")
    timestamp: Timestamp;
}
