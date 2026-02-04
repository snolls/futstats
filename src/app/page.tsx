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
import GroupFinderModal from '@/components/GroupFinderModal';
import MatchDetailModal from '@/components/MatchDetailModal';
import { Plus, Users, Settings, Shield, Contact, Search } from 'lucide-react';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs, getDoc, updateDoc, doc, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import ConfirmationModal from '@/components/ConfirmationModal';

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
// Helper to fetch and display admin name
function AdminNameDisplay({ adminIds }: { adminIds?: string[] }) {
  const [adminName, setAdminName] = useState<string>("Cargando...");

  useEffect(() => {
    if (!adminIds || adminIds.length === 0) {
      setAdminName("Sin Admin");
      return;
    }
    const adminId = adminIds[0]; // Show first admin
    const fetchAdmin = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', adminId));
        if (docSnap.exists()) {
          setAdminName(docSnap.data().displayName || "Usuario");
        } else {
          setAdminName("Desconocido");
        }
      } catch (e) {
        setAdminName("Error");
      }
    };
    fetchAdmin();
  }, [adminIds]);

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-500 font-medium bg-amber-900/10 border border-amber-500/20 px-2 py-1 rounded w-fit mt-1">
      <span>👑</span>
      <span>{adminName}</span>
    </div>
  );
}

