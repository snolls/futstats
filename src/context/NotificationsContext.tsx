'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

// Reusing the shape from types/request but defining locally if needed, 
// or better, let's make it compatible with what we query.
import { SocialRequest } from '@/types/request';

// Context uses SocialRequest now
export type NotificationRequest = SocialRequest;

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
    const { user, userData, role, loading: authLoading } = useAuth();
    const [notifications, setNotifications] = useState<NotificationRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setNotifications([]);
            setLoading(false);
            return;
        }

        // Broad Query: Listen to ALL pending requests
        // Client-side filtering is used to ensure robustness if 'auditors' field is missing or inconsistent.
        const q = query(
            collection(db, "requests"),
            where("status", "==", "pending")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allPending = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as NotificationRequest));

            const myNotifications = allPending.filter(req => {
                // 1. Superadmin: Sees 'request_admin' (or legacy 'admin_access')
                if (role === 'superadmin') {
                    if (req.type === 'request_admin' || req.type === 'admin_access') return true;
                }

                // 2. Group Admin: Sees 'join_group' for their groups
                if (req.type === 'join_group' && req.targetGroupId) {
                    const myGroups = userData?.associatedGroups || [];
                    if (myGroups.includes(req.targetGroupId)) {
                        return true;
                    }
                }

                return false;
            });

            // Sort desc by createdAt
            myNotifications.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            setNotifications(myNotifications);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to notifications:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, userData, role, authLoading]);

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
