import Link from 'next/link';
import Image from 'next/image';
// Hook personalizado para detectar el estado de autenticación (si el usuario está logueado)
import { useAuth } from '@/hooks/useAuth';
// Librerías externas: Iconos y Hooks de React
import { LogOut, User as UserIcon, Shield, Crown, Settings } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
// Firebase Authentication
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import NotificationsDropdown from './NotificationsDropdown';
import { toast } from 'sonner';

export default function Navbar() {
    // Detectamos si hay un usuario conectado
    const { user, role } = useAuth();
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
        // Contenedor Principal: Fijo en la parte superior (sticky top-0) con efecto desenfoque
        <nav className="sticky top-0 z-50 w-full bg-gray-900/60 backdrop-blur-md border-b border-gray-800">
            <div className="max-w-7xl mx-auto px-4 py-3 md:px-8 flex flex-row items-center justify-between">
                <div className="flex-shrink-0 flex items-center gap-6">
                    <Link href="/" className="hover:opacity-80 transition-opacity">
                        {/* Logo de la Marca: Usamos width='auto' en style para evitar warnings de aspecto en Next.js */}
                        <Image
                            src="/brand-logo.png"
                            alt="FutStats"
                            width={140}
                            height={40}
                            className="h-8 md:h-10 w-auto object-contain"
                            style={{ width: 'auto' }}
                            priority
                        />
                    </Link>

                    {/* Navigation Links */}
                    <div className="hidden md:flex items-center gap-4">
                        <Link href="/explore" className="text-gray-300 hover:text-white text-sm font-medium transition-colors">
                            Explorar
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Renderizado Condicional: Si 'user' existe, mostramos el menú de perfil; si no, nada (o botón de login si quisieras) */}
                    {user && (
                        <>
                            <NotificationsDropdown />
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                    className="flex items-center gap-3 focus:outline-none"
                                >
                                    {/* Text: Hidden on mobile, visible on desktop */}
                                    <div className="hidden md:block text-right">
                                        <div className="text-sm font-medium text-white max-w-[150px] truncate">{user.displayName || 'Usuario'}</div>
                                    </div>

                                    {/* Avatar: Always visible */}
                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-tr from-green-500 to-blue-600 p-[2px] relative">
                                        <div className="w-full h-full rounded-full bg-gray-900 overflow-hidden flex items-center justify-center">
                                            {user.photoURL ? (
                                                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
                                            ) : (
                                                <UserIcon className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                                            )}
                                        </div>
                                        {/* Role Badge Desktop (Overlay) */}
                                        {role === 'admin' && (
                                            <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black p-0.5 rounded-full border border-gray-900" title="Administrador">
                                                <Shield className="w-3 h-3" />
                                            </div>
                                        )}
                                        {role === 'superadmin' && (
                                            <div className="absolute -bottom-1 -right-1 bg-purple-500 text-white p-0.5 rounded-full border border-gray-900" title="Super Admin">
                                                <Crown className="w-3 h-3" />
                                            </div>
                                        )}
                                    </div>
                                </button>

                                {dropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-xl py-1 transform opacity-100 scale-100 transition-all z-50">
                                        <div className="px-4 py-3 border-b border-gray-800 md:hidden">
                                            <p className="text-sm font-medium text-white max-w-full truncate">{user.displayName || 'Usuario'}</p>
                                            <p className="text-xs text-gray-500 max-w-full truncate">{user.email}</p>
                                        </div>
                                        <div className="hidden md:block px-4 py-3 border-b border-gray-800">
                                            <p className="text-xs text-gray-500 max-w-full truncate">{user.email}</p>
                                            <div className="mt-2 text-xs">
                                                <span className={`px-2 py-0.5 rounded-full font-medium border ${role === 'superadmin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                    role === 'admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                        'bg-gray-800 text-gray-400 border-gray-700'
                                                    }`}>
                                                    {role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'Usuario'}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setDropdownOpen(false);
                                                router.push('/profile');
                                            }}
                                            className="w-full flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                                        >
                                            <Settings className="w-4 h-4 mr-2" />
                                            Editar Perfil
                                        </button>

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
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
