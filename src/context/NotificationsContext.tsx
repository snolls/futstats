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

        // Logic refinement: 
        // 1. User sees requests where 'auditors' contains their UID (Group Admins).
        // 2. Superadmin sees requests where 'auditors' contains 'superadmin' OR their UID.

        const unsubs: (() => void)[] = [];
        const resultsMap = new Map<string, NotificationRequest[]>();

        const updateNotifications = (key: string, list: NotificationRequest[]) => {
            resultsMap.set(key, list);
            const merged = Array.from(resultsMap.values()).flat();
            // Dedup by ID
            const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
            // Sort desc by createdAt
            unique.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            setNotifications(unique);
            setLoading(false);
        };

        // Listener A: My UID (Group Admin requests)
        const q1 = query(collection(db, "requests"), where("auditors", "array-contains", user.uid));
        unsubs.push(onSnapshot(q1, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as NotificationRequest));
            updateNotifications('uid', list);
        }, (error) => {
            console.error("Error listening to UID notifications:", error);
            setLoading(false);
        }));

        // Listener B: 'superadmin' (Role requests) - Only if I am superadmin
        if (role === 'superadmin') {
            const q2 = query(collection(db, "requests"), where("auditors", "array-contains", "superadmin"));
            unsubs.push(onSnapshot(q2, (snap) => {
                const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as NotificationRequest));
                updateNotifications('sa', list);
            }, (error) => {
                console.error("Error listening to Superadmin notifications:", error);
                setLoading(false);
            }));
        }

        return () => unsubs.forEach(u => u());
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
