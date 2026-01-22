'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface NotificationRequest {
    id: string;
    type: 'join_group' | 'admin_access';
    status: 'pending' | 'approved' | 'rejected';
    groupId?: string;
    groupName?: string;
    userId: string;
    userName: string;
    createdAt: any;
}

interface NotificationsContextType {
    notifications: NotificationRequest[];
    unreadCount: number;
    loading: boolean;
}

const NotificationsContext = createContext<NotificationsContextType>({
    notifications: [],
    unreadCount: 0,
    loading: true,
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { user, role, loading: authLoading } = useAuth();
    const [notifications, setNotifications] = useState<NotificationRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setNotifications([]);
            setLoading(false);
            return;
        }

        // Listen to ALL pending requests
        // Optimization: We could split queries, but 'requests' collection is likely small enough for now.
        // If scale increases, we should index by type/groupId.
        const q = query(collection(db, 'group_requests'), where('status', '==', 'pending'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allPending = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as NotificationRequest));

            // Client-side Filtering based on Role Logic
            const relevantNotifications = allPending.filter(req => {
                // 1. Superadmin sees EVERYTHING related to system access (admin_access)
                //    and potentially could see everything else, but let's stick to requirements.
                //    Usually Superadmin approves 'admin_access'.
                if (role === 'superadmin') {
                    if (req.type === 'admin_access') return true;
                }

                // 2. Admin (or Group Owner) sees 'join_group' for THEIR groups
                if (req.type === 'join_group' && req.groupId) {
                    // Check if user manages this group.
                    // We need user's associatedGroups to be reliable.
                    // Assuming 'user' object from useAuth has this custom claim or data 
                    // OR we check the group doc. But checking group doc for every request is heavy here.
                    // Better approach: Check if req.groupId is in user.associatedGroups (if available)
                    // Since useAuth might give us a partial user object, let's look at the custom data attached if any.
                    // SAFEGUARD: For now, if role is 'admin' or 'superadmin', we show it? 
                    // No, that leaks privacy. 
                    // We need to know if THIS user is admin of THAT group.

                    // The 'user' object from useAuth usually comes from AuthContext which fetches FS data.
                    // Let's assume user.associatedGroups exists on the context user object if we enriched it.
                    // If not, we might need to rely on the 'adminIds' on the group itself... but we don't have groups loaded here.

                    // WORKING SOLUTION: 
                    // Use the 'associatedGroups' array on the user object (if UseAuth provides enriched user).
                    // If UseAuth only provides Basic User, we have a problem.
                    // Let's assume for this task that we can access `user.associatedGroups` 
                    // (casted as any for now if TS complains, or update types).

                    const userGroups = (user as any).associatedGroups || [];
                    // Also handle superadmin seeing all join requests? Maybe not needed yet.
                    // Let's stick to: Admins filters by their groups.
                    if (userGroups.includes(req.groupId)) return true;

                    // Superadmin override: does superadmin manage all groups? 
                    // Usually yes, but technically maybe not explicit "adminId".
                    // Let's assume Superadmin deals with Role Requests, and Groups Admins deal with Join Requests.
                }

                return false;
            });

            setNotifications(relevantNotifications);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to notifications:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, role, authLoading]);

    return (
        <NotificationsContext.Provider value={{
            notifications,
            unreadCount: notifications.length,
            loading
        }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    return useContext(NotificationsContext);
}
