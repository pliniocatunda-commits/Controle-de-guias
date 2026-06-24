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
  Cloud,
  Lock
} from 'lucide-react';
import { auth, googleProvider, db, runWithTimeout } from './lib/firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  updatePassword 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { Usuario } from './types';
import Dashboard from './components/Dashboard';
import SecretariaList from './components/SecretariaList';
import DepartamentoList from './components/DepartamentoList';
import RelatorioConsolidado from './components/RelatorioConsolidado';
import GuiaList from './components/GuiaList';
import ComprovanteList from './components/ComprovanteList';
import OneDriveManager from './components/OneDriveManager';
import OneDriveConnector from './components/OneDriveConnector';
import UsuarioManager from './components/UsuarioManager';
import ErrorBoundary from './components/ErrorBoundary';
import IpmeLogo from './components/IpmeLogo';
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

  // States for Institutional Login credentials & password modification
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // States for logged-in user password change inside Profile view
  const [newProfilePassword, setNewProfilePassword] = useState('');
  const [passwordUpdateSuccess, setPasswordUpdateSuccess] = useState<string | null>(null);
  const [passwordUpdateError, setPasswordUpdateError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

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
      try {
        if (u) {
          const userDoc = await runWithTimeout(
            getDoc(doc(db, 'usuarios', u.uid)),
            3500,
            'Timeout ao buscar perfil do usuário.'
          );
          const emailLower = u.email?.toLowerCase();
          
          if (userDoc.exists()) {
            const profileData = userDoc.data() as Usuario;
            // Force master role if user is Pliniocatunda@gmail.com
            if (emailLower === 'pliniocatunda@gmail.com' && profileData.role !== 'master') {
              const updatedProfile = { ...profileData, role: 'master' as const };
              await runWithTimeout(
                setDoc(doc(db, 'usuarios', u.uid), updatedProfile, { merge: true }),
                3500,
                'Timeout ao atualizar perfil.'
              );
              setProfile(updatedProfile);
            } else {
              setProfile(profileData);
            }
          } else {
            // Check if there is an existing design/profile created manually by the admin for this email (with temp ID)
            const q = query(collection(db, "usuarios"), where("email", "==", emailLower));
            const querySnap = await runWithTimeout(
              getDocs(q),
              3500,
              'Timeout ao verificar perfis existentes.'
            );
            
            if (!querySnap.empty) {
              const existingDoc = querySnap.docs[0];
              const existingData = existingDoc.data();
              const mergedProfile: Usuario = {
                ...existingData,
                id: u.uid,
                email: emailLower || existingData.email,
              } as Usuario;

              // Write the true UID profile and safely delete the temporary document
              await runWithTimeout(
                setDoc(doc(db, 'usuarios', u.uid), mergedProfile),
                3500,
                'Timeout ao salvar novo perfil mesclado.'
              );
              await runWithTimeout(
                deleteDoc(existingDoc.ref),
                3500,
                'Timeout ao remover perfil temporário.'
              );
              setProfile(mergedProfile);
            } else {
              // If profile doc doesn't exist yet, we check if it's the designated master user. Otherwise default to 'consulta'.
              const isMasterEmail = emailLower === 'pliniocatunda@gmail.com';
              const newProfile: Usuario = {
                id: u.uid,
                nome: u.displayName || u.email?.split('@')[0] || 'Sem Nome',
                email: u.email || '',
                role: isMasterEmail ? 'master' : 'consulta', 
                createdAt: new Date().toISOString()
              };
              await runWithTimeout(
                setDoc(doc(db, 'usuarios', u.uid), newProfile),
                3500,
                'Timeout ao criar novo perfil.'
              );
              setProfile(newProfile);
            }
          }
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Erro ao carregar perfil do usuário:", err);
        // Fallback for forcing profile on master user even on firestore read block
        if (u) {
          const emailLower = u.email?.toLowerCase();
          const isMasterEmail = emailLower === 'pliniocatunda@gmail.com';
          setProfile({
            id: u.uid,
            nome: u.displayName || u.email?.split('@')[0] || 'Sem Nome',
            email: u.email || '',
            role: isMasterEmail ? 'master' : 'consulta',
            createdAt: new Date().toISOString()
          });
        } else {
          setProfile(null);
        }
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.warn("Aviso ou erro no login:", error);
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

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch (error: any) {
      console.warn("Aviso de login institucional (e-mail ou senha incorretos):", error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setLoginError("E-mail e/ou senha incorretos ou usuário inexistente.");
      } else if (error.code === 'auth/invalid-email') {
        setLoginError("O formato do e-mail é inválido.");
      } else {
        setLoginError("Falha na autenticação: " + error.message);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      setResetEmailSent(true);
    } catch (error: any) {
      console.warn("Aviso ao redefinir senha:", error);
      if (error.code === 'auth/user-not-found') {
        setLoginError("A conta com este e-mail não foi localizada.");
      } else if (error.code === 'auth/invalid-email') {
        setLoginError("O formato do e-mail é inválido.");
      } else {
        setLoginError("Não foi possível enviar o reset de senha: " + error.message);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUpdateProfilePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordUpdateSuccess(null);
    setPasswordUpdateError(null);

    if (newProfilePassword.length < 6) {
      setPasswordUpdateError("A senha deve conter ao menos 6 caracteres.");
      return;
    }

    setUpdatingPassword(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newProfilePassword);
        setPasswordUpdateSuccess("Sua senha foi redefinida com sucesso!");
        setNewProfilePassword('');
      } else {
        setPasswordUpdateError("Sessão expirada. Faça login novamente.");
      }
    } catch (error: any) {
      console.warn("Aviso ao atualizar senha:", error);
      if (error.code === 'auth/requires-recent-login') {
        setPasswordUpdateError("Para alterar sua senha, é necessário realizar login recentemente. Faça logout e logue novamente antes de tentar.");
      } else {
        setPasswordUpdateError(error.message || "Erro desconhecido ao redefinir sua senha.");
      }
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("trabalho_mes");
    sessionStorage.removeItem("trabalho_ano");
    signOut(auth);
  };

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
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        window.location.href = url;
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      const popup = window.open(url, 'onedrive_auth', `width=${width},height=${height},left=${left},top=${top}`);
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = url;
      }
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
          <div className="text-xs text-gray-400 space-y-1">
            <p className="font-medium text-slate-300">© 2026 LPC sistemas e assessoria. Todos os direitos reservados.</p>
          </div>
        </div>
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 relative overflow-y-auto">
           <div className="w-full max-w-sm py-12 md:py-0">
              <h2 className="text-3xl font-extrabold mb-2 text-gray-900 tracking-tight">GestiPrev</h2>
              <p className="text-gray-500 mb-6 text-sm">Controle de pagamentos previdenciários e guias consolidadas.</p>

              {loginError && (
                <div className="mb-4 p-3.5 bg-red-50 border border-red-150 text-red-700 rounded-xl text-xs flex gap-2.5 items-center font-medium">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {resetEmailSent && (
                <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-xl text-xs flex gap-2.5 items-center font-medium">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                  <span>E-mail de redefinição enviado com sucesso para o endereço informado! Caso não localize, certifique-se de olhar a pasta de Spam.</span>
                </div>
              )}

              {!showPasswordReset ? (
                <div className="space-y-5">
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">E-mail Institucional</label>
                      <input 
                        type="email" 
                        required
                        placeholder="nome@eusebio.ce.gov.br" 
                        value={loginEmail}
                        onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
                        className="w-full text-xs bg-gray-50 border border-gray-200 py-3.5 px-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Senha de Acesso</label>
                        <button 
                          type="button" 
                          onClick={() => { setShowPasswordReset(true); setResetEmailSent(false); setLoginError(null); }}
                          className="text-[10px] text-blue-600 hover:underline font-bold transition-all focus:outline-none bg-transparent border-0 cursor-pointer p-0"
                        >
                          Esqueceu a senha?
                        </button>
                      </div>
                      <input 
                        type="password" 
                        required
                        placeholder="••••••••" 
                        value={loginPassword}
                        onChange={(e) => { setLoginPassword(e.target.value); setLoginError(null); }}
                        className="w-full text-xs bg-gray-50 border border-gray-200 py-3.5 px-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={loginLoading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition-all active:scale-[0.99] disabled:bg-blue-400 cursor-pointer shadow-md shadow-blue-500/15"
                    >
                      {loginLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Autenticando...</span>
                        </>
                      ) : (
                        <span>Entrar no Sistema</span>
                      )}
                    </button>
                  </form>

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-gray-150"></div>
                    <span className="flex-shrink mx-4 text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">ou acesse com</span>
                    <div className="flex-grow border-t border-gray-150"></div>
                  </div>

                  <button 
                    onClick={handleLogin}
                    type="button"
                    className="w-full flex items-center justify-center gap-3 py-3.5 border border-gray-200 rounded-xl hover:bg-gray-50 bg-white transition-all font-bold text-xs text-gray-700 active:scale-[0.99] cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22-.09-.63z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                    </svg>
                    Conta do Administrador (Google)
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Recuperar Senha de Acesso</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Insira o seu e-mail institucional cadastrado abaixo para receber um link de redefinição de senha diretamente na sua caixa de entrada.
                  </p>
                  
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">E-mail Institucional</label>
                      <input 
                        type="email" 
                        required
                        placeholder="nome@eusebio.ce.gov.br" 
                        value={loginEmail}
                        onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
                        className="w-full text-xs bg-gray-50 border border-gray-200 py-3.5 px-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={loginLoading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition-all active:scale-[0.99] disabled:bg-blue-400 cursor-pointer shadow-md shadow-blue-500/10"
                    >
                      {loginLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Enviando link...</span>
                        </>
                      ) : (
                        <span>Enviar E-mail de Recuperação</span>
                      )}
                    </button>

                    <button 
                      type="button"
                      onClick={() => { setShowPasswordReset(false); setLoginError(null); }}
                      className="w-full py-3 border border-gray-150 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-500 transition-colors cursor-pointer"
                    >
                      Voltar ao Login
                    </button>
                  </form>
                </div>
              )}
           </div>
           
           {/* Footer for mobile/right side panel */}
           <div className="absolute bottom-8 text-center text-[11px] text-gray-400 font-medium lg:hidden">
             © 2026 LPC sistemas e assessoria. Todos os direitos reservados.
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
        <header className="h-24 md:h-28 bg-white/90 backdrop-blur-md border-b border-gray-100 flex items-center px-4 md:px-8 justify-between sticky top-0 z-30 transition-all">
          <div className="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
             {!isSidebarOpen && (
               <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg shrink-0">
                 <Menu className="w-5 h-5" />
               </button>
             )}
             <IpmeLogo variant="horizontal" className="shrink-0" />
             <div className="hidden lg:block w-px h-10 bg-gray-200 shrink-0" />
             <div className="hidden sm:flex flex-col min-w-0">
               <span className="text-[9px] md:text-xs font-bold text-blue-600 uppercase tracking-widest truncate leading-tight">
                 Sistema Gestiprev
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

        <section className="flex-1 overflow-y-auto flex flex-col justify-between">
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
                  role={profile?.role}
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
                  role={profile?.role}
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
                  role={profile?.role}
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
                  role={profile?.role}
                />
              </motion.div>
            )}

            {activeScreen === 'config' && (
              <ErrorBoundary fallbackTitle="Painel de Configurações">
                <motion.div 
                  key="config"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="p-8 max-w-[1240px] mx-auto space-y-8"
                >
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Configurações</h1>
                    <p className="text-gray-500 text-sm mt-1">Gerencie integrações, perfis e preferências do sistema GestiPrev</p>
                  </div>

                  {/* Users Management: Visible to Master & Admin users */}
                  {(profile?.role === 'master' || profile?.role === 'admin') && (
                    <div className="space-y-4">
                      <h2 className="text-lg font-bold text-gray-900">Administração de Acesso</h2>
                      <UsuarioManager currentProfile={profile} />
                    </div>
                  )}

                {/* Security settings: Password update */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-gray-550" />
                      Segurança da Conta (Senha de Acesso)
                    </h3>
                    <p className="text-xs text-gray-550 mt-1">
                      Mantenha suas credenciais seguras alterando sua senha de acesso ao GestiPrev regularmente.
                    </p>
                  </div>

                  {passwordUpdateSuccess && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-xl text-xs font-semibold">
                      {passwordUpdateSuccess}
                    </div>
                  )}

                  {passwordUpdateError && (
                    <div className="p-3.5 bg-red-50 border border-red-150 text-red-700 rounded-xl text-xs font-semibold">
                      {passwordUpdateError}
                    </div>
                  )}

                  <form onSubmit={handleUpdateProfilePassword} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl text-xs">
                    <div className="space-y-1">
                      <label className="font-semibold text-gray-400 block uppercase tracking-wider text-[10px]">Nova Senha</label>
                      <input 
                        type="password" 
                        required
                        placeholder="Mínimo 6 caracteres" 
                        value={newProfilePassword}
                        onChange={(e) => setNewProfilePassword(e.target.value)}
                        className="w-full text-xs bg-gray-50 border border-gray-200 py-3 px-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900"
                      />
                    </div>
                    <div className="flex items-end">
                      <button 
                        type="submit"
                        disabled={updatingPassword}
                        className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        {updatingPassword ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Alterando...</span>
                          </>
                        ) : (
                          <span>Atualizar Senha</span>
                        )}
                      </button>
                    </div>
                  </form>
                  <div className="pt-2 border-t border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
                    <span className="text-gray-500">Deseja usar o link de recuperação para redefinição segura?</span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!profile?.email) return;
                        setPasswordUpdateSuccess(null);
                        setPasswordUpdateError(null);
                        try {
                          await sendPasswordResetEmail(auth, profile.email);
                          setPasswordUpdateSuccess("E-mail para redefinição de senha enviado para " + profile.email);
                        } catch (err: any) {
                          setPasswordUpdateError("Erro ao enviar redefinição por e-mail: " + err.message);
                        }
                      }}
                      className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-xs transition-colors cursor-pointer mt-1 md:mt-0"
                    >
                      Enviar E-mail de Recuperação
                    </button>
                  </div>
                </div>

                {/* OneDrive Configuration Integration */}
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-gray-900">Conexões & Serviços</h2>
                  <OneDriveConnector role={profile?.role} />
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
             </ErrorBoundary>
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

          {/* Footer do app */}
          <footer className="py-6 px-8 text-center text-xs text-gray-400 border-t border-gray-100 bg-white/40 backdrop-blur-md mt-16 shrink-0">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto w-full">
              <span className="font-medium text-gray-550">© 2026 LPC sistemas e assessoria. Todos os direitos reservados.</span>
              <span className="text-[10px] text-gray-450 font-extrabold uppercase tracking-[0.15em] shrink-0">IPME - GestiPrev</span>
            </div>
          </footer>
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
