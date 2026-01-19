'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import DashboardNav from '@/components/DashboardNav';

import CreateGroupModal from '@/components/CreateGroupModal';
import CreateMatchModal from '@/components/CreateMatchModal';
import StatsTable from '@/components/StatsTable';
import MatchCard from '@/components/MatchCard';
import { Plus, Users } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function Home() {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('stats');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  // Fetch Matches
  useEffect(() => {
    const fetchMatches = () => {
      if (!user) return;
      setMatchesLoading(true);
      try {
        // Ideally filter by user participation or group
        // For MVP, admins see all, players see... all? Or just theirs? 
        // Prompt says "Mis Partidos". We'll fetch all future matches for now, 
        // or matches where user is involved (requires complex query or denormalization).
        // Let's fetch all 'SCHEDULED' matches for simplicity in this demo phase.
        const q = query(collection(db, 'matches'), orderBy('date', 'desc'), limit(20));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const fetchedMatches = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setMatches(fetchedMatches);
          setMatchesLoading(false);
        });
        return unsubscribe;
      } catch (error) {
        console.error("Error fetching matches", error);
        setMatchesLoading(false);
      }
    };

    if (user) {
      const unsub = fetchMatches();
      return () => { if (typeof unsub === 'function') unsub(); };
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (user && role) {
      console.log("Rol actual detectado:", role);
    }
  }, [user, loading, role, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white selection:bg-green-500/30">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        {/* Ambient Background Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">
              Welcome back, <span className="bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">{user.displayName}</span>
            </h1>
            <p className="text-gray-400 mt-1">Esto es lo que está sucediendo en tu liga.</p>
          </div>

          <DashboardNav activeTab={activeTab} onTabChange={setActiveTab} />


          {activeTab === 'stats' && (
            <StatsTable />
          )}

          {activeTab === 'matches' && (
            <div className="space-y-4">
              {matchesLoading ? (
                <div className="text-center py-10 text-gray-500">Cargando partidos...</div>
              ) : matches.length === 0 ? (
                <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg p-6 flex flex-col items-center justify-center min-h-[300px]">
                  <div className="text-gray-500 text-center">
                    <h3 className="text-lg font-medium text-white mb-2">No tienes partidos próximos</h3>
                    <p>Cuando te anotes a un partido aparecerá aquí.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isAdmin={role === 'admin' || role === 'superadmin'}
                      onViewDetails={(id) => alert(`Detalles del partido ${id} (Pendiente de Implementar)`)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'admin' && (
            <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {role === 'superadmin' && (
                  <button
                    onClick={() => setIsGroupModalOpen(true)}
                    className="flex items-center justify-center gap-3 p-6 bg-gray-800 hover:bg-gray-700/50 border border-gray-700 rounded-xl transition-all group"
                  >
                    <div className="p-3 bg-blue-500/20 rounded-full text-blue-400 group-hover:scale-110 transition-transform">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-white">Gestión de Grupos</h3>
                      <p className="text-sm text-gray-400">Crear y administrar grupos</p>
                    </div>
                  </button>
                )}

                {/* Match Management */}
                {(role === 'admin' || role === 'superadmin') && (
                  <button
                    onClick={() => setIsMatchModalOpen(true)}
                    className="flex items-center justify-center gap-3 p-6 bg-gray-800 hover:bg-gray-700/50 border border-gray-700 rounded-xl transition-all group"
                  >
                    <div className="p-3 bg-green-500/20 rounded-full text-green-400 group-hover:scale-110 transition-transform">
                      <Plus className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-white">Nuevo Partido</h3>
                      <p className="text-sm text-gray-400">Programar encuentro</p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          <CreateGroupModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} />
          <CreateMatchModal isOpen={isMatchModalOpen} onClose={() => setIsMatchModalOpen(false)} />
        </div>
      </main>
    </div>
  );
}
