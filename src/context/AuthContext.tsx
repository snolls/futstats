"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface AuthContextType {
    user: User | null;
    userData: any | null; // Aquí guardamos el rol (superadmin, admin, etc)
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, userData: null, loading: true });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (currentUser) {
                // Forzamos la lectura del rol en la base de datos
                try {
                    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        console.log("Rol encontrado en DB:", data.role);
                        setUserData(data);
                    } else {
                        // Si el documento no existe, reseteamos userData
                        setUserData(null);
                    }
                } catch (error) {
                    console.error("Error leyendo rol:", error);
                    setUserData(null);
                }
            } else {
                setUserData(null);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, userData, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

// CAMBIO AQUÍ: Renombramos 'useAuth' a 'useAuthContext' para que coincida con lo que busca tu hook
export const useAuthContext = () => useContext(AuthContext);