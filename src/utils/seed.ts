import { db } from "@/lib/firebase";
import { addDoc, collection, doc, setDoc, Timestamp, writeBatch } from "firebase/firestore";

// Helper to generate random people
const SAMPLE_USERS = [
    { displayName: "Carlos 'El Tanque'", email: "carlos@example.com" },
    { displayName: "Andrés Iniesta (Clone)", email: "andres@example.com" },
    { displayName: "Sergio Ramos 2.0", email: "sergio@example.com" },
    { displayName: "David De Gea", email: "david@example.com" },
    { displayName: "Iker Casillas", email: "iker@example.com" },
    { displayName: "Xavi Hernández", email: "xavi@example.com" },
    { displayName: "Carles Puyol", email: "puyol@example.com" },
    { displayName: "Raúl González", email: "raul@example.com" },
    { displayName: "Fernando Torres", email: "torres@example.com" },
    { displayName: "David Villa", email: "villa@example.com" }
];

const GROUP_NAMES = [
    "Los Galácticos del Barrio",
    "Fútbol Jueves Noche",
    "Liga de Veteranos"
];

export const seedDatabase = async (currentUserId: string) => {
    try {
        console.log("Starting seed...");

        // 1. Create Users
        const userIds: string[] = [];
        // We actually need real auth users for login, but for stats display we just need docs in 'users' collection.
        // We will mock them.
        for (const u of SAMPLE_USERS) {
            // Generate a fake UID
            const fakeUid = 'user_' + Math.random().toString(36).substr(2, 9);
            await setDoc(doc(db, "users", fakeUid), {
                uid: fakeUid,
                displayName: u.displayName,
                email: u.email,
                role: 'user',
                createdAt: Timestamp.now()
            });
            userIds.push(fakeUid);
        }

        // Add current user to list
        userIds.push(currentUserId);

        // 2. Create Groups
        const groupIds: string[] = [];
        for (const gName of GROUP_NAMES) {
            // Shuffle members: Include current user + 5 randoms
            const shuffled = userIds.sort(() => 0.5 - Math.random());
            const members = Array.from(new Set([currentUserId, ...shuffled.slice(0, 6)]));

            const gRef = await addDoc(collection(db, "groups"), {
                name: gName,
                adminIds: [currentUserId],
                members: members,
                createdAt: Timestamp.now()
            });
            groupIds.push(gRef.id);
        }

        // 3. Create Matches & Stats
        // Create 3 past matches for the first group
        const targetGroupId = groupIds[0];

        for (let i = 1; i <= 3; i++) {
            // Past Date
            const date = new Date();
            date.setDate(date.getDate() - (i * 7)); // 1 week ago, 2 weeks ago...

            const matchRef = await addDoc(collection(db, "matches"), {
                groupId: targetGroupId,
                format: "7vs7",
                date: Timestamp.fromDate(date),
                pricePerPlayer: 5,
                createdBy: currentUserId,
                status: "FINISHED",
                createdAt: Timestamp.now(),
                playerCount: 7
            });

            // Add stats
            // Fetch group members? 
            // We know the members of group 0 include currentUserId and 6 randoms.
            // Let's just fake stats for 'members' array from Step 2? 
            // Accessing that here is hard without query. 
            // We'll just pick 7 random UIDs from our list.
            const players = userIds.slice(0, 7);

            const batch = writeBatch(db);
            players.forEach(pid => {
                const statsRef = doc(collection(db, "match_stats"));
                // Random performance
                const goals = Math.random() > 0.7 ? Math.floor(Math.random() * 3) : 0;
                const assists = Math.random() > 0.8 ? 1 : 0;
                const isMvp = Math.random() > 0.9;

                batch.set(statsRef, {
                    matchId: matchRef.id,
                    userId: pid,
                    paymentStatus: "PAID",
                    goals,
                    assists,
                    isMvp,
                    team: Math.random() > 0.5 ? "A" : "B",
                    createdAt: Timestamp.now()
                });
            });
            await batch.commit();
        }

        console.log("Seeding complete!");
        return true;
    } catch (e) {
        console.error("Seeding failed", e);
        throw e;
    }
};
