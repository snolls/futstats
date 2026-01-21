
import { Timestamp } from 'firebase/firestore';

export interface Group {
    id?: string;
    name: string;
    adminIds: string[]; // List of IDs of users who are admins of this group
    members: string[]; // List of IDs of users who are members
    createdAt: Timestamp;
    createdBy: string;
}

export type PaymentStatus = 'PAID' | 'PENDING';

export interface MatchStats {
    id?: string;
    matchId: string;
    userId: string;
    groupId: string;
    goals: number;
    assists?: number; // Optional
    isMvp: boolean;
    paymentStatus: PaymentStatus;
    matchDate: Timestamp;
    isGuest?: boolean;
    displayName?: string;
}

export interface Match {
    id?: string;
    groupId: string;
    date: Timestamp;
    location?: string;
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
    createdBy: string;
}
