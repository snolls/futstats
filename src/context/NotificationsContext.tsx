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

        // Optimized Query: "Mine" = Requests where I am an auditor.
        // For Group Admins: RequestService adds their UID to 'auditors'.
        // For Superadmin: RequestService adds 'superadmin' string? 
        // We will listen to TWO disjoint sets or one broad set?
        // - Group Admins: where 'auditors', 'array-contains', user.uid
        // - Superadmin: where 'auditors', 'array-contains', 'superadmin' OR user.uid?
        // Firestore limitation: array-contains cannot be OR'd easily.

        // STRATEGY: 
        // If Role == Superadmin -> Listen to ALL pending 'request_admin' + pending 'join_group' (maybe not desired? Prompt says "Si soy Superadmin: Veo solicitudes de 'Quiero ser Admin'". Only??)
        // Prompt Check: "Superadmin: Veo solicitudes de 'Quiero ser Admin'".
        // "Admin: Veo solicitudes de 'Quiero unirme al grupo X'".

        let q;

        if (role === 'superadmin') {
            // Superadmin might want to see EVERYTHING or specific.
            // Prompt implies specificity. "Superadmin sees admin requests".
            // But Superadmin is usually also an Admin of groups?
            // Let's broaden: Superadmin sees ALL pending requests (God Mode) OR strict filter?
            // Prompt: "Superadmin: Veo solicitudes de 'Quiero ser Admin'".
            // Let's implement God Mode for Superadmin to be safe, filtering in UI? 
            // Or better: Query all pending.
            q = query(
                collection(db, "group_requests"),
                where("status", "==", "pending")
            );
        } else {
            // Regular Admin / User
            // Filter by: I am an auditor
            q = query(
                collection(db, "group_requests"),
                where("auditors", "array-contains", user.uid),
                where("status", "==", "pending")
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allFetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as NotificationRequest));

            // Client-side Strict Visibility Filter
            const visibleNotifications = allFetched.filter(req => {
                // 1. Superadmin View
                if (role === 'superadmin') {
                    if (req.type === 'request_admin') return true;
                    // Also show group requests if they are explicitly auditor (e.g. created the group or added)
                    // or if we decide Superadmin sees ALL group requests. 
                    // Let's stick to prompt: "Superadmin: Veo solicitudes de 'Quiero ser Admin'".
                    // But if Superadmin is ALSO member/admin of a group, they should see join requests for THAT group.
                    if (req.type === 'join_group') {
                        if (req.auditors?.includes(user.uid)) return true; // Explicitly assigned
                        // return true; // Uncomment to allow Superadmin to moderate ALL groups
                    }
                    return false;
                }

                // 2. Admin View
                if (role === 'admin') {
                    // Only see join requests for MY groups
                    if (req.type === 'join_group' && req.targetGroupId) {
                        // Check if I am authorized (auditor check usually sufficient if backend logic is correct)
                        // Backend (RequestService) adds group.adminIds to auditors.
                        // So correct query `where auditor == uid` handles this!
                        // Double check locally:
                        return req.auditors?.includes(user.uid);
                    }
                }

                return false;
            });

            // Sort desc by createdAt
            visibleNotifications.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

            setNotifications(visibleNotifications);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to notifications:", error);
            setNotifications([]);
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
