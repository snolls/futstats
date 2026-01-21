'use client';

import { ArrowRight, Mail, Lock, User, Chrome } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
    signInWithPopup,
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [error, setError] = useState<string>('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Email Auth State
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [resetSent, setResetSent] = useState(false);

    // Password Validation
    const [passwordFocused, setPasswordFocused] = useState(false);
    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const isPasswordValid = hasMinLength && hasUpperCase && hasNumber;

    useEffect(() => {
        if (user && !loading) {
            router.push('/');
        }
    }, [user, loading, router]);

    const handleGoogleLogin = async () => {
        setIsLoggingIn(true);
        setError('');
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            // Redirect handled by useEffect
        } catch (e: any) {
            setError('Error con Google: ' + e.message);
            setIsLoggingIn(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError('Ingresa tu correo para restablecer la contraseña.');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            setResetSent(true);
            setError('');
        } catch (e: any) {
            console.error(e);
            if (e.code === 'auth/user-not-found') {
                setError('No existe cuenta con este correo.');
            } else {
                setError('Error al enviar correo: ' + e.message);
            }
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setResetSent(false);
        setIsLoggingIn(true);

        try {
            if (isSignUp) {
                if (!fullName.trim()) throw new Error("El nombre es obligatorio.");
                if (!isPasswordValid) throw new Error("La contraseña no cumple los requisitos.");

                // 1. Create Identity
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const newUser = userCredential.user;

                // 2. Update Profile Display Name
                await updateProfile(newUser, { displayName: fullName });

                // 3. Create User Document in Firestore
                await setDoc(doc(db, 'users', newUser.uid), {
                    email: newUser.email,
                    displayName: fullName,
                    role: 'user', // Default role
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    photoURL: newUser.photoURL || null,
                    onboardingCompleted: false
                });

            } else {
                // Login
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (e: any) {
            console.error("Auth error:", e);
            let msg = "Ocurrió un error inesperado. Inténtalo de nuevo.";

            switch (e.code) {
                case 'auth/invalid-credential':
                    msg = "Credenciales inválidas. Verifica tu correo y contraseña.";
                    break;
                case 'auth/user-not-found':
                    msg = "Usuario no encontrado. Por favor, regístrate.";
                    break;
                case 'auth/wrong-password':
                    msg = "Contraseña incorrecta.";
                    break;
                case 'auth/email-already-in-use':
                    msg = "Este correo ya está registrado. Por favor, inicia sesión.";
                    setIsSignUp(false); // Switch to login automatically
                    break;
                case 'auth/weak-password':
                    msg = "La contraseña es muy debil. Intenta con una más segura.";
                    break;
                case 'auth/too-many-requests':
                    msg = "Demasiados intentos fallidos. Inténtalo más tarde.";
                    break;
                default:
                    msg = e.message || msg;
            }

            setError(msg);
            setIsLoggingIn(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-4 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-green-600/20 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[100px]" />
            </div>

            <div className="w-full max-w-md bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-2xl p-8 shadow-xl relative z-10">
                <div className="text-center mb-6">
                    <div className="flex justify-center mb-4">
                        <img src="/brand-logo.png" alt="FutStats Logo" className="h-16 w-auto" />
                    </div>
                    <h2 className="text-xl text-white font-semibold">
                        {isSignUp ? "Crea tu cuenta" : "Bienvenido de nuevo"}
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        {isSignUp ? "Únete para gestionar tus partidos" : "Inicia sesión para continuar"}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-4 text-center">
                        {error}
                    </div>
                )}
                {resetSent && (
                    <div className="bg-green-500/10 border border-green-500/50 text-green-500 text-sm p-3 rounded-lg mb-4 text-center">
                        Hemos enviado un enlace de recuperación a tu correo.
                    </div>
                )}

                {/* Google Button */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-medium py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-[1.01] disabled:opacity-70 disabled:cursor-not-allowed mb-6"
                >
                    {isLoggingIn ? (
                        <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Chrome className="w-5 h-5" />
                    )}
                    <span>Continuar con Google</span>
                </button>

                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-gray-900 px-2 text-gray-500">O usa tu correo</span>
                    </div>
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                    {isSignUp && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1 ml-1">Nombre Completo</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full bg-gray-950/50 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all placeholder:text-gray-600 text-sm"
                                    placeholder="Ej. Leo Messi"
                                    required={isSignUp}
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1 ml-1">Correo Electrónico</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-gray-950/50 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all placeholder:text-gray-600 text-sm"
                                placeholder="tu@email.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1 ml-1">Contraseña</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-gray-950/50 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all placeholder:text-gray-600 text-sm"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        {isSignUp && (
                            <div className="mt-2 text-xs space-y-1 ml-1 text-gray-500">
                                <p className={hasMinLength ? "text-green-500" : ""}>• Mínimo 8 caracteres</p>
                                <p className={hasUpperCase ? "text-green-500" : ""}>• Al menos 1 mayúscula</p>
                                <p className={hasNumber ? "text-green-500" : ""}>• Al menos 1 número</p>
                            </div>
                        )}
                        {!isSignUp && (
                            <div className="mt-1 text-right">
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    className="text-xs text-green-500 hover:text-green-400 hover:underline"
                                >
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoggingIn}
                        className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-green-900/20 transition-all hover:scale-[1.01] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                    >
                        {isLoggingIn && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
                        className="text-sm text-gray-400 hover:text-white transition-colors underline decoration-gray-700 underline-offset-4"
                    >
                        {isSignUp ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate"}
                    </button>
                </div>
            </div>

            <div className="mt-8 text-center relative z-10">
                <p className="text-gray-600 text-xs">
                    © {new Date().getFullYear()} FutStats Pro
                </p>
            </div>
        </div>
    );
}
