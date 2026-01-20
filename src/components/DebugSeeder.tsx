import { useState } from 'react';
import { db } from '@/lib/firebase'; // Ajusta la ruta a tu config
import { collection, doc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner'; // O tu librería de notificaciones

export function DebugSeeder() {
    const [loading, setLoading] = useState(false);

    const handleSeed = async () => {
        if (!confirm("⚠️ ¿Estás seguro? Esto inyectará datos falsos en la base de datos.")) return;

        setLoading(true);
        const batch = writeBatch(db);

        try {
            // 1. Crear Usuarios Falsos
            const users = [
                { id: 'user_messi', name: 'Leo Messi', email: 'leo@test.com', role: 'user', position: 'ST' },
                { id: 'user_cr7', name: 'Cristiano Ronaldo', email: 'cr7@test.com', role: 'user', position: 'LW' },
                { id: 'user_admin', name: 'Admin Pruebas', email: 'admin@test.com', role: 'admin', position: 'CDM' }
            ];

            users.forEach(u => {
                const ref = doc(db, 'users', u.id);
                batch.set(ref, {
                    uid: u.id,
                    displayName: u.name,
                    email: u.email,
                    role: u.role,
                    position: u.position,
                    photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`,
                    debt: 0,
                    createdAt: Date.now(),
                    onboardingCompleted: true,
                    associatedGroups: ['group_liga_pro']
                });
            });

            // 2. Crear Grupo
            const groupRef = doc(db, 'groups', 'group_liga_pro');
            batch.set(groupRef, {
                id: 'group_liga_pro',
                name: 'Liga Profesional Test',
                adminIds: ['user_admin'], // Asigna IDs reales si tienes el tuyo a mano
                memberIds: ['user_messi', 'user_cr7', 'user_admin'],
                createdAt: Date.now()
            });

            // 3. Crear Partidos Pasados
            const matchRef = doc(collection(db, 'matches'));
            batch.set(matchRef, {
                date: new Date(Date.now() - 86400000).toISOString(), // Ayer
                groupId: 'group_liga_pro',
                location: 'Camp Nou',
                price: 5,
                status: 'finished',
                teams: {
                    teamA: ['user_messi'],
                    teamB: ['user_cr7']
                },
                result: { goalsA: 3, goalsB: 2 }
            });

            await batch.commit();
            toast.success("✅ Datos inyectados correctamente. Recarga la página.");
        } catch (error) {
            console.error(error);
            toast.error("Error al inyectar datos.");
        } finally {
            setLoading(false);
        }
    };

    // Renderizado Flotante (Fixed)
    return (
        <div className="fixed bottom-6 right-6 z-50">
            <button
                onClick={handleSeed}
                disabled={loading}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center gap-2 border-2 border-white/20"
            >
                {loading ? '⏳ Generando...' : '🛠️ Inyectar Datos Test'}
            </button>
        </div>
    );
}
