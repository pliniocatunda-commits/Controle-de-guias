import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Secretaria } from '../types';
import { Building2, Plus, ChevronRight, Search, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import ModalConfirmacao from './ModalConfirmacao';

export default function SecretariaList({ onSelect }: { onSelect: (id: string) => void }) {
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSec, setEditingSec] = useState<Secretaria | null>(null);
  const [newSec, setNewSec] = useState({ nome: '', sigla: '' });

  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string } | null>(null);

  const fetchSecretarias = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'secretarias'));
      setSecretarias(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Secretaria)));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecretarias();
  }, []);

  const handleAdd = async () => {
    if (!newSec.nome || !newSec.sigla) return;
    try {
      await addDoc(collection(db, 'secretarias'), {
        ...newSec,
        createdAt: serverTimestamp()
      });
      setShowAddModal(false);
      setNewSec({ nome: '', sigla: '' });
      fetchSecretarias();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdate = async () => {
    if (!editingSec || !editingSec.nome || !editingSec.sigla) return;
    try {
      const secRef = doc(db, 'secretarias', editingSec.id);
      await updateDoc(secRef, {
        nome: editingSec.nome,
        sigla: editingSec.sigla
      });
      setEditingSec(null);
      fetchSecretarias();
    } catch (error) {
      console.error(error);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'secretarias', id));
      fetchSecretarias();
    } catch (error) {
      console.error(error);
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
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-lg hover:bg-black transition-colors"
        >
          <Plus className="w-4 h-4" /> Nova Secretaria
        </button>
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
                onClick={() => onSelect(sec.id)}
                className="flex items-center justify-between p-4 cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-[#141414] font-bold">
                    {sec.sigla[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{sec.nome}</h3>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">{sec.sigla}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
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
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sigla</label>
                <input 
                  type="text" 
                  value={editingSec.sigla}
                  onChange={e => setEditingSec({...editingSec, sigla: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
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
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
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
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                  placeholder="Ex: Secretaria da Fazenda"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sigla</label>
                <input 
                  type="text" 
                  value={newSec.sigla}
                  onChange={e => setNewSec({...newSec, sigla: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
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
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
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