export default function Home() {
  const { user, loading, userData } = useAuthContext();
  const role = userData?.role;
  const router = useRouter();

  // --- SECCIÓN DE ESTADOS (STATE) ---
  const [activeTab, setActiveTab] = useState('stats');

  // Estados para controlar la visibilidad de los Modales
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [isGroupFinderOpen, setIsGroupFinderOpen] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Estados de DATOS (Partidos y Grupos)
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const [managedGroups, setManagedGroups] = useState<GroupData[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupData | null>(null);

  // --- ESTADOS PARA RANKING CONTEXTUAL ---
  const [rankingGroupId, setRankingGroupId] = useState<string | null>(null);
  const [availableRankingGroups, setAvailableRankingGroups] = useState<{ id: string, name: string }[]>([]);

  // --- ADMIN REQUESTS STATE (Superadmin Only) ---
  const [adminRequests, setAdminRequests] = useState<any[]>([]);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as 'info' | 'danger',
    onConfirm: () => { }
  });

  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (role !== 'superadmin' || activeTab !== 'overview') return;

    // Listen for pending admin requests
    const q = query(collection(db, 'users'), where('adminRequestStatus', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => {
      setAdminRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [role, activeTab]);

  const handleAdminRequest = (userId: string, action: 'approve' | 'reject') => {
    setConfirmModal({
      isOpen: true,
      title: action === 'approve' ? 'Aprobar Solicitud' : 'Rechazar Solicitud',
      message: `¿Estás seguro de que quieres ${action === 'approve' ? 'aprobar' : 'rechazar'} esta solicitud de administrador?`,
      type: action === 'approve' ? 'info' : 'danger',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'users', userId), {
            role: action === 'approve' ? 'admin' : 'user',
            adminRequestStatus: action === 'approve' ? null : 'rejected'
          });
          toast.success(`Solicitud ${action === 'approve' ? 'aprobada' : 'rechazada'}.`);
        } catch (e) {
          console.error("Error managing request:", e);
          toast.error("Error al procesar solicitud.");
        }
      }
    });
  };

  // --- EFECTOS (USEEFFECT) ---

  // 1. Protección de Ruta
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
        if (data.onboardingCompleted === false || data.onboardingCompleted === undefined) {
          setShowOnboarding(true);
        } else {
          setShowOnboarding(false);
        }
      } else {
        setShowOnboarding(true);
      }
    });
    return () => unsub();
  }, [user]);

  // 2. Carga de Partidos
  // 2. Carga de Partidos: Se ejecuta cuando hay un usuario logueado
  // Se suscribe a cambios en tiempo real (onSnapshot) con FILTRADO DE SEGURIDAD
  // 2. Carga de Partidos: Se ejecuta cuando hay un usuario logueado
  // Se suscribe a cambios en tiempo real (onSnapshot) con FILTRADO DE SEGURIDAD
  const myGroupIds = userData?.associatedGroups || [];
  const myGroupIdsStr = JSON.stringify(myGroupIds.slice().sort()); // Stable dependency

  useEffect(() => {
    const fetchMatches = () => {
      // Si estamos cargando auth o no hay usuario, no hacemos nada
      if (loading || !user) return;

      setMatchesLoading(true);

      try {
        let q;

        // ESTRATEGIA DE FILTRADO

        // CASO 1: Superadmin (Ve todo)
        if (role === 'superadmin') {
          q = query(collection(db, 'matches'), orderBy('date', 'desc'), limit(20));
        }

        // CASO 2: Usuario Normal / Admin (Solo ve sus grupos)
        else {
          const groupIds = JSON.parse(myGroupIdsStr);

          if (groupIds.length === 0) {
            setMatches([]);
            setMatchesLoading(false);
            return;
          }

          // LIMITACIÓN FIRESTORE: 'in' soporta máx 10 valores.
          // Solución temporal: Tomamos los primeros 10 grupos. 
          // Si el usuario tiene más de 10 grupos, solo verá partidos de los primeros 10.
          // TODO: Implementar paginación o múltiples queries si es necesario escalar.
          const safeGroupIds = groupIds.slice(0, 10);

          q = query(
            collection(db, 'matches'),
            where('groupId', 'in', safeGroupIds),
            orderBy('date', 'desc'),
            limit(20)
          );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const fetchedMatches = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setMatches(fetchedMatches);
          setMatchesLoading(false);
        }, (error) => {
          console.error("Error fetching matches:", error);
          setMatchesLoading(false);

          if (error.code === 'failed-precondition') {
            // Esto ocurre si falta el índice compuesto.
            toast.error("Falta un índice en la base de datos", {
              description: "Por favor, notifica al administrador para que lo cree en la consola de Firebase."
            });
          } else if (error.code === 'permission-denied') {
            setMatches([]); // Simplemente no mostramos nada si no hay permiso
          }
        });

        return unsubscribe;

      } catch (error) {
        console.error("Error setting up match listener", error);
        setMatchesLoading(false);
      }
    };

    const unsub = fetchMatches();
    return () => { if (typeof unsub === 'function') unsub(); };

  }, [user, loading, role, myGroupIdsStr]);

  // 3. Carga de Grupos Gestionados
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

  // 4. Cargar Grupos para Ranking Contextual
  useEffect(() => {
    const fetchRankingGroups = async () => {
      if (!user) return;

      try {
        let groupsToFetch: string[] = [];

        if (role === 'superadmin') {
          const allGroupsSnap = await getDocs(query(collection(db, 'groups'), orderBy('name')));
          const allGroups = allGroupsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
          setAvailableRankingGroups(allGroups);
          return;
        }

        if (userData?.associatedGroups && userData.associatedGroups.length > 0) {
          groupsToFetch = [...userData.associatedGroups];
        }

        if (groupsToFetch.length > 0) {
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
    console.debug("Groups list refreshed via snapshot");
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

          {/* Admin Request Button for Regular Users */}
          {role === 'user' && (
            <div className="flex justify-center sm:justify-end">
              {!userData?.adminRequestStatus ? (
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: "Solicitar Rol de Organizador",
                      message: "¿Quieres solicitar permisos de Organizador (Admin)? Esto te permitirá crear grupos y partidos. Un Superadmin deberá aprobar tu solicitud.",
                      type: 'info',
                      onConfirm: async () => {
                        try {
                          await updateDoc(doc(db, 'users', user.uid), { adminRequestStatus: 'pending' });
                          toast.success("Solicitud enviada correctamente.");
                        } catch (e) {
                          console.error("Error requesting admin:", e);
                          toast.error("Error al enviar solicitud.");
                        }
                      }
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-amber-500 border border-amber-500/30 rounded-lg hover:bg-amber-900/10 transition-colors flex items-center gap-2"
                >
                  🚀 Solicitar cuenta de Organizador
                </button>
              ) : userData.adminRequestStatus === 'pending' ? (
                <span className="px-4 py-2 text-sm font-medium text-yellow-500 bg-yellow-900/10 border border-yellow-500/20 rounded-lg cursor-default flex items-center gap-2">
                  ⏳ Solicitud de Admin en revisión
                </span>
              ) : userData.adminRequestStatus === 'rejected' && (
                <span className="px-4 py-2 text-sm font-medium text-red-400 bg-red-900/10 border border-red-500/20 rounded-lg cursor-default">
                  ❌ Solicitud rechazada
                </span>
              )}
            </div>
          )}

          <div className="w-full">
            {/* Navegación por Pestañas */}
            <DashboardNav activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* --- RENDERIZADO CONDICIONAL DE CONTENIDO --- */}

          {/* 1. Vista de ESTADÍSTICAS */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4">
                  <button
                    onClick={() => setIsGroupFinderOpen(true)}
                    className="text-sm text-blue-400 hover:text-white flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                  >
                    <Search className="w-4 h-4" />
                    Explorar Grupos
                  </button>

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
            </div>
          )}

          {/* 2. Vista de PARTIDOS */}
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
                  {matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isAdmin={role === 'admin' || role === 'superadmin'}
                      onViewDetails={(id) => setSelectedMatchId(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. Vista de DIRECTORIO DE USUARIOS */}
          {activeTab === 'users' && (
            <UserDirectory currentUser={{ ...user, role: role || 'user' }} />
          )}

          {/* 4. Vista de GESTIÓN */}
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
              {role === 'superadmin' && adminRequests.length > 0 && (
                <div className="bg-amber-900/10 backdrop-blur-md border border-amber-500/30 rounded-xl overflow-hidden shadow-lg p-6 mb-8">
                  <h2 className="text-lg font-semibold text-amber-500 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Solicitudes de Administrador ({adminRequests.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {adminRequests.map((reqUser: any) => (
                      <div key={reqUser.id} className="bg-gray-950 border border-amber-500/20 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white">{reqUser.displayName || "Usuario"}</p>
                          <p className="text-xs text-gray-400">{reqUser.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAdminRequest(reqUser.id, 'approve')}
                            className="p-1.5 bg-green-500/20 text-green-500 rounded hover:bg-green-500/40 transition-colors" title="Aprobar"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleAdminRequest(reqUser.id, 'reject')}
                            className="p-1.5 bg-red-500/20 text-red-500 rounded hover:bg-red-500/40 transition-colors" title="Rechazar"
                          >
                            <Settings className="w-4 h-4 rotate-45" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                            <div className="flex flex-col gap-1 mt-1">
                              <p className="text-xs text-gray-500">ID: {group.id.slice(0, 8)}...</p>
                              {role === 'superadmin' && <AdminNameDisplay adminIds={group.adminIds} />}
                            </div>
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
          <CreateGroupModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} />
          <CreateMatchModal isOpen={isMatchModalOpen} onClose={() => setIsMatchModalOpen(false)} />
          <EditGroupModal
            isOpen={isEditGroupModalOpen}
            onClose={() => setIsEditGroupModalOpen(false)}
            groupData={selectedGroup}
            onUpdate={refreshGroups}
          />
          <GroupFinderModal
            isOpen={isGroupFinderOpen}
            onClose={() => setIsGroupFinderOpen(false)}
          />

          {selectedMatchId && (
            <MatchDetailModal
              matchId={selectedMatchId}
              isOpen={!!selectedMatchId}
              onClose={() => setSelectedMatchId(null)}
            />
          )}

          <ConfirmationModal
            isOpen={confirmModal.isOpen}
            onClose={closeConfirm}
            onConfirm={confirmModal.onConfirm}
            title={confirmModal.title}
            message={confirmModal.message}
            type={confirmModal.type}
          />

          {showOnboarding && <OnboardingModal forceOpen={true} />}
        </div>
      </main>
    </div>
  );
}
