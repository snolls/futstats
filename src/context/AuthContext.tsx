'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase'; // Ensure this path matches your structure
import { AppUserCustomData, UserRole } from '../types/user';

interface AuthContextType {
    user: User | null;
    userData: AppUserCustomData | null;
    loading: boolean;
    role: UserRole | null;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userData: null,
    loading: true,
    role: null,
});

export const useAuthContext = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<AppUserCustomData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                setUser(null);
                setUserData(null);
                setLoading(false);
                return;
            }

            setUser(currentUser);
            const userDocRef = doc(db, 'users', currentUser.uid);

            try {
                // FORCE READ from Firestore
                const docSnap = await getDoc(userDocRef);

                if (docSnap.exists()) {
                    setUserData(docSnap.data() as AppUserCustomData);
                } else {
                    // Create user if not exists
                    const newUserData: AppUserCustomData = {
                        role: 'user', // Default role
                        email: currentUser.email,
                        displayName: currentUser.displayName,
                        photoURL: currentUser.photoURL,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    };

                    try {
                        await setDoc(userDocRef, newUserData);
                        setUserData(newUserData);
                    } catch (error) {
                        console.error("Error creating user document:", error);
                    }
                }
            } catch (error) {
                console.error("Error fetching initial user data:", error);
            }

            // Real-time listener for subsequent updates
            const unsubscribeDoc = onSnapshot(userDocRef, (docSnapshot) => {
                if (docSnapshot.exists()) {
                    setUserData(docSnapshot.data() as AppUserCustomData);
                }
            }, (error) => {
                 console.error("Error in user snapshot:", error);
            });

            setLoading(false);
            
            return () => unsubscribeDoc();
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, userData, loading, role: userData?.role || null }}>
            {children}
        </AuthContext.Provider>
    );
};
