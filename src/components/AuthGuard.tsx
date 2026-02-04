'use client';

import { useAuthContext } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const { user, userData, loading } = useAuthContext();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (loading) return;

        // 1. Unauthenticated -> Redirect to Login
        const publicPaths = ['/login'];
        if (!user && !publicPaths.includes(pathname)) {
            router.push('/login');
            return;
        }

        // 2. Authenticated but Incomplete Profile -> Redirect to Onboarding
        if (user && userData) {
            // Check if onboarding is completed
            const isProfileComplete = userData.onboardingCompleted === true;

            if (!isProfileComplete && pathname !== '/onboarding') {
                router.push('/onboarding');
                return;
            }

            // 3. Authenticated & Complete -> Block access to Onboarding or Login
            if (isProfileComplete && (pathname === '/onboarding' || pathname === '/login')) {
                router.push('/');
                return;
            }
        }

    }, [user, userData, loading, pathname, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950">
                <Loader2 className="w-10 h-10 animate-spin text-green-500" />
            </div>
        );
    }

    return <>{children}</>;
}
