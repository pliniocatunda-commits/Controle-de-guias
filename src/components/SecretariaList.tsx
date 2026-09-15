import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, getDocs, addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Secretaria } from '../types';
import { Building2, Plus, ChevronRight, Search, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import ModalConfirmacao from './ModalConfirmacao';

// Cache em memória para transição e navegação instantânea entre telas
let cachedSecretariasList: Secretaria[] | null = null;

export default function SecretariaList({ 
  onSelect, 
  onSelectDepartments, 
  role 
}: { 
  onSelect: (id: string, secretaria?: Secretaria) => void; 
  onSelectDepartments?: (id: string, secretaria?: Secretaria) => void; 
  role?: string 
}) {
  const [secretarias, setSecretarias] = useState<Secretaria[]>(() => cachedSecretariasList || []);
  const [loading, setLoading] = useState(() => !cachedSecretariasList);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSec, setEditingSec] = useState<Secretaria | null>(null);
  const [newSec, setNewSec] = useState({ nome: '', sigla: '' });

  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string } | null>(null);

  const fetchSecretarias = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner || !cachedSecretariasList) {
      setLoading(true);
    }
    try {
      const snapshot = await getDocs(collection(db, 'secretarias'));
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Secretaria));
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

      // Posiciona "ARTICULAÇÃO POLITICA" logo após "ESPORTE E JUVENTUDE"
      const normalizedList = [...list];
      const idxArticulacao = normalizedList.findIndex(sec => {
        const n = (sec.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return n.includes("articulacao politica");
      });
      const idxEsporte = normalizedList.findIndex(sec => {
        const n = (sec.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return n.includes("esporte") && n.includes("juventude");
      });

      if (idxArticulacao !== -1 && idxEsporte !== -1) {
        const articulacaoItem = normalizedList[idxArticulacao];
        normalizedList.splice(idxArticulacao, 1);
        
        const newIdxEsporte = normalizedList.findIndex(sec => {
          const n = (sec.nome || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return n.includes("esporte") && n.includes("juventude");
        });
        
        normalizedList.splice(newIdxEsporte + 1, 0, articulacaoItem);
      }

      cachedSecretariasList = normalizedList;
      setSecretarias(normalizedList);
    } catch (error) {
      console.error("Erro ao carregar secretarias:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecretarias();
  }, []);

  const handleAdd = async () => {
    if (!newSec.nome.trim() || !newSec.sigla.trim()) return;
    const pendingName = newSec.nome.trim();
    const pendingSigla = newSec.sigla.trim().toUpperCase();
    setShowAddModal(false);
    setNewSec({ nome: '', sigla: '' });

    // 1. Gera ID real no cliente
    const newDocRef = doc(collection(db, 'secretarias'));
    const newSecId = newDocRef.id;

    // 2. Adiciona à UI imediatamente (0ms)
    const createdSec: Secretaria = {
      id: newSecId,
      nome: pendingName,
      sigla: pendingSigla,
      createdAt: new Date()
    };
    setSecretarias(prev => {
      const updated = [...prev, createdSec];
      cachedSecretariasList = updated;
      return updated;
    });

    // 3. Persiste no banco em segundo plano
    try {
      await setDoc(newDocRef, {
        nome: pendingName,
        sigla: pendingSigla,
        createdAt: serverTimestamp()
      });
      fetchSecretarias();
    } catch (error) {
      console.error("Erro ao adicionar secretaria:", error);
      setSecretarias(prev => {
        const reverted = prev.filter(s => s.id !== newSecId);
        cachedSecretariasList = reverted;
        return reverted;
      });
      fetchSecretarias(true);
    }
  };

  const handleUpdate = async () => {
    if (!editingSec || !editingSec.nome.trim() || !editingSec.sigla.trim()) return;
    const targetId = editingSec.id;
    const updatedName = editingSec.nome.trim();
    const updatedSigla = editingSec.sigla.trim().toUpperCase();
    setEditingSec(null);

    // Atualização otimista imediata
    setSecretarias(prev => {
      const updated = prev.map(s => s.id === targetId ? { ...s, nome: updatedName, sigla: updatedSigla } : s);
      cachedSecretariasList = updated;
      return updated;
    });

    try {
      const secRef = doc(db, 'secretarias', targetId);
      await updateDoc(secRef, {
        nome: updatedName,
        sigla: updatedSigla
      });
      fetchSecretarias();
    } catch (error) {
      console.error("Erro ao atualizar secretaria:", error);
      fetchSecretarias(true);
    }
  };

  const executeDelete = async (id: string) => {
    // Remoção otimista imediata
    setSecretarias(prev => {
      const updated = prev.filter(s => s.id !== id);
      cachedSecretariasList = updated;
      return updated;
    });

    try {
      await deleteDoc(doc(db, 'secretarias', id));
      fetchSecretarias();
    } catch (error) {
      console.error("Erro ao excluir secretaria:", error);
      fetchSecretarias(true);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ isOpen: true, id });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Secretarias</h1>
          <p className="text-gray-500">Gestão das unidades administrativas centrais</p>
        </div>
        {(role === 'master' || role === 'admin') && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/10 cursor-pointer text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Nova Secretaria
          </button>
        )}
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-bottom border-gray-100 bg-gray-50/50 flex items-center gap-3">
          <Search className="w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Buscar secretaria..." 
            className="bg-transparent border-none focus:ring-0 text-sm w-full"
          />
        </div>

        <div className="divide-y divide-gray-100">
          {secretarias.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Nenhuma secretaria cadastrada.</p>
            </div>
          ) : (
            secretarias.map((sec) => (
              <motion.div 
                key={sec.id}
                whileHover={{ backgroundColor: '#f9fafb' }}
                onClick={() => onSelect(sec.id, sec)}
                className="flex items-center justify-between p-4 cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold border border-blue-100">
                    {sec.sigla[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{sec.nome}</h3>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">{sec.sigla}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {onSelectDepartments && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onSelectDepartments(sec.id, sec); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl transition-all font-bold text-[11px] uppercase tracking-wider cursor-pointer active:scale-95 hover:shadow-sm mr-2 z-10"
                    >
                      <Building2 className="w-3.5 h-3.5 text-gray-500" /> Departamentos
                    </button>
                  )}
                  {(role === 'master' || role === 'admin') && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingSec(sec); }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(sec.id, e)}
                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-600 transition-colors" />
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <ModalConfirmacao 
        isOpen={!!confirmDelete?.isOpen}
        title="Excluir Secretaria"
        message="Deseja realmente excluir esta secretaria? Isso pode afetar os departamentos vinculados."
        type="danger"
        confirmText="Excluir"
        onConfirm={() => confirmDelete && executeDelete(confirmDelete.id)}
        onClose={() => setConfirmDelete(null)}
      />

      {editingSec && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Editar Secretaria</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Secretaria</label>
                <input 
                  type="text" 
                  value={editingSec.nome}
                  onChange={e => setEditingSec({...editingSec, nome: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sigla</label>
                <input 
                  type="text" 
                  value={editingSec.sigla}
                  onChange={e => setEditingSec({...editingSec, sigla: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setEditingSec(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleUpdate}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md shadow-blue-500/10 font-semibold"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-left">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Adicionar Secretaria</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Secretaria</label>
                <input 
                  type="text" 
                  value={newSec.nome}
                  onChange={e => setNewSec({...newSec, nome: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  placeholder="Ex: Secretaria da Fazenda"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sigla</label>
                <input 
                  type="text" 
                  value={newSec.sigla}
                  onChange={e => setNewSec({...newSec, sigla: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                  placeholder="Ex: SEFAZ"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleAdd}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md shadow-blue-500/10 font-semibold"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
