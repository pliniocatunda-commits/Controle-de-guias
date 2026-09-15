import React, { useState, useEffect, useCallback } from 'react';
import { db, OperationType, handleFirestoreError, runWithTimeout } from '../lib/firebase';
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Departamento, Secretaria, Guia } from '../types';
import { Building, Plus, ChevronRight, ArrowLeft, Search, Layers, Pencil, Trash2, Receipt, CheckCircle, Calculator, Cloud, Link as LinkIcon, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ModalConfirmacao from './ModalConfirmacao';
import OneDriveExplorer from './OneDriveExplorer';
import { onedriveService } from '../services/onedriveService';

interface DepartamentoListProps {
  secretariaId: string;
  onBack: () => void;
  onSelectDepartamento: (id: string) => void;
  role?: string;
  initialSecretaria?: Secretaria;
}

export default function DepartamentoList({ secretariaId, onBack, onSelectDepartamento, role, initialSecretaria }: DepartamentoListProps) {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [secretaria, setSecretaria] = useState<Secretaria | null>(initialSecretaria || null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Departamento | null>(null);
  const [newDeptName, setNewDeptName] = useState('');
  const [showOneDriveLinker, setShowOneDriveLinker] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    onedriveService.getUser().then(u => setIsConnected(!!u)).catch(() => setIsConnected(false));
  }, []);

  // Modal Control
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    type: 'danger' | 'warning' | 'success' | 'info';
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {}
  });

  const showAlert = (title: string, message: string, type: 'success' | 'danger' | 'info' | 'warning' = 'info') => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      confirmText: 'OK',
      type: type,
      onConfirm: () => {}
    });
  };

  const askConfirmation = (title: string, message: string, type: 'danger' | 'warning', onConfirm: () => void | Promise<void>) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      confirmText: 'Confirmar',
      type,
      onConfirm
    });
  };

  // Fechamento States
  const [fechamento, setFechamento] = useState({ mes: new Date().getMonth() + 1, ano: new Date().getFullYear(), valorPago: '', dataPagamento: format(new Date(), 'yyyy-MM-dd') });
  const [totalPendente, setTotalPendente] = useState(0);
  const [guiasParaPagar, setGuiasParaPagar] = useState<Guia[]>([]);

  const fetchDepartamentos = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // 1. Carrega dados da secretaria em paralelo se ainda não temos
      const secPromise = (initialSecretaria || secretaria)
        ? Promise.resolve(null)
        : runWithTimeout(getDoc(doc(db, 'secretarias', secretariaId)), 6000).catch(err => {
            console.warn("Aviso ao carregar secretaria:", err);
            return null;
          });

      // 2. Tenta primeiro a consulta indexada direta por secretariaId
      const deptPromise = runWithTimeout(
        getDocs(query(collection(db, 'departamentos'), where('secretariaId', '==', secretariaId))),
        7000
      ).catch(err => {
        console.warn("Consulta direta indexada de departamentos falhou ou expirou:", err);
        return null;
      });

      const [secSnap, deptSnap] = await Promise.all([secPromise, deptPromise]);

      if (secSnap && secSnap.exists()) {
        setSecretaria({ id: secSnap.id, ...secSnap.data() } as Secretaria);
      }

      let list: Departamento[] = [];

      if (deptSnap && !deptSnap.empty) {
        list = deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Departamento));
      } else {
        // Fallback robusto e instantâneo: busca toda a coleção de departamentos e filtra por secretariaId em memória
        // Isso previne qualquer atraso de replicação, índices compostos em propagação ou divergência de tipos (string/number)
        try {
          const allDeptsSnap = await runWithTimeout(getDocs(collection(db, 'departamentos')), 6000);
          if (allDeptsSnap && !allDeptsSnap.empty) {
            list = allDeptsSnap.docs
              .map(d => ({ id: d.id, ...d.data() } as Departamento))
              .filter(d => String(d.secretariaId).trim() === String(secretariaId).trim());
          }
        } catch (fbErr) {
          console.warn("Aviso no fallback de departamentos:", fbErr);
        }
      }

      list.sort((a, b) => {
        const getTimestamp = (val: any) => {
          if (!val) return 0;
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          if (val.seconds !== undefined) return val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1000000 : 0);
          if (val instanceof Date) return val.getTime();
          if (typeof val === 'number') return val;
          return new Date(val).getTime() || 0;
        };
        const timeA = getTimestamp(a.createdAt);
        const timeB = getTimestamp(b.createdAt);
        if (timeA !== timeB) return timeA - timeB;
        return (a.nome || '').localeCompare(b.nome || '');
      });

      setDepartamentos(list);
    } catch (error: any) {
      console.error("Erro ao buscar departamentos:", error);
      setLoadError("Não foi possível carregar os departamentos no momento.");
    } finally {
      setLoading(false);
    }
  }, [secretariaId, initialSecretaria]);

  useEffect(() => {
    if (initialSecretaria) {
      setSecretaria(initialSecretaria);
    }
    fetchDepartamentos();
  }, [fetchDepartamentos, initialSecretaria]);

  // Calcula guias pendentes da secretaria para o fechamento
  useEffect(() => {
    if (!showPayModal) return;
    
    async function calculateTotal() {
      try {
        const deptIds = departamentos.map(d => d.id);
        if (deptIds.length === 0) return;

        // Busca guias do mês e ano e filtra pelos departamentos da secretaria em memória (evita erro de índice composto e limite de 30 itens do Firestore)
        const q = query(
          collection(db, 'guias'), 
          where('mes', '==', fechamento.mes),
          where('ano', '==', fechamento.ano)
        );
        
        const snapshot = await getDocs(q);
        const deptSet = new Set(deptIds);
        const docs = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Guia))
          .filter(g => deptSet.has(g.departamentoId) && g.status !== 'pago');
        setGuiasParaPagar(docs);
        setTotalPendente(docs.reduce((acc, g) => acc + (g.valor || 0), 0));
      } catch (error) {
        console.error(error);
      }
    }
    calculateTotal();
  }, [showPayModal, fechamento.mes, fechamento.ano, departamentos]);

  const handleFechamento = async () => {
    if (guiasParaPagar.length === 0) return;
    try {
      const batch = writeBatch(db);
      
      // 1. Criar Comprovante Unificado
      const compRef = doc(collection(db, 'comprovantes'));
      batch.set(compRef, {
        secretariaId,
        mes: fechamento.mes,
        ano: fechamento.ano,
        valorPago: parseFloat(fechamento.valorPago) || totalPendente,
        dataPagamento: fechamento.dataPagamento,
        urlComprovante: "https://exemplo.com/comprovante-unificado.pdf",
        createdAt: serverTimestamp()
      });

      // 2. Atualizar todas as guias correspondentes
      guiasParaPagar.forEach(guia => {
        const guiaRef = doc(db, 'guias', guia.id);
        batch.update(guiaRef, { status: 'pago' });
      });

      await batch.commit();
      setShowPayModal(false);
      showAlert('Sucesso', 'Fechamento realizado com sucesso! Todas as guias foram marcadas como pagas.', 'success');
    } catch (error) {
      console.error(error);
    }
  };

  const handleAdd = async () => {
    if (!newDeptName.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'departamentos'), {
        nome: newDeptName.trim(),
        secretariaId,
        createdAt: serverTimestamp()
      });
      setShowAddModal(false);
      setNewDeptName('');
      showAlert("Sucesso", "Departamento cadastrado com sucesso!", "success");
      await fetchDepartamentos();
    } catch (error: any) {
      console.error("Erro ao cadastrar departamento:", error);
      showAlert("Erro", `Não foi possível cadastrar o departamento (${error?.message || 'Verifique suas permissões'}).`, "danger");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingDept || !editingDept.nome) return;
    try {
      const deptRef = doc(db, 'departamentos', editingDept.id);
      await updateDoc(deptRef, { 
        nome: editingDept.nome,
        onedriveFolderId: editingDept.onedriveFolderId || null
      });
      setEditingDept(null);
      setShowOneDriveLinker(false);
      showAlert("Sucesso", "Departamento atualizado com sucesso!", "success");
      await fetchDepartamentos();
    } catch (error: any) {
      console.error("Erro ao atualizar departamento:", error);
      showAlert("Erro", `Não foi possível atualizar o departamento (${error?.message || 'Verifique suas permissões'}).`, "danger");
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    askConfirmation(
      "Excluir Departamento",
      "Deseja realmente excluir este departamento? Isso afetará o acesso às guias vinculadas a ele.",
      "danger",
      async () => {
        try {
          await deleteDoc(doc(db, 'departamentos', id));
          showAlert("Sucesso", "Departamento excluído com sucesso!", "success");
          await fetchDepartamentos();
        } catch (error: any) {
          console.error("Erro ao excluir departamento:", error);
          showAlert("Erro", `Não foi possível excluir o departamento (${error?.message || 'Verifique suas permissões'}).`, "danger");
        }
      }
    );
  };

  const filteredDepartamentos = departamentos.filter(d => 
    (d.nome || '').toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-gray-500 hover:text-black mb-6 transition-colors font-medium cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para Secretarias
      </button>

      <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {secretaria?.nome || (loading ? 'Carregando Secretaria...' : 'Secretaria')}
          </h1>
          <p className="text-gray-500 flex items-center gap-2 mt-1 text-sm">
            <Layers className="w-4 h-4" /> Gerenciamento de Departamentos
            {secretaria?.sigla && (
              <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-bold text-xs">
                {secretaria.sigla}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchDepartamentos()}
            disabled={loading}
            title="Recarregar departamentos"
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {(role === 'master' || role === 'admin') && (
            <>
              <button 
                onClick={() => setShowPayModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 font-bold text-sm cursor-pointer"
              >
                <Receipt className="w-4 h-4" /> Fechamento Mensal
              </button>
              <button 
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-bold text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Novo Departamento
              </button>
            </>
          )}
        </div>
      </header>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-50 flex items-center gap-4">
          <div className="flex-1 flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-xl">
             <Search className="w-4 h-4 text-gray-400" />
             <input 
               type="text" 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               placeholder="Filtrar departamento por nome..." 
               className="bg-transparent border-none focus:ring-0 text-sm w-full outline-none"
             />
             {searchTerm && (
               <button onClick={() => setSearchTerm('')} className="p-1 hover:bg-gray-200 rounded-lg text-gray-400">
                 <X className="w-3.5 h-3.5" />
               </button>
             )}
          </div>
          <div className="text-xs text-gray-400 font-medium whitespace-nowrap">
            {filteredDepartamentos.length} {filteredDepartamentos.length === 1 ? 'departamento' : 'departamentos'}
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center text-gray-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="font-medium text-sm text-gray-600">Carregando departamentos...</p>
            </div>
          ) : loadError ? (
            <div className="p-16 text-center text-gray-500">
              <p className="font-medium text-rose-600 mb-3 text-sm">{loadError}</p>
              <button
                onClick={() => fetchDepartamentos()}
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 font-semibold text-xs cursor-pointer transition-all"
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredDepartamentos.length === 0 ? (
            <div className="p-20 text-center text-gray-300">
              <Building className="w-16 h-16 mx-auto mb-4 opacity-10" />
              <p className="font-medium text-gray-400">
                {searchTerm.trim() 
                  ? `Nenhum departamento encontrado para "${searchTerm}".`
                  : 'Nenhum departamento cadastrado nesta secretaria.'}
              </p>
              {!searchTerm.trim() && (role === 'master' || role === 'admin') && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-xs shadow-md shadow-blue-500/10 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Primeiro Departamento
                </button>
              )}
            </div>
          ) : (
            filteredDepartamentos.map((dept) => (
              <motion.div 
                key={dept.id}
                whileHover={{ backgroundColor: '#fafafa' }}
                onClick={() => onSelectDepartamento(dept.id)}
                className="flex items-center justify-between p-5 cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-900 shadow-sm border border-white">
                    <Building className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 group-hover:text-black transition-colors">{dept.nome}</h3>
                    <p className="text-[10px] text-gray-400 tracking-[0.2em] font-bold uppercase mt-0.5">Unidade Administrativa</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {(role === 'master' || role === 'admin' || role === 'secretaria_admin' || !role) && (
                    <div className="flex items-center gap-1">
                      <button 
                        type="button"
                        title="Editar departamento"
                        onClick={(e) => { e.stopPropagation(); setEditingDept(dept); }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        title="Excluir departamento"
                        onClick={(e) => handleDelete(dept.id, e)}
                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-900 group-hover:transform group-hover:translate-x-1 transition-all" />
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Modal Fechamento Mensal Unificado */}
      <AnimatePresence>
        {showPayModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Fechamento Mensal</h2>
                  <p className="text-gray-500 text-sm">Pague todas as guias da secretaria de uma vez.</p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-2xl">
                  <Calculator className="w-6 h-6 text-emerald-600" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Mês de Ref.</label>
                      <select 
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm font-bold"
                        value={fechamento.mes}
                        onChange={e => setFechamento({...fechamento, mes: parseInt(e.target.value)})}
                      >
                        {Array.from({length: 12}).map((_, i) => (
                          <option key={i+1} value={i+1}>{format(new Date(2024, i), 'MMMM', { locale: ptBR })}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Ano</label>
                      <input 
                        type="number" 
                        className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm font-bold"
                        value={fechamento.ano}
                        onChange={e => setFechamento({...fechamento, ano: parseInt(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Data do Pagamento</label>
                    <input 
                      type="date" 
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-sm"
                      value={fechamento.dataPagamento}
                      onChange={e => setFechamento({...fechamento, dataPagamento: e.target.value})}
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-center">
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Consolidado</p>
                   <div className="text-4xl font-black text-gray-900 mb-2">
                     R$ {totalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                   </div>
                   <p className="text-xs text-gray-500">
                     Soma de <span className="font-bold text-emerald-600">{guiasParaPagar.length} guias</span> pendentes em todos os departamentos desta secretaria.
                   </p>
                </div>
              </div>

              {guiasParaPagar.length > 0 && (
                <div className="mb-8 border rounded-2xl overflow-hidden max-h-[200px] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 font-bold text-gray-500">Departamento</th>
                        <th className="px-4 py-2 font-bold text-gray-500 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {guiasParaPagar.map(g => (
                        <tr key={g.id}>
                          <td className="px-4 py-2 text-gray-600">{departamentos.find(d => d.id === g.departamentoId)?.nome}</td>
                          <td className="px-4 py-2 text-right font-medium">R$ {g.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowPayModal(false)}
                  className="flex-1 py-4 text-gray-400 font-bold hover:text-gray-900 transition-colors uppercase tracking-widest text-xs"
                >
                  CANCELAR
                </button>
                <button 
                  disabled={guiasParaPagar.length === 0}
                  onClick={handleFechamento}
                  className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
                >
                  <CheckCircle className="w-5 h-5" /> CONFIRMAR PAGAMENTO TOTAL
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Editar Departamento */}
      {editingDept && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-left p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">Configuração do Dept.</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nome Oficial</label>
                <input 
                  type="text" 
                  value={editingDept.nome}
                  onChange={e => setEditingDept({...editingDept, nome: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-black outline-none font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Vínculo OneDrive</label>
                {editingDept.onedriveFolderId ? (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Cloud className="text-emerald-600" size={20} />
                      <div>
                        <p className="text-xs font-bold text-emerald-900">Pasta Vinclulada</p>
                        <p className="text-[10px] text-emerald-600 truncate max-w-[200px]">ID: {editingDept.onedriveFolderId}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setEditingDept({...editingDept, onedriveFolderId: undefined})}
                      className="text-[10px] font-bold text-rose-600 hover:bg-rose-100 px-2 py-1 rounded transition-colors"
                    >
                      DESVINCULAR
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!showOneDriveLinker ? (
                      <button 
                        onClick={() => {
                          if (!isConnected) {
                            showAlert("Atenção", "Conecte sua conta OneDrive no Dashboard primeiro.", "warning");
                          } else {
                            setShowOneDriveLinker(true);
                          }
                        }}
                        className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-black hover:border-gray-900 transition-all flex flex-col items-center justify-center gap-2"
                      >
                        <LinkIcon size={24} />
                        <span className="text-xs font-bold uppercase tracking-widest">Vincular Pasta do OneDrive</span>
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <OneDriveExplorer 
                          onSelectFolder={(folder) => {
                            setEditingDept({...editingDept, onedriveFolderId: folder.id});
                            setShowOneDriveLinker(false);
                          }}
                        />
                        <button 
                          onClick={() => setShowOneDriveLinker(false)}
                          className="w-full text-center py-2 text-[10px] font-bold text-gray-400 hover:text-black"
                        >
                          CANCELAR SELEÇÃO
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button 
                onClick={() => { setEditingDept(null); setShowOneDriveLinker(false); }}
                className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-900 uppercase tracking-widest text-[10px]"
              >
                CANCELAR
              </button>
              <button 
                onClick={handleUpdate}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-bold text-sm shadow-md shadow-blue-500/10 cursor-pointer"
              >
                SALVAR ALTERAÇÕES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Departamento */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-left">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">Novo Departamento</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Nome do Departamento</label>
                <input 
                  type="text" 
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-600 outline-none font-medium"
                  placeholder="Ex: Recursos Humanos"
                />
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 text-gray-400 font-bold hover:text-gray-900 uppercase tracking-widest text-[10px]"
              >
                CANCELAR
              </button>
              <button 
                onClick={handleAdd}
                disabled={isSubmitting || !newDeptName.trim()}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all font-bold text-sm shadow-md shadow-blue-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    CRIANDO...
                  </>
                ) : (
                  'CRIAR UNIDADE'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalConfirmacao 
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        confirmText={modalConfig.confirmText}
        onConfirm={modalConfig.onConfirm}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
