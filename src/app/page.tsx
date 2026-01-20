'use client';

import { useAuthContext } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import DashboardNav from '@/components/DashboardNav';

import CreateGroupModal from '@/components/CreateGroupModal';
import CreateMatchModal from '@/components/CreateMatchModal';
import EditGroupModal from '@/components/EditGroupModal';
import StatsTable from '@/components/StatsTable';
import MatchCard from '@/components/MatchCard';
import UserDirectory from '@/components/UserDirectory';
import OnboardingModal from '@/components/OnboardingModal';
import { Plus, Users, Settings, Shield, Contact } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs, updateDoc, doc, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface GroupData {
  id: string;
  name: string;
  adminIds: string[];
  members?: string[];
  createdAt?: any;
}

// ----------------------------------------------------------------------
// PÁGINA PRINCIPAL (DASHBOARD)
// Esta es la vista central de la aplicación.
// Muestra estadísticas, partidos y paneles de gestión según el rol.
// ----------------------------------------------------------------------
export default function Home() {
  const { user, loading, userData } = useAuthContext();
  const role = userData?.role;
  const router = useRouter();

  // --- SECCIÓN DE ESTADOS (STATE) ---
  // Control de la pestaña activa en el dashboard (stats, matches, users, overview)
  const [activeTab, setActiveTab] = useState('stats');

  // Estados para controlar la visibilidad de los Modales (ventanas emergentes)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);

  // Estados de DATOS (Partidos y Grupos)
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const [managedGroups, setManagedGroups] = useState<GroupData[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupData | null>(null);

  // --- ESTADOS PARA RANKING CONTEXTUAL ---
  const [rankingGroupId, setRankingGroupId] = useState<string | null>(null);
  const [availableRankingGroups, setAvailableRankingGroups] = useState<{ id: string, name: string }[]>([]);

  // --- EFECTOS (USEEFFECT) ---

  // 1. Protección de Ruta: Si no hay usuario, redirigir al login
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // 1.5. Real-time User Data Listener for Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // If onboarding is NOT completed, show modal
        if (data.onboardingCompleted === false || data.onboardingCompleted === undefined) {
          setShowOnboarding(true);
        } else {
          setShowOnboarding(false);
        }
      } else {
        // User doc doesn't exist yet (e.g. fresh google login before trigger)
        // We can assume we need onboarding, or wait for creation. 
        // Usually trigger creates it, or we create it here if missing?
        // For now, let's show onboarding if missing, assuming modal handles creation/update
        setShowOnboarding(true);
      }
    });
    return () => unsub();
  }, [user]);

  // 2. Carga de Partidos: Se ejecuta cuando hay un usuario logueado
  // Se suscribe a cambios en tiempo real (onSnapshot)
  useEffect(() => {
    const fetchMatches = () => {
      if (!user) return;
      setMatchesLoading(true);
      try {
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

  // 3. Carga de Grupos Gestionados: Solo para Admins/Superadmins en la pestaña 'overview'
  useEffect(() => {
    const fetchGroups = () => {
      if (!user || !role || activeTab !== 'overview') return;

      setGroupsLoading(true);
      try {
        let q;
        if (role === 'superadmin') {
          q = query(collection(db, 'groups'), orderBy('name'));
        } else if (role === 'admin') {
          q = query(collection(db, 'groups'), where('adminIds', 'array-contains', user.uid));
        } else {
          setManagedGroups([]);
          setGroupsLoading(false);
          return;
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const groups = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as GroupData[];
          setManagedGroups(groups);
          setGroupsLoading(false);
        });
        return unsubscribe;
      } catch (error) {
        console.error("Error loading groups:", error);
        setGroupsLoading(false);
      }
    };

    if (activeTab === 'overview') {
      const unsub = fetchGroups();
      return () => { if (typeof unsub === 'function') unsub(); }
    }
  }, [user, role, activeTab]);

  // 4. Cargar Grupos para Ranking Contextual (Dropdown)
  useEffect(() => {
    const fetchRankingGroups = async () => {
      if (!user) return;

      try {
        let groupsToFetch: string[] = [];

        if (role === 'superadmin') {
          // Superadmin ve todos los grupos
          const allGroupsSnap = await getDocs(query(collection(db, 'groups'), orderBy('name')));
          const allGroups = allGroupsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
          setAvailableRankingGroups(allGroups);
          return;
        }

        // Usuarios normales: Basado en associatedGroups y adminIds
        // Usamos associatedGroups del perfil si existe
        if (userData?.associatedGroups && userData.associatedGroups.length > 0) {
          groupsToFetch = [...userData.associatedGroups];
        }

        // Si es admin, asegurar que sus grupos gestionados también estén (por redundancia)
        // Aunque el fix de sync debería haberlo cubierto.

        if (groupsToFetch.length > 0) {
          // Firestore 'in' query limit is 10. Chunk it.
          const chunks = [];
          const fetchedGroups: { id: string, name: string }[] = [];
          for (let i = 0; i < groupsToFetch.length; i += 10) {
            const chunk = groupsToFetch.slice(i, i + 10);
            const q = query(collection(db, 'groups'), where(documentId(), 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => fetchedGroups.push({ id: d.id, name: d.data().name }));
          }
          setAvailableRankingGroups(fetchedGroups.sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          setAvailableRankingGroups([]);
        }

      } catch (error) {
        console.error("Error loading ranking groups:", error);
      }
    };

    if (activeTab === 'stats') {
      fetchRankingGroups();
    }
  }, [user, role, userData, activeTab]);

  const handleEditGroup = (group: GroupData) => {
    setSelectedGroup(group);
    setIsEditGroupModalOpen(true);
  };

  const refreshGroups = () => {
    // Snapshot listener handles refresh automatically, 
    // but if we used getDocs we would call fetchGroups here.
  };

  const handleSanitizeGroups = async () => {
    if (role !== 'superadmin') return;
    const confirm = window.confirm("¿Ejecutar script de sanitización de grupos? Esto eliminará usuarios fantasma.");
    if (!confirm) return;

    try {
      // 1. Fetch ALL Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const existingUserIds = new Set(usersSnap.docs.map(d => d.id));

      // 2. Fetch ALL Groups
      const groupsSnap = await getDocs(collection(db, 'groups'));
      let fixedCount = 0;

      // 3. Iterate and Fix
      for (const groupDoc of groupsSnap.docs) {
        const groupData = groupDoc.data();
        const currentMembers = groupData.memberIds || []; // Using memberIds as per user request/standard
        // Note: Check legacy 'members' field if exists, but standardizing on memberIds/members based on usage. 
        // Based on previous edits, we use 'members' in UserDetailModal/EditGroupModal.
        // Let's check both or stick to 'members' as seen in other files.
        // EditGroupModal uses 'members' array in Firestore (from my previous fix).
        // The user request says "Filtrar su array memberIds". I'll try to support 'members' which is what I used in atomic fix.

        const memberArray = groupData.members || [];
        const validMembers = memberArray.filter((uid: string) => existingUserIds.has(uid));

        if (validMembers.length !== memberArray.length) {
          await updateDoc(doc(db, 'groups', groupDoc.id), {
            members: validMembers
          });
          fixedCount++;
        }
      }

      alert(`Limpieza completada. Se corrigieron ${fixedCount} grupos.`);
    } catch (err) {
      console.error("Error sanitizing groups:", err);
      alert("Error al ejecutar el script.");
    }
  };

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

      <main className="min-h-screen w-full max-w-[100vw] overflow-x-hidden p-4 md:p-8 relative">
        {/* Ambient Background Effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto space-y-6">
          {/* --- ENCABEZADO: Bienvenida --- */}
          <div className="items-center text-center sm:text-left">
            <h1 className="text-2xl md:text-4xl font-bold">
              Bienvenido, <span className="bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">{user.displayName}</span>
            </h1>
            <p className="text-gray-400 mt-1">Gestiona tus estadísticas y partidos.</p>
          </div>

          <div className="w-full">
            {/* Navegación por Pestañas (Componente hijo) */}
            <DashboardNav activeTab={activeTab} onTabChange={setActiveTab} />
          </div>


          {/* --- RENDERIZADO CONDICIONAL DE CONTENIDO --- */}

          {/* 1. Vista de ESTADÍSTICAS */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              {/* Context Selector */}
              <div className="flex justify-end">
                <div className="relative inline-block w-full sm:w-64">
                  <select
                    value={rankingGroupId || ""}
                    onChange={(e) => setRankingGroupId(e.target.value === "" ? null : e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2 appearance-none focus:ring-2 focus:ring-green-500/50 outline-none"
                  >
                    <option value="">🏆 Ranking Global</option>
                    {availableRankingGroups.map(g => (
                      <option key={g.id} value={g.id}>🛡️ {g.name}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                    <Shield className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <StatsTable selectedGroupId={rankingGroupId} />
            </div>
          )}

          {/* 2. Vista de PARTIDOS (Próximos encuentros) */}
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
                      onViewDetails={(id) => alert(`Detalles (Pendiente): ${id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. Vista de DIRECTORIO DE USUARIOS (Solo Admins) */}
          {activeTab === 'users' && (
            <UserDirectory currentUser={{ ...user, role: role || 'user' }} />
          )}

          {/* 4. Vista de GESTIÓN (Panel de Admin/Overview) */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Admin Actions */}
              <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-400" />
                  Acciones Rápidas
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {['superadmin', 'admin'].includes(role || '') && (
                    <button
                      onClick={() => setIsGroupModalOpen(true)}
                      className="flex items-center justify-center gap-3 p-6 bg-gray-800 hover:bg-gray-700/50 border border-gray-700 rounded-xl transition-all group"
                    >
                      <div className="p-3 bg-blue-500/20 rounded-full text-blue-400 group-hover:scale-110 transition-transform">
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-lg font-semibold text-white">Gestión de Grupos</h3>
                        <p className="text-sm text-gray-400">Crear un nuevo grupo</p>
                      </div>
                    </button>
                  )}

                  {(role === 'admin' || role === 'superadmin') && (
                    <>
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

                      <button
                        onClick={() => setActiveTab('users')}
                        className="flex items-center justify-center gap-3 p-6 bg-gray-800 hover:bg-gray-700/50 border border-gray-700 rounded-xl transition-all group"
                      >
                        <div className="p-3 bg-indigo-500/20 rounded-full text-indigo-400 group-hover:scale-110 transition-transform">
                          <Contact className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-lg font-semibold text-white">Directorio</h3>
                          <p className="text-sm text-gray-400">Ver listado de jugadores</p>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Managed Groups Section */}
              <div className="bg-gray-900/50 backdrop-blur-md border border-gray-800 rounded-xl overflow-hidden shadow-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-400" />
                  Mis Grupos Gestionados
                </h2>

                {groupsLoading ? (
                  <div className="text-center py-8 text-gray-500">Cargando grupos...</div>
                ) : managedGroups.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-gray-950/30 rounded-lg border border-gray-800 border-dashed">
                    No gestionas ningún grupo actualmente.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {managedGroups.map(group => (
                      <div key={group.id} className="bg-gray-950 border border-gray-800 p-5 rounded-xl hover:border-blue-500/30 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-semibold text-white text-lg">{group.name}</h3>
                            <p className="text-xs text-gray-500 mt-1">ID: {group.id.slice(0, 8)}...</p>
                          </div>
                          <div className="bg-gray-800 px-2 py-1 rounded text-xs text-gray-400 font-mono">
                            {group.members?.length || 0} Miembros
                          </div>
                        </div>
                        <button
                          onClick={() => handleEditGroup(group)}
                          className="w-full py-2 bg-gray-800 hover:bg-blue-600 hover:text-white text-gray-300 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <Settings className="w-4 h-4" />
                          Administrar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- MODALES O VENTANAS EMERGENTES --- */}
          {/* Se renderizan ocultos hasta que su estado 'isOpen' sea true */}
          <CreateGroupModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} />
          <CreateMatchModal isOpen={isMatchModalOpen} onClose={() => setIsMatchModalOpen(false)} />
          <EditGroupModal
            isOpen={isEditGroupModalOpen}
            onClose={() => setIsEditGroupModalOpen(false)}
            groupData={selectedGroup}
            onUpdate={refreshGroups}
          />

          {/* --- ONBOARDING OBLIGATORIO --- */}
          {showOnboarding && <OnboardingModal forceOpen={true} />}
        </div>
      </main>
    </div>
  );
}
