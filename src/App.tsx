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
import { onedriveService, OneDriveUser } from './services/onedriveService';

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
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [onedriveUser, setOnedriveUser] = useState<OneDriveUser | null>(null);
  const [loadingOnedriveUser, setLoadingOnedriveUser] = useState(false);

  const isAuthCallback = window.location.pathname.includes('/auth/callback') || 
                         window.location.hash.includes('access_token=') || 
                         window.location.search.includes('access_token=') || 
                         window.location.search.includes('error=');

  useEffect(() => {
    // Detecta retorno de autenticação do OneDrive via hash fragment ou query params (relevante para logins no Vercel)
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    
    // Limpa o '#' do hash se houver para que URLSearchParams possa utilizá-lo corretamente
    const hashCleaned = hash.startsWith('#') ? hash.substring(1) : hash;
    const hashParams = new URLSearchParams(hashCleaned);
    const searchParams = new URLSearchParams(search);
    
    const token = hashParams.get('access_token') || searchParams.get('access_token');
    const errorDesc = hashParams.get('error_description') || searchParams.get('error_description') || 
                      hashParams.get('error') || searchParams.get('error');

    if (token) {
      localStorage.setItem('onedrive_token', token);
      
      // Se tiver abridor (janela popup), envia mensagem para a aba principal e se fecha
      if (window.opener) {
        try {
          window.opener.postMessage({ 
            type: 'ONEDRIVE_AUTH_SUCCESS',
            token: token
          }, '*');
        } catch (e) {
          console.error("Erro ao notificar janela principal:", e);
        }
        try {
          window.close();
        } catch (closeErr) {
          console.error("Erro ao fechar janela:", closeErr);
        }
      } else {
        // Se abriu na mesma aba, redefine para a raiz e recarrega
        window.history.replaceState({}, document.title, '/');
        window.location.reload();
      }
    } else if (errorDesc) {
      if (window.opener) {
        try {
          window.opener.postMessage({ 
            type: 'ONEDRIVE_AUTH_FAILURE',
            error: errorDesc
          }, '*');
        } catch (e) {
          console.error("Erro ao notificar falha:", e);
        }
        try {
          window.close();
        } catch (closeErr) {
          console.error("Erro ao fechar janela de erro:", closeErr);
        }
      } else {
        alert("Erro na Autenticação com OneDrive: " + errorDesc);
        window.history.replaceState({}, document.title, '/');
        window.location.reload();
      }
    }
  }, []);

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

  const checkOneDriveStatus = async () => {
    const token = localStorage.getItem('onedrive_token');
    if (!token) {
      setOnedriveUser(null);
      return;
    }
    setLoadingOnedriveUser(true);
    try {
      const userData = await onedriveService.getUser();
      setOnedriveUser(userData);
    } catch (e) {
      console.error("Erro ao verificar OneDrive no App level:", e);
      setOnedriveUser(null);
    } finally {
      setLoadingOnedriveUser(false);
    }
  };

  useEffect(() => {
    // Só verifica status se o usuário estiver autenticado no Firebase
    if (user) {
      checkOneDriveStatus();
    } else {
      setOnedriveUser(null);
    }
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ONEDRIVE_AUTH_SUCCESS') {
        const { token, refreshToken } = event.data;
        if (token) {
          localStorage.setItem('onedrive_token', token);
        }
        if (refreshToken) {
          localStorage.setItem('onedrive_refresh_token', refreshToken);
        }
        checkOneDriveStatus();
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  const handleOneDriveDisconnect = () => {
    localStorage.removeItem('onedrive_token');
    localStorage.removeItem('onedrive_refresh_token');
    setOnedriveUser(null);
    setProfileOpen(false);
    window.location.reload();
  };

  const handleOneDriveConnect = async () => {
    setProfileOpen(false);
    try {
      const url = await onedriveService.getAuthUrl();
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(url, 'onedrive_auth', `width=${width},height=${height},left=${left},top=${top}`);
    } catch (err: any) {
      alert(err.message || "Não foi possível iniciar a conexão com o OneDrive. Certifique-se de configurar o Client ID nas Configurações.");
      setActiveScreen('config');
    }
  };

  const resetSelection = () => {
    setSelectedSec(undefined);
    setSelectedSecForDepts(undefined);
    setSelectedDept(undefined);
  };

  if (isAuthCallback) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#f8fafc] gap-4 p-5 text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-blue-600 tracking-[0.25em] uppercase">Conectando OneDrive</p>
        <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
          Autenticando sua conta com o Microsoft Graph de forma segura e direta. Esta janela ou redirecionamento será finalizado e fechado em breve...
        </p>
      </div>
    );
  }

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
          <div className="flex items-center gap-4 shrink-0 relative">
             <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-semibold">
               <span onClick={() => { setActiveScreen('dashboard'); resetSelection(); }} className="hover:text-black cursor-pointer transition-colors">Início</span>
               <span>/</span>
               <span className="text-black font-semibold capitalize">{activeScreen}</span>
             </div>
             <div className="w-px h-6 bg-gray-200 hidden sm:block" />
             
             {/* Profile button container */}
             <div className="relative">
               <button 
                 id="user-profile-toggle"
                 onClick={() => setProfileOpen(!isProfileOpen)}
                 className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-50 bg-white shadow-sm hover:border-gray-300 transition-all focus:outline-none"
               >
                 {user?.photoURL ? (
                   <img src={user.photoURL} alt={profile?.nome || 'Usuário'} className="w-full h-full object-cover" />
                 ) : (
                   <UserIcon className="w-5 h-5 text-gray-400" />
                 )}
               </button>
               
               {/* Dropdown Menu */}
               <AnimatePresence>
                 {isProfileOpen && (
                   <>
                     {/* Overlay transparent background */}
                     <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                     
                     <motion.div
                       id="user-profile-dropdown"
                       initial={{ opacity: 0, y: 10, scale: 0.95 }}
                       animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 10, scale: 0.95 }}
                       className="absolute right-0 mt-2 w-72 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden z-50 py-2 origin-top-right font-sans"
                     >
                       {/* Header: User Info */}
                       <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                         <div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-gray-200">
                           {user?.photoURL ? (
                             <img src={user.photoURL} alt={profile?.nome || 'Usuário'} className="w-full h-full object-cover" />
                           ) : (
                             <UserIcon className="w-6 h-6 text-gray-400 m-2.5" />
                           )}
                         </div>
                         <div className="overflow-hidden">
                           <p className="text-sm font-bold text-gray-900 truncate">{profile?.nome || 'Usuário'}</p>
                           <p className="text-[10px] text-gray-500 truncate">{profile?.email || user?.email}</p>
                           <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                             {profile?.role || 'Apoiador'}
                           </span>
                         </div>
                       </div>

                       {/* OneDrive Integration Section */}
                       <div className="px-5 py-3 border-b border-gray-100 bg-slate-50/50">
                         <div className="flex items-center justify-between mb-2">
                           <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Microsoft OneDrive</span>
                           <span className={`w-2 h-2 rounded-full ${onedriveUser ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`} />
                         </div>
                         
                         {loadingOnedriveUser ? (
                           <div className="flex items-center gap-1.5 py-1.5 text-xs text-gray-400">
                             <div className="w-3.5 h-3.5 border-2 border-slate-350 border-t-transparent rounded-full animate-spin shrink-0" />
                             <span>Consultando OneDrive...</span>
                           </div>
                         ) : onedriveUser ? (
                           <div className="space-y-2">
                             <div className="text-xs text-slate-705">
                               <p className="font-bold truncate">{onedriveUser.displayName}</p>
                               <p className="text-[10px] text-slate-400 truncate">{onedriveUser.userPrincipalName}</p>
                             </div>
                             <button
                               id="onedrive-disconnect-btn"
                               onClick={handleOneDriveDisconnect}
                               className="w-full py-2 px-3 border border-rose-100 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
                             >
                               Desconectar OneDrive
                             </button>
                           </div>
                         ) : (
                           <div className="space-y-2">
                             <p className="text-[11px] text-gray-500 leading-normal">Seu OneDrive não está conectado a este navegador.</p>
                             <button
                               id="onedrive-connect-btn"
                               onClick={handleOneDriveConnect}
                               className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] cursor-pointer"
                             >
                               Conectar OneDrive
                             </button>
                           </div>
                         )}
                       </div>

                       {/* Actions list */}
                       <div className="px-2 pt-2">
                         <button
                           id="dropdown-goto-config"
                           onClick={() => {
                             setActiveScreen('config');
                             resetSelection();
                             setProfileOpen(false);
                           }}
                           className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-medium transition-colors"
                         >
                           <Settings className="w-4 h-4 text-gray-400" />
                           <span>Configurações</span>
                         </button>
                         <button
                           id="dropdown-logout"
                           onClick={() => {
                             handleLogout();
                             setProfileOpen(false);
                           }}
                           className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors"
                         >
                           <LogOut className="w-4 h-4 text-rose-400" />
                           <span>Sair do GestiPrev</span>
                         </button>
                       </div>
                     </motion.div>
                   </>
                 )}
               </AnimatePresence>
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
