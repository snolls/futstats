'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthContext } from './AuthContext'; // Use correct hook name if changed, or useAuth
import { useAuth } from '@/hooks/useAuth'; // Reverting to original hook if it exists, or check imports. Original was useAuth.

// Reusing the shape from types/request
import { SocialRequest } from '@/types/request';

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
    const [managedGroupIds, setManagedGroupIds] = useState<string[]>([]);

    // 1. Fetch Groups where I am explicitly ADMIN
    useEffect(() => {
        if (!user || authLoading) {
            setManagedGroupIds([]);
            return;
        }

        // Optimize: If superadmin, we don't need this list (uses God mode query)
        if (role === 'superadmin') {
            setManagedGroupIds([]);
            return;
        }

        // Fetch groups where adminIds array contains my UID
        const q = query(
            collection(db, "groups"),
            where("adminIds", "array-contains", user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ids = snapshot.docs.map(d => d.id);
            setManagedGroupIds(ids);
        }, (err) => {
            console.error("Error fetching managed groups for notifications:", err);
            setManagedGroupIds([]);
        });

        return () => unsubscribe();
    }, [user, role, authLoading]);

    // Stable dependency string for the second effect
    const managedGroupIdsStr = JSON.stringify(managedGroupIds.slice().sort());

    // 2. Fetch Notifications based on Role/ManagedGroups
    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setNotifications([]);
            setLoading(false);
            return;
        }

        let q;
        const myAdminGroups = JSON.parse(managedGroupIdsStr);

        if (role === 'superadmin') {
            q = query(
                collection(db, "group_requests"),
                where("status", "==", "pending")
            );
        } else {
            // If I am not admin of any group, I see no incoming requests.
            if (myAdminGroups.length === 0) {
                setNotifications([]);
                setLoading(false);
                return;
            }

            // Firestore Limit 10
            // If user manages > 10 groups, we only show requests for first 10 for now.
            const safeGroupIds = myAdminGroups.slice(0, 10);

            // STRICT SECURITY COMPLIANCE: 
            // Rule: allow read if isGroupAdmin(groupId).
            // Query must use: where('groupId', 'in', adminGroups)
            q = query(
                collection(db, "group_requests"),
                where("groupId", "in", safeGroupIds),
                where("status", "==", "pending")
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allFetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as NotificationRequest));

            // Client-sort
            allFetched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            setNotifications(allFetched);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to notifications:", error);
            setNotifications([]);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, role, authLoading, managedGroupIdsStr]);

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
