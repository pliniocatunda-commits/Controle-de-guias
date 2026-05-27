import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  FileStack, 
  Settings, 
  LogOut, 
  User as UserIcon,
  Search,
  Menu,
  X,
  ShieldCheck,
  Cloud
} from 'lucide-react';
import { auth, googleProvider, db } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Usuario } from './types';
import Dashboard from './components/Dashboard';
import SecretariaList from './components/SecretariaList';
import DepartamentoList from './components/DepartamentoList';
import RelatorioConsolidado from './components/RelatorioConsolidado';
import GuiaList from './components/GuiaList';
import ComprovanteList from './components/ComprovanteList';
import OneDriveManager from './components/OneDriveManager';
import OneDriveConnector from './components/OneDriveConnector';
import { motion, AnimatePresence } from 'motion/react';

type Screen = 'dashboard' | 'secretarias' | 'guias' | 'comprovantes' | 'config' | 'onedrive';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');
  const [selectedSec, setSelectedSec] = useState<string | undefined>();
  const [selectedSecForDepts, setSelectedSecForDepts] = useState<string | undefined>();
  const [selectedDept, setSelectedDept] = useState<string | undefined>();
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'usuarios', u.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data() as Usuario);
        } else {
          // New user setup (default to admin for demo first user)
          const newProfile: Usuario = {
            id: u.uid,
            nome: u.displayName || 'Sem Nome',
            email: u.email || '',
            role: 'admin', 
            createdAt: serverTimestamp()
          };
          await setDoc(doc(db, 'usuarios', u.uid), newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Erro no login:", error);
      const currentDomain = window.location.hostname;
      if (error.code === 'auth/unauthorized-domain') {
        alert(`O domínio atual (${currentDomain}) não está autorizado no Firebase Console.\n\nPor favor, certifique-se de que '${currentDomain}' está na lista de 'Authorized domains' em Authentication > Settings no seu projeto Firebase.`);
      } else if (error.code === 'auth/popup-blocked') {
        alert("O login foi bloqueado pelo seu navegador. Por favor, tente abrir o aplicativo em uma nova aba usando o botão no canto superior direito.");
      } else {
        alert("Erro ao entrar com Google: " + error.message);
      }
    }
  };
  const handleLogout = () => signOut(auth);

  const resetSelection = () => {
    setSelectedSec(undefined);
    setSelectedSecForDepts(undefined);
    setSelectedDept(undefined);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f8fafc] gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-blue-600 tracking-[0.2em]">GESTAOPREV</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex bg-white overflow-hidden">
        <div className="hidden lg:flex w-1/2 p-20 flex-col justify-between bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#1E1B4B] text-white">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-white rounded flex items-center justify-center shadow-lg shadow-black/15">
                <ShieldCheck className="text-blue-600 w-5 h-5" />
             </div>
             <span className="font-bold tracking-widest text-lg">GestiPrev</span>
          </div>
          <div>
            <h1 className="text-6xl font-light leading-tight">
              Gestão de <span className="font-bold italic">guias</span> e <span className="font-bold border-b-2">comprovantes</span> previdenciários.
            </h1>
            <p className="mt-8 text-gray-400 max-w-md text-lg">
              Simplifique o controle mensal de obrigações fiscais da sua secretaria com segurança e transparência.
            </p>
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-widest">
            © 2024 GestiPrev Solution Arch.
          </div>
        </div>
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8">
           <div className="w-full max-w-sm">
              <h2 className="text-3xl font-bold mb-2">Bem-vindo</h2>
              <p className="text-gray-500 mb-8">Faça login para acessar o painel administrativo.</p>
              <button 
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-3 py-4 border-2 border-gray-100 rounded-2xl hover:bg-gray-50 transition-all font-bold text-gray-700 active:scale-[0.98]"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/pwa/google.svg" className="w-5 h-5" />
                Continuar com Google
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f5f5f5] overflow-hidden font-sans">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            className="w-[280px] bg-[#0F172A] text-white h-full flex flex-col z-40 fixed lg:relative border-r border-slate-800 shadow-xl"
          >
            <div className="p-8 pb-12 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-md shadow-blue-500/20">
                  <ShieldCheck className="text-white w-5 h-5" />
                </div>
                <span className="font-bold tracking-widest uppercase text-xs text-white">GestiPrev</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-2">
              <NavItem 
                active={activeScreen === 'dashboard'} 
                onClick={() => { setActiveScreen('dashboard'); resetSelection(); }}
                icon={<LayoutDashboard className="w-5 h-5" />}
                label="Visão Geral"
              />
              <NavItem 
                active={activeScreen === 'secretarias'} 
                onClick={() => { setActiveScreen('secretarias'); resetSelection(); }}
                icon={<Building2 className="w-5 h-5" />}
                label="Secretarias"
              />
              <NavItem 
                active={activeScreen === 'guias' && !selectedSec} 
                onClick={() => { setActiveScreen('guias'); resetSelection(); }}
                icon={<FileStack className="w-5 h-5" />}
                label="Todas as Guias"
              />
              <NavItem 
                active={activeScreen === 'comprovantes'} 
                onClick={() => { setActiveScreen('comprovantes'); resetSelection(); }}
                icon={<ShieldCheck className="w-5 h-5" />}
                label="Comprovantes"
              />
              <NavItem 
                active={activeScreen === 'onedrive'} 
                onClick={() => { setActiveScreen('onedrive'); resetSelection(); }}
                icon={<Cloud className="w-5 h-5" />}
                label="Arquivos OneDrive"
              />
              <div className="pt-8 mb-2 px-4 text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">
                Sistema
              </div>
              <NavItem 
                active={activeScreen === 'config'} 
                onClick={() => { setActiveScreen('config'); resetSelection(); }}
                icon={<Settings className="w-5 h-5" />}
                label="Configurações"
              />
            </nav>

            <div className="p-4 mt-auto">
              <div className="bg-slate-800/60 rounded-2xl p-4 flex items-center gap-3 border border-slate-800/50">
                 <div className="w-10 h-10 rounded-xl bg-slate-700 overflow-hidden">
                    <img src={user.photoURL} alt="" />
                 </div>
                 <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-bold truncate">{profile?.nome}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">{profile?.role}</p>
                 </div>
                 <button onClick={handleLogout} className="text-gray-500 hover:text-white transition-colors">
                    <LogOut className="w-5 h-5" />
                 </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 md:h-24 bg-white/90 backdrop-blur-md border-b border-gray-100 flex items-center px-4 md:px-8 justify-between sticky top-0 z-30 transition-all">
          <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
             {!isSidebarOpen && (
               <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg shrink-0">
                 <Menu className="w-5 h-5" />
               </button>
             )}
             <div className="flex flex-col min-w-0">
               <span className="text-[9px] md:text-xs font-bold text-blue-600 uppercase tracking-wider md:tracking-widest truncate leading-tight">
                 IPME - Instituto de Previdência dos Servidores Públicos Municipais de Eusébio
               </span>
               <h2 className="text-xs sm:text-sm md:text-base font-black text-gray-900 tracking-tight leading-normal uppercase truncate mt-0.5 md:mt-1">
                 Controle de Pagamentos - GRCP
               </h2>
             </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
             <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-semibold">
               <span onClick={() => { setActiveScreen('dashboard'); resetSelection(); }} className="hover:text-black cursor-pointer transition-colors">Início</span>
               <span>/</span>
               <span className="text-black font-semibold capitalize">{activeScreen}</span>
             </div>
             <div className="w-px h-6 bg-gray-200 hidden sm:block" />
             <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center p-1 cursor-pointer hover:bg-gray-50">
                <UserIcon className="w-5 h-5 text-gray-400" />
             </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeScreen === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
              >
                <Dashboard />
              </motion.div>
            )}
            
            {activeScreen === 'secretarias' && !selectedSec && !selectedSecForDepts && (
              <motion.div 
                 key="secretaria-list"
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: -20 }}
              >
                <SecretariaList 
                  onSelect={(id) => setSelectedSec(id)} 
                  onSelectDepartments={(id) => setSelectedSecForDepts(id)}
                />
              </motion.div>
            )}

            {activeScreen === 'secretarias' && selectedSecForDepts && !selectedDept && (
              <motion.div 
                 key="departamentos"
                 initial={{ opacity: 0, scale: 0.98 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 1.02 }}
              >
                <DepartamentoList 
                  secretariaId={selectedSecForDepts} 
                  onBack={() => setSelectedSecForDepts(undefined)} 
                  onSelectDepartamento={(id) => setSelectedDept(id)}
                />
              </motion.div>
            )}

            {activeScreen === 'secretarias' && selectedSec && !selectedDept && (
              <motion.div 
                 key="consolidated-report"
                 initial={{ opacity: 0, scale: 0.98 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 1.02 }}
              >
                <RelatorioConsolidado 
                  secretariaId={selectedSec} 
                  onBack={() => setSelectedSec(undefined)} 
                />
              </motion.div>
            )}

            {(activeScreen === 'guias' || (activeScreen === 'secretarias' && selectedDept)) && (
              <motion.div 
                key="guias"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <GuiaList 
                  departamentoId={selectedDept} 
                  onBack={() => setSelectedDept(undefined)} 
                />
              </motion.div>
            )}

            {activeScreen === 'config' && (
              <motion.div 
                key="config"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="p-8 max-w-[1240px] mx-auto space-y-8"
              >
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-gray-900">Configurações</h1>
                  <p className="text-gray-500 text-sm mt-1">Gerencie integrações e preferências do sistema GestiPrev</p>
                </div>

                {/* OneDrive Configuration Integration */}
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-gray-900">Conexões & Serviços</h2>
                  <OneDriveConnector />
                </div>

                {/* System Settings Status */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-550" />
                    Informações do Sistema
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs text-gray-600">
                    <div className="space-y-1">
                      <span className="font-semibold text-gray-400 block uppercase tracking-wider text-[10px]">Função do Usuário</span>
                      <span className="font-bold text-gray-950 text-sm uppercase">{profile?.role || 'Buscando...'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="font-semibold text-gray-400 block uppercase tracking-wider text-[10px]">E-mail Vinculado</span>
                      <span className="font-bold text-gray-950 text-sm">{profile?.email || 'Buscando...'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="font-semibold text-gray-400 block uppercase tracking-wider text-[10px]">Ambiente Ativo</span>
                      <span className="font-bold text-emerald-600 text-sm uppercase flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Ambiente em Nuvem Ativo
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeScreen === 'comprovantes' && (
              <motion.div 
                key="comprovantes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <ComprovanteList />
              </motion.div>
            )}

            {activeScreen === 'onedrive' && (
              <motion.div 
                key="onedrive"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
              >
                <OneDriveManager />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' 
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && (
        <motion.div 
          layoutId="activePill"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-white lg:hidden" 
        />
      )}
    </button>
  );
}
