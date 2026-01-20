'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function Navbar() {
    const { user } = useAuth();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <nav className="sticky top-0 z-50 w-full bg-gray-900/60 backdrop-blur-md border-b border-gray-800">
            <div className="max-w-7xl mx-auto px-4 md:px-8">
                <div className="flex flex-col gap-4 py-3 sm:py-0 sm:flex-row sm:justify-between sm:items-center sm:h-16">
                    <div className="flex-shrink-0">
                        <Link href="/" className="hover:opacity-80 transition-opacity">
                            <Image
                                src="/navbar-logo.png"
                                alt="FutStats"
                                width={0}
                                height={0}
                                sizes="100vw"
                                style={{ width: 'auto', height: '40px' }}
                                className="object-contain"
                            />
                        </Link>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-end sm:justify-start">
                        {user && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                    className="flex items-center gap-2 focus:outline-none"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-blue-600 p-[2px]">
                                        <div className="w-full h-full rounded-full bg-gray-900 overflow-hidden flex items-center justify-center">
                                            {user.photoURL ? (
                                                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>
                                    </div>
                                </button>

                                {dropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-xl py-1 transform opacity-100 scale-100 transition-all">
                                        <div className="px-4 py-3 border-b border-gray-800">
                                            <p className="text-xs sm:text-sm font-medium text-white max-w-full truncate">{user.displayName || 'Usuario'}</p>
                                            <p className="text-[10px] sm:text-xs text-gray-500 max-w-full truncate">{user.email}</p>
                                        </div>
                                        <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                                            <UserIcon className="w-4 h-4 mr-2" />
                                            Perfil
                                        </a>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4 mr-2" />
                                            Cerrar Sesión
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}
