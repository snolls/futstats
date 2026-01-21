import { Timestamp } from 'firebase/firestore';

export type RequestType = 'join_group' | 'request_admin';
export type RequestStatus = 'pending' | 'accepted' | 'rejected';

export interface SocialRequest {
    id?: string;
    type: RequestType;
    status: RequestStatus;

    // Requester Info
    userId: string;
    userName: string;
    userEmail: string;
    userPhotoURL?: string;

    // Target Info (for join_group)
    targetGroupId?: string;
    targetGroupName?: string;

    // Authorization Helpers
    // For 'join_group': Array of Admin IDs of the target group (to easily query "my pending requests")
    // For 'request_admin': 'superadmin' string or specific ID if needed.
    auditors: string[];

    createdAt: Timestamp;
    updatedAt?: Timestamp;
}
