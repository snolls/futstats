'use client';

import { useAuth } from '@/hooks/useAuth';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useState } from 'react';

export default function AuthTestPage() {
    const { user, role, loading, userData } = useAuth();
    const [error, setError] = useState<string>('');

    const handleLogin = async () => {
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (e: any) {
            setError(e.message);
        }
    };

    if (loading) return <div>Loading Auth State...</div>;

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">Auth & Role Verification</h1>

            {error && <div className="text-red-500 mb-4">{error}</div>}

            {user ? (
                <div className="space-y-4">
                    <div className="p-4 bg-green-100 dark:bg-green-900 rounded">
                        <p><strong>Status:</strong> Logged In</p>
                        <p><strong>UID:</strong> {user.uid}</p>
                        <p><strong>Email:</strong> {user.email}</p>
                        <p><strong>Role (Firestore):</strong> {role || 'No role found in DB yet'}</p>
                        <p className="text-sm text-gray-500 mt-2">
                            Raw Firestore Data: {JSON.stringify(userData, null, 2)}
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                        Sign Out
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <p>Not Logged In</p>
                    <button
                        onClick={handleLogin}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Sign In with Google
                    </button>
                    <p className="text-sm text-gray-500">
                        Note: Ensure Google Auth is enabled in Firebase Console.
                    </p>
                </div>
            )}
        </div>
    );
}
