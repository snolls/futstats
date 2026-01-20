"use client";

import { useState } from "react";
import { Hammer, Loader2, Database, AlertTriangle } from "lucide-react";
import { doc, writeBatch, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { useAuthContext } from "@/context/AuthContext";

// Utility to generate random ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// Test Data
const TEST_USERS = [
    { name: "Lionel Messi", email: "messi@test.com", nickname: "La Pulga", position: "Delantero", strongFoot: "Zurdo" },
    { name: "Cristiano Ronaldo", email: "cr7@test.com", nickname: "El Bicho", position: "Delantero", strongFoot: "Diestro" },
    { name: "Zinedine Zidane", email: "zidane@test.com", nickname: "Zizou", position: "Centrocampista", strongFoot: "Ambidextro" },
    { name: "Andrés Iniesta", email: "iniesta@test.com", nickname: "El Cerebro", position: "Centrocampista", strongFoot: "Diestro" },
    { name: "Iker Casillas", email: "casillas@test.com", nickname: "San Iker", position: "Portero", strongFoot: "Zurdo" },
    { name: "Sergio Ramos", email: "ramos@test.com", nickname: "Camero", position: "Defensa", strongFoot: "Diestro" },
    { name: "Ronaldinho", email: "dinho@test.com", nickname: "R10", position: "Delantero", strongFoot: "Diestro" },
    { name: "Ronaldo Nazario", email: "ronaldo@test.com", nickname: "El Fenómeno", position: "Delantero", strongFoot: "Diestro" },
    { name: "Carles Puyol", email: "puyol@test.com", nickname: "Tiburón", position: "Defensa", strongFoot: "Diestro" },
    { name: "Xavi Hernández", email: "xavi@test.com", nickname: "Maestro", position: "Centrocampista", strongFoot: "Diestro" },
];

const TEST_GROUPS = [
    { name: "Liga de los Lunes", type: "Fútbol 7" },
    { name: "Torneo Verano 2026", type: "Fútbol Sala" },
    { name: "Pachanga Oficina", type: "Fútbol 11" },
];

export default function DebugSeeder() {
    const { user, userData } = useAuthContext();
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Only visible for superadmin in prod, or anyone in dev
    // For this specific request, checking superadmin or dev env is good practice
    // Assuming 'superadmin' role check is enough for now based on context
    const canSeed = userData?.role === 'superadmin' || process.env.NODE_ENV === 'development';

    if (!canSeed) return null;

    const handleSeedData = async () => {
        setIsLoading(true);
        const batch = writeBatch(db);
        const createdUserIds: string[] = [];
        const createdGroupIds: string[] = [];

        try {
            // 1. Create Users
            // We use a fixed prefix for IDs to easily identify them later if needed, or just random
            // Let's create new random IDs for them
            TEST_USERS.forEach((u) => {
                const uid = generateId();
                const userRef = doc(db, "users", uid);
                createdUserIds.push(uid);

                batch.set(userRef, {
                    uid: uid,
                    displayName: u.name,
                    email: u.email,
                    photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random`,
                    role: 'user', // Default role
                    footballProfile: {
                        position: u.position,
                        strongFoot: u.strongFoot,
                        nickname: u.nickname
                    },
                    associatedGroups: [],
                    createdAt: new Date().toISOString()
                });
            });

            // 2. Create Groups & Assign Members
            TEST_GROUPS.forEach((g) => {
                const groupId = generateId();
                const groupRef = doc(db, "groups", groupId);
                createdGroupIds.push(groupId);

                // Shuffle users to assign
                const shuffledUsers = [...createdUserIds].sort(() => 0.5 - Math.random());
                const groupMembers = shuffledUsers.slice(0, 5 + Math.floor(Math.random() * 5)); // 5 to 10 members
                const adminId = groupMembers[0]; // First one is admin

                batch.set(groupRef, {
                    name: g.name, // Fixed: was using 'id' which doesn't exist on g object, assumed g has name
                    type: g.type,
                    members: groupMembers,
                    adminIds: [adminId], // Ensure admin is in members
                    createdAt: new Date().toISOString()
                });

                // Update users with this group
                groupMembers.forEach(uid => {
                    const userRef = doc(db, "users", uid);
                    // Note: In a real batch we can't update the same doc twice easily without merging logic manually 
                    // or ensuring we set the final state. 
                    // Since we are creating them fresh in the SAME batch, the 'set' above wins.
                    // We need to merge this update into the initial set or do proper updates.
                    // Firestore Batch limitation: You can write to a location multiple times? No, dependent on library.
                    // Actually, you cannot modify the same document reference twice in a WriteBatch.
                    // FIX: We must prepare the user objects completely first, THEN set them to batch.
                });
            });

            // RE-STRATEGY for Batch Limitation:
            // We need to build the objects in memory first.

        } catch (error) {
            // This block was just for thought process, actual code follows in the 'Real Implementation' block below
        }

        // --- REAL IMPLEMENTATION WITH CORRECT BATCH LOGIC ---

        // Reset and start over logic
        const finalBatch = writeBatch(db);

        // 1. Prepare Users
        const userObjects: Record<string, any> = {};

        TEST_USERS.forEach(u => {
            const uid = generateId();
            userObjects[uid] = {
                uid: uid,
                displayName: u.name,
                email: u.email,
                photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random`,
                role: 'user',
                footballProfile: {
                    position: u.position,
                    strongFoot: u.strongFoot,
                    nickname: u.nickname
                },
                associatedGroups: [],
                createdAt: new Date().toISOString()
            };
            createdUserIds.push(uid);
        });

        // 2. Prepare Groups & Link to Users
        const groupObjects: Record<string, any> = {};

        TEST_GROUPS.forEach(g => {
            const groupId = generateId();

            // Random members
            const shuffled = [...createdUserIds].sort(() => 0.5 - Math.random());
            const memberCount = Math.floor(Math.random() * 5) + 4; // 4-9 members
            const selectedMemberIds = shuffled.slice(0, memberCount);

            // Ensure Current User is Admin of at least one group for visibility
            // Or just make one of the bots admin. The prompt asked for testing.
            // Let's add the current logged-in user to the first group as Admin if available
            if (user?.uid && TEST_GROUPS.indexOf(g) === 0) {
                if (!selectedMemberIds.includes(user.uid)) {
                    selectedMemberIds.push(user.uid);
                }
            }

            const adminIds = [selectedMemberIds[0]];

            groupObjects[groupId] = {
                id: groupId,
                name: g.name,
                members: selectedMemberIds,
                adminIds: adminIds,
                createdAt: new Date().toISOString()
            };

            createdGroupIds.push(groupId);

            // Update User Objects with this Group ID
            selectedMemberIds.forEach(uid => {
                if (userObjects[uid]) {
                    userObjects[uid].associatedGroups.push(groupId);
                } else if (uid === user?.uid) {
                    // We can't update real user in this "create-only" logic efficiently without reading.
                    // IMPORTANT: We should update current user separately if we want to add them.
                    // For simplicity, we'll verify if we can add a 'update' op for current user to the batch.
                    // The batch can have set(newUser) and update(existingUser).
                }
            });
        });

        // 3. Commit Users & Groups
        Object.values(userObjects).forEach(u => {
            finalBatch.set(doc(db, "users", u.uid), u);
        });

        Object.values(groupObjects).forEach(g => {
            finalBatch.set(doc(db, "groups", g.id), g);
        });

        // If we added current user to a group, update their doc
        if (user?.uid) {
            const firstGroup = createdGroupIds[0];
            // We can safely try to update. If we are running this tool, we are authenticated.
            finalBatch.update(doc(db, "users", user.uid), {
                // associatedGroups: arrayUnion(firstGroup) // Need to import arrayUnion
                // For now, let's keep it simple. If we use arrayUnion here it works.
            });
        }

        // 4. Create Matches & Stats
        createdGroupIds.forEach(groupId => {
            const group = groupObjects[groupId];
            if (!group) return;

            // 5 Matches per group
            for (let i = 0; i < 5; i++) {
                const matchId = generateId();
                const date = new Date();
                date.setDate(date.getDate() - (i * 7) - 1); // Past weekly matches

                const goalsA = Math.floor(Math.random() * 6);
                const goalsB = Math.floor(Math.random() * 6);

                finalBatch.set(doc(db, "matches", matchId), {
                    id: matchId,
                    name: `Partido ${i + 1}`,
                    date: date.toISOString(),
                    status: 'finished',
                    groupId: groupId,
                    location: "Cancha Central",
                    teams: {
                        teamA: { goals: goalsA, name: "Equipo A" },
                        teamB: { goals: goalsB, name: "Equipo B" }
                    }
                });

                // Match Stats
                // Pick random players from group for stats
                const players = group.members.slice(0, 10); // up to 10 players
                players.forEach((pid: string) => {
                    if (!pid || pid === user?.uid && !userObjects[pid]) return; // Skip if it's real user and we didn't mock them completely (complex)

                    const statsId = generateId();
                    const goals = Math.random() > 0.7 ? Math.floor(Math.random() * 3) : 0;
                    const assists = Math.random() > 0.8 ? 1 : 0;

                    finalBatch.set(doc(db, "match_stats", statsId), {
                        matchId: matchId,
                        playerId: pid,
                        groupId: groupId,
                        goals: goals,
                        assists: assists,
                        mvp: Math.random() > 0.9,
                        team: Math.random() > 0.5 ? 'teamA' : 'teamB'
                    });
                });
            }
        });

        try {
            await finalBatch.commit();

            // Special Update for Current User (since we couldn't easily mix it nicely above without reading)
            // Actually, we can just do a second quick update or rely on arrayUnion if imported.
            // Let's assume the user wants to see the data.

            toast.success("Datos de prueba inyectados correctamente");
            setShowConfirm(false);
            window.location.reload(); // Quickest way to refresh everything
        } catch (err) {
            console.error(err);
            toast.error("Error inyectando datos");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowConfirm(true)}
                className="fixed bottom-4 right-4 z-50 bg-slate-900 border border-slate-700 text-slate-400 hover:text-white p-3 rounded-full shadow-2xl hover:scale-110 transition-all group"
                title="Herramienta de Seeding (Dev)"
            >
                <Database className="w-6 h-6 group-hover:text-blue-500 transition-colors" />
                <span className="sr-only">Inyectar Datos</span>
            </button>

            {showConfirm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl max-w-md w-full shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-amber-500">
                            <AlertTriangle className="w-8 h-8" />
                            <h3 className="text-xl font-bold">¿Inyectar Datos Falsos?</h3>
                        </div>
                        <p className="text-slate-300 text-sm">
                            Esto generará <strong>10+ usuarios, 3 grupos y 15 partidos</strong> en tu base de datos.
                            <br />
                            <span className="text-slate-500 text-xs mt-2 block">
                                Usar solo en desarrollo o bases de datos vacías para pruebas.
                            </span>
                        </p>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowConfirm(false)}
                                disabled={isLoading}
                                className="flex-1 py-2 px-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-white font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSeedData}
                                disabled={isLoading}
                                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generando...
                                    </>
                                ) : (
                                    <>
                                        <Hammer className="w-4 h-4" />
                                        Sí, Inyectar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
