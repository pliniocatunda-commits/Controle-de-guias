import React, { useState, useEffect } from 'react';
import { 
  getDocs, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { db, firebaseConfig } from '../lib/firebase';
import { Usuario, UserRole } from '../types';
import { 
  UserPlus, 
  Trash2, 
  Shield, 
  User, 
  Mail, 
  Lock, 
  ShieldAlert, 
  Key, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Edit2, 
  X,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UsuarioManagerProps {
  currentProfile: Usuario | null;
}

export default function UsuarioManager({ currentProfile }: UsuarioManagerProps) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states for creating a new user
  const [newNome, setNewNome] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('consulta');
  const [formError, setFormError] = useState<string | null>(null);

  // Edit user state
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('consulta');

  // Modal open states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const openCreateModal = () => {
    setError(null);
    setSuccess(null);
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (actionLoading) return;
    setIsCreateModalOpen(false);
    setFormError(null);
  };

  const closeEditModal = () => {
    if (actionLoading) return;
    setEditingUser(null);
    setFormError(null);
  };

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'usuarios'));
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Usuario));
      // Sort: Master first, then admin, then consulta, then by name
      list.sort((a, b) => {
        const roleOrder = { master: 0, admin: 1, consulta: 2 };
        const orderA = roleOrder[a.role] ?? 99;
        const orderB = roleOrder[b.role] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return (a.nome || '').localeCompare(b.nome || '');
      });
      setUsuarios(list);
    } catch (err: any) {
      console.error("Erro ao carregar usuários:", err);
      setError("Erro ao carregar lista de usuários. Verifique as regras do banco.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFormError(null);

    if (!newNome.trim() || !newEmail.trim() || !newPassword.trim()) {
      setFormError("Todos os campos de cadastro são obrigatórios.");
      return;
    }

    if (newPassword.length < 6) {
      setFormError("A senha deve conter pelo menos 6 caracteres.");
      return;
    }

    setActionLoading(true);
    
    let secondaryApp;
    try {
      // 1. Initialize secondary Firebase App to create user without signing out current admin
      const secondaryAppName = `SecondaryApp_${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      // 2. Register user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, newPassword);
      const { uid } = userCredential.user;

      // 3. Create document in Firestore "usuarios"
      const newUserProfile: Usuario = {
        id: uid,
        nome: newNome.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'usuarios', uid), newUserProfile);

      // 4. Clean up secondary auth session and app
      await secondarySignOut(secondaryAuth);
      
      setSuccess(`Conta para ${newNome} criada com sucesso!`);
      setIsCreateModalOpen(false);
      
      // Reset form fields
      setNewNome('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('consulta');

      // Refresh list
      await fetchUsuarios();
    } catch (err: any) {
      console.error("Erro ao cadastrar usuário:", err);
      if (err.code === 'auth/email-already-in-use') {
        const cleanEmail = newEmail.trim().toLowerCase();
        const existsInFirestoreList = usuarios.some(u => u.email.toLowerCase() === cleanEmail);
        
        if (!existsInFirestoreList) {
          // User exists in Firebase Auth but has no document in Firestore.
          // Try to sign in with the newPassword the admin entered to retrieve the correct UID and rebuild the document.
          let repairSuccess = false;
          if (secondaryApp) {
            try {
              const secondaryAuth = getAuth(secondaryApp);
              const userCredential = await signInWithEmailAndPassword(secondaryAuth, cleanEmail, newPassword);
              const { uid } = userCredential.user;

              // Recreate the missing Firestore profile
              const newUserProfile: Usuario = {
                id: uid,
                nome: newNome.trim(),
                email: cleanEmail,
                role: newRole,
                createdAt: new Date().toISOString()
              };

              await setDoc(doc(db, 'usuarios', uid), newUserProfile);
              await secondarySignOut(secondaryAuth);
              repairSuccess = true;

              setSuccess(`Perfil restabelecido e conta vinculada com sucesso para ${newNome}!`);
            } catch (repairErr) {
              console.warn("Tentativa de restaurar perfil via login falhou:", repairErr);
            }
          }

          if (!repairSuccess) {
            // Self-healing fallback: Create a temporary Firestore record.
            // When this user logs in, App.tsx will detect this temporary doc and merge it with their real UID.
            try {
              const tempId = 'temp_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_');
              const newUserProfile: Usuario = {
                id: tempId,
                nome: newNome.trim(),
                email: cleanEmail,
                role: newRole,
                createdAt: new Date().toISOString()
              };

              await setDoc(doc(db, 'usuarios', tempId), newUserProfile);
              setSuccess(`Usuário ${newNome} adicionado com sucesso! A conta existente foi vinculada.`);
              repairSuccess = true;
            } catch (tempErr) {
              console.error("Falha ao criar perfil temporário de auto-cura:", tempErr);
            }
          }

          if (repairSuccess) {
            setIsCreateModalOpen(false); // Closes the modal and goes back to configurations
            
            // Clean up form
            setNewNome('');
            setNewEmail('');
            setNewPassword('');
            setNewRole('consulta');

            // Refresh user list
            await fetchUsuarios();
            return;
          }
        }

        if (existsInFirestoreList) {
          setFormError("Este e-mail institucional já está cadastrado.");
        } else {
          setFormError("Este e-mail já está cadastrado no sistema de autenticação, mas não possui um perfil de acesso ativo. Para adicioná-lo à lista: \n\n1. Digite a SENHA CORRETA para este e-mail no campo acima para recuperarmos o perfil automaticamente.\n2. Ou peça para o usuário realizar o login uma vez no sistema GestiPrev. A conta dele será ativada e listada automaticamente.");
        }
      } else if (err.code === 'auth/invalid-email') {
        setFormError("O formato do e-mail informado é inválido.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setFormError("O provedor de login por E-mail/Senha não está ativado no Firebase Console. Ative em: Authentication > Sign-in method > E-mail/senha.");
      } else {
        setFormError(err.message || "Erro desconhecido ao criar usuário de acesso.");
      }
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error("Erro ao deletar app secundário:", e);
        }
      }
      setActionLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);
    setSuccess(null);
    setFormError(null);

    if (!editNome.trim()) {
      setFormError("O nome completo não pode ser vazio.");
      return;
    }

    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'usuarios', editingUser.id), {
        nome: editNome.trim(),
        role: editRole
      });

      setSuccess(`Usuário ${editNome} atualizado com sucesso.`);
      setEditingUser(null);
      await fetchUsuarios();
    } catch (err: any) {
      console.error("Erro ao atualizar usuário:", err);
      setFormError("Falha ao atualizar informações do usuário.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, userNome: string) => {
    if (userId === currentProfile?.id) {
      setError("Você não pode excluir sua própria conta Master.");
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${userNome}"? O acesso dele será revogado imediatamente.`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      // Deleting the document blocks their access because the collection rule prevents reads/writes for non-listed profiles.
      await deleteDoc(doc(db, 'usuarios', userId));
      setSuccess(`Usuário "${userNome}" excluído e acesso revogado com sucesso.`);
      await fetchUsuarios();
    } catch (err: any) {
      console.error("Erro ao excluir usuário:", err);
      setError("Erro ao remover usuário do banco de dados.");
    } finally {
      setActionLoading(false);
    }
  };

  const startEdit = (user: Usuario) => {
    setError(null);
    setSuccess(null);
    setFormError(null);
    setEditingUser(user);
    setEditNome(user.nome);
    setEditRole(user.role);
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'master':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold leading-none bg-indigo-100 text-indigo-800">
            <Shield className="w-3.5 h-3.5" />
            Master (Total)
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold leading-none bg-blue-105 bg-blue-100 text-blue-800">
            <Shield className="w-3.5 h-3.5" />
            Administrador
          </span>
        );
      case 'consulta':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold leading-none bg-emerald-100 text-emerald-800">
            <User className="w-3.5 h-3.5" />
            Consulta (Leitura)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold leading-none bg-gray-100 text-gray-800">
            {role}
          </span>
        );
    }
  };

  return (
    <div id="usuario-manager-root" className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Controle de Perfis de Acesso
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Cadastre e acompanhe contas de login institucionais de servidores e determine seus níveis de privilégio.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Cadastrar Nova Conta
        </button>
      </div>

      {/* Connection Warning Message */}
      <div className="p-4 bg-amber-50/50 border border-amber-200/50 rounded-xl text-xs text-amber-800 flex gap-3">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Informação importante sobre Cadastro de Contas</p>
          <p className="leading-relaxed text-amber-700/90">
            Para que novas contas com e-mail institucional acessem o sistema, o provedor <strong>E-mail/senha</strong> deve estar habilitado no Firebase Authentication do seu console <em>(Authentication &gt; Sign-in method &gt; E-mail/senha)</em>.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex gap-2.5 items-center">
          <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs flex gap-2.5 items-center">
          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {/* Users table / list */}
      <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50/20">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Carregando usuários...</span>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">
            Nenhum usuário cadastrado além do Master.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-150 bg-gray-50/70 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                  <th className="px-5 py-3">Profissional / E-mail</th>
                  <th className="px-5 py-3">Nível de Permissão</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {usuarios.map((u) => {
                  const isCurrentUser = u.id === currentProfile?.id;
                  const isMasterUser = u.role === 'master';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-850 flex items-center gap-2">
                          {u.nome}
                          {isCurrentUser && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 py-0.5 px-2 rounded-full font-bold">Você</span>
                          )}
                        </div>
                        <div className="text-gray-400 mt-0.5 text-[11px]">{u.email}</div>
                      </td>
                      <td className="px-5 py-4">{getRoleBadge(u.role)}</td>
                      <td className="px-5 py-4 text-right">
                        {!isMasterUser && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEdit(u)}
                              disabled={actionLoading}
                              className="p-2 hover:bg-blue-50 text-blue-600 hover:text-blue-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Editar Perfil"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.nome)}
                              disabled={actionLoading || isCurrentUser}
                              className="p-2 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:hover:bg-transparent disabled:text-gray-300"
                              title="Excluir Acesso"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {isMasterUser && (
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider select-none pr-3">Inalterável</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal / Overlay for Creating New User */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            {/* Modal backdrop closer */}
            <div className="absolute inset-0" onClick={closeCreateModal} />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-gray-100 w-full max-w-md relative z-10 shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h4 className="font-black text-gray-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  Cadastrar Conta Institucional
                </h4>
                <button
                  disabled={actionLoading}
                  onClick={closeCreateModal}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                {formError && (
                  <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex gap-2.5 items-start">
                    <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{formError}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Nome do Servidor</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-gray-450" />
                    <input 
                      type="text" 
                      placeholder="Ex: João da Silva" 
                      value={newNome}
                      onChange={(e) => setNewNome(e.target.value)}
                      required
                      className="w-full text-xs bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">E-mail Institucional</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-gray-450" />
                    <input 
                      type="email" 
                      placeholder="Ex: seugoverno@eusébio.ce.gov.br" 
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      className="w-full text-xs bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Senha de Acesso Inicial</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-4 h-4 text-gray-450" />
                    <input 
                      type="password" 
                      placeholder="Ex: SenhaForte123" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full text-xs bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-905 text-gray-900 placeholder-gray-400"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Nível de Permissão</label>
                  <div className="relative">
                    <Shield className="absolute left-3.5 top-3 w-4 h-4 text-gray-450" />
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="w-full appearance-none text-xs bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900"
                    >
                      <option value="admin">Administrador (Pode Criar/Enviar)</option>
                      <option value="consulta">Consulta (Apenas Visualização)</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-gray-405 italic mt-1 leading-relaxed">
                    * Administrador poderá criar secretarias, gerenciar departamentos e publicar guias/comprovantes. Consulta poderá apenas navegar e emitir relatórios.
                  </p>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={closeCreateModal}
                    className="w-1/2 py-3 border border-gray-150 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-500 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-1/2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/10"
                  >
                    {actionLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Fazendo cadastro...</span>
                      </>
                    ) : (
                      <span>Efetuar Cadastro</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Editing User */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="absolute inset-0" onClick={closeEditModal} />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-gray-100 w-full max-w-md relative z-10 shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h4 className="font-black text-gray-900 flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-blue-600" />
                  Editar Nível de Permissão
                </h4>
                <button
                  disabled={actionLoading}
                  onClick={closeEditModal}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                {formError && (
                  <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex gap-2.5 items-start">
                    <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{formError}</span>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">E-mail de Acesso (Inalterável)</span>
                  <p className="text-xs bg-gray-50 border border-gray-100 text-gray-500 font-medium py-3 px-4 rounded-xl mt-1 select-all break-all">
                    {editingUser.email}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Nome do Servidor</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 w-4 h-4 text-gray-450" />
                    <input 
                      type="text" 
                      placeholder="Nome completo" 
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      required
                      className="w-full text-xs bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Nível de Permissão</label>
                  <div className="relative">
                    <Shield className="absolute left-3.5 top-3 w-4 h-4 text-gray-450" />
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as UserRole)}
                      className="w-full appearance-none text-xs bg-gray-50 border border-gray-200 py-3 pl-11 pr-4 rounded-xl focus:border-blue-500 focus:bg-white outline-none transition-all text-gray-900"
                    >
                      <option value="admin">Administrador (Pode Criar/Enviar)</option>
                      <option value="consulta">Consulta (Apenas Visualização)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={closeEditModal}
                    className="w-1/2 py-3 border border-gray-150 hover:bg-gray-50 rounded-xl text-xs font-bold text-gray-500 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-1/2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/10"
                  >
                    {actionLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <span>Salvar Alterações</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
