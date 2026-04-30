import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { Guia, Departamento, Comprovante } from '../types';
import { 
  FileText, Calendar, DollarSign, Tag, Search, 
  ChevronRight, ArrowLeft, Upload, CheckCircle, AlertTriangle, FileUp, Loader2, FileSearch, Trash2, Eye, X,
  Plus, Minus, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ModalConfirmacao from './ModalConfirmacao';

export default function GuiaList({ departamentoId, onBack }: { departamentoId?: string, onBack: () => void }) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesReferencia, setMesReferencia] = useState(new Date().getMonth() + 1);
  const [anoFiscal, setAnoFiscal] = useState(new Date().getFullYear());
  
  // Modal Control
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    type: 'danger' | 'warning' | 'success' | 'info';
    onConfirm: () => void;
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

  const askConfirmation = (title: string, message: string, type: 'danger' | 'warning', onConfirm: () => void) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      confirmText: 'Confirmar',
      type,
      onConfirm
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadContext, setUploadContext] = useState<{deptId: string, tipo: 'patronal' | 'segurado', target: 'guia' | 'comprovante'} | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        let deptQuery = query(collection(db, 'departamentos'), orderBy('nome', 'asc'));
        if (departamentoId) {
          // If we have a specific dept, we filter. BUT usually the grid is for multiple depts.
          // The user requested a "consolidated grid view", so we'll show all but highlight or filter.
          // Let's stick to the consolidated view (all depts) as per request.
        }
        const deptSnap = await getDocs(deptQuery);
        const depts = deptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Departamento));
        setDepartamentos(depts);

        const q = query(
          collection(db, 'guias'), 
          where('mes', '==', mesReferencia),
          where('ano', '==', anoFiscal)
        );
        const snapshot = await getDocs(q);
        setGuias(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guia)));
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [mesReferencia, anoFiscal, departamentoId]);

  const handleInlineUpdate = async (guiaId: string, field: string, value: any) => {
    try {
      await updateDoc(doc(db, 'guias', guiaId), { [field]: value });
      setGuias(prev => prev.map(g => g.id === guiaId ? { ...g, [field]: value } : g));
    } catch (error) {
      console.error("Erro no update inline:", error);
    }
  };

  const triggerUpload = (deptId: string, tipo: 'patronal' | 'segurado', target: 'guia' | 'comprovante') => {
    setUploadContext({ deptId, tipo, target });
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadContext) return;

    try {
      let guia = guias.find(g => g.departamentoId === uploadContext.deptId && g.tipo === uploadContext.tipo);
      const urlFieldName = uploadContext.target === 'guia' ? 'urlGuia' : 'urlComprovante';
      
      const payload: any = {
        [urlFieldName]: 'arquivos_manuais/' + file.name,
        updatedAt: serverTimestamp()
      };

      if (uploadContext.target === 'comprovante') {
         payload.status = 'pago';
         if (guia && !guia.valorPago) payload.valorPago = guia.valor;
      }

      if (guia) {
        await updateDoc(doc(db, 'guias', guia.id), payload);
        setGuias(prev => prev.map(g => g.id === guia!.id ? { ...g, ...payload } : g));
      } else {
        const newDoc = {
          departamentoId: uploadContext.deptId,
          tipo: uploadContext.tipo,
          mes: mesReferencia,
          ano: anoFiscal,
          nome: file.name.split('.')[0],
          valor: 0,
          valorPago: 0,
          status: uploadContext.target === 'comprovante' ? 'pago' : 'pendente',
          identificacaoGrcp: `PENDENTE-${Date.now()}`,
          vencimento: new Date(anoFiscal, mesReferencia, 0).toISOString().split('T')[0],
          ...payload,
          createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, 'guias'), newDoc);
        setGuias(prev => [...prev, { id: docRef.id, ...newDoc } as Guia]);
      }
      
      showAlert("Sucesso", "Documento enviado com sucesso!", "success");
    } catch (error) {
      console.error(error);
      showAlert("Erro", "Falha ao enviar arquivo.", "danger");
    } finally {
      setUploadContext(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteGuia = (guiaId: string) => {
    askConfirmation(
      "Remover Registro",
      "Deseja realmente remover este arquivo e seus dados?",
      "danger",
      async () => {
        try {
          await deleteDoc(doc(db, 'guias', guiaId));
          setGuias(prev => prev.filter(g => g.id !== guiaId));
          showAlert("Sucesso", "Registro removido.", "success");
        } catch (error) {
          console.error(error);
        }
      }
    );
  };

  const openDocument = (url: string | undefined) => {
    if (!url || url === 'manual') {
      showAlert("Documento não encontrado", "Este registro não possui um arquivo PDF anexo para visualização.", "info");
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getGuiaData = (deptId: string, tipo: 'patronal' | 'segurado') => {
    return guias.find(g => g.departamentoId === deptId && g.tipo === tipo);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header Estilizado - Estilo Amarelo/SOCIAL do usuário */}
      <div className="bg-white px-12 py-10 shadow-sm border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:justify-between md:items-center gap-8">
          <div>
            <div className="flex items-center gap-2 text-gray-400 font-bold text-[9px] uppercase tracking-widest mb-2">
               <button onClick={onBack} className="hover:text-black flex items-center gap-1 transition-colors">Início</button>
               <span>/</span>
               <span className="text-gray-600">Gestão Global</span>
            </div>
            <h1 className="text-2xl font-black italic tracking-tighter text-gray-900 leading-none">CONSOLIDADO</h1>
            <p className="flex items-center gap-2 mt-2 text-gray-400 font-black text-[8px] uppercase tracking-[0.2em]">
               <RotateCcw className="w-3 h-3 text-gray-200" /> Visão Consolidada de Departamentos
            </p>
          </div>

          <div className="flex gap-4">
            <div className="bg-white p-3 px-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-6">
               <div className="text-right">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">MÊS</p>
                  <select 
                    className="appearance-none bg-transparent border-none p-0 font-black text-gray-900 text-sm focus:ring-0 uppercase cursor-pointer min-w-[80px]"
                    value={mesReferencia}
                    onChange={e => setMesReferencia(parseInt(e.target.value))}
                  >
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{new Date(2024, m - 1).toLocaleString('pt-BR', { month: 'long' })}</option>
                    ))}
                  </select>
               </div>
               <div className="w-[1px] h-8 bg-gray-200" />
               <div className="text-right">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">ANO</p>
                  <input 
                    type="number"
                    className="bg-transparent border-none p-0 font-black text-gray-900 text-sm focus:ring-0 w-16 text-right"
                    value={anoFiscal}
                    onChange={e => setAnoFiscal(parseInt(e.target.value))}
                  />
               </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="bg-white rounded-3xl shadow-md border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] text-center border-b border-gray-200">
                <th className="py-5 px-6 text-left border-r border-gray-200 w-48">DEPTO</th>
                <th colSpan={4} className="py-5 border-r border-gray-200 text-blue-700 bg-blue-50/30">PATRONAL</th>
                <th colSpan={4} className="py-5 text-emerald-700 bg-emerald-50/30">SEGURADOS</th>
              </tr>
              <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest text-left border-b border-gray-200">
                <th className="py-3 px-6 border-r border-gray-200">IDENTIFICAÇÃO</th>
                
                <th className="py-3 px-4 whitespace-nowrap">ID GRCP</th>
                <th className="py-3 px-4">VALOR</th>
                <th className="py-3 px-4 text-center">GUIA</th>
                <th className="py-3 px-4 text-center border-r border-gray-200">COMPROVANTE</th>

                <th className="py-3 px-4 whitespace-nowrap">ID GRCP</th>
                <th className="py-3 px-4">VALOR</th>
                <th className="py-3 px-4 text-center">GUIA</th>
                <th className="py-3 px-4 text-center">COMPROVANTE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center font-bold text-gray-300 animate-pulse uppercase tracking-widest text-[8px]">Sincronizando...</td></tr>
              ) : departamentos.map((dept) => {
                const patData = getGuiaData(dept.id, 'patronal');
                const segData = getGuiaData(dept.id, 'segurado');

                return (
                  <tr key={dept.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="py-3 px-6 border-r border-gray-200">
                      <p className="font-black text-gray-900 text-[10px] tracking-tight truncate w-40">{dept.nome}</p>
                    </td>

                    {/* PATRONAL SECTION */}
                    <td className="p-2 px-4">
                        <div className="min-h-[1.5rem] flex items-center">
                          {patData ? (
                            <textarea 
                              className="bg-transparent border-none p-0 text-[9px] font-bold text-gray-600 w-full focus:ring-0 resize-none h-auto overflow-hidden leading-tight"
                              rows={1}
                              value={patData.identificacaoGrcp || ''}
                              onChange={(e) => handleInlineUpdate(patData.id, 'identificacaoGrcp', e.target.value)}
                            />
                          ) : <span className="text-gray-200 text-[8px]">---</span>}
                        </div>
                    </td>
                    <td className="p-2 px-4">
                        {patData ? (
                          <div className="flex items-center gap-0.5">
                            <span className="font-black text-gray-900 text-[10px]">R$</span>
                            <input 
                              type="number"
                              className="bg-transparent border-none p-0 font-black text-gray-900 w-20 focus:ring-0 text-[10px]"
                              value={patData.valor || 0}
                              onChange={(e) => handleInlineUpdate(patData.id, 'valor', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        ) : <span className="text-gray-200 text-[8px]">---</span>}
                    </td>
                    <td className="p-2 text-center">
                       {patData?.urlGuia ? (
                         <div className="flex items-center justify-center gap-1">
                           <button 
                             onClick={() => openDocument(patData.urlGuia)}
                             className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-100 transition-all border border-blue-200"
                           >
                             <FileText className="w-4 h-4" />
                           </button>
                           <button onClick={() => handleDeleteGuia(patData.id)} className="w-5 h-5 text-rose-300 hover:text-rose-600 transition-colors">
                              <Minus className="w-3.5 h-3.5" />
                           </button>
                         </div>
                       ) : (
                         <button 
                           onClick={() => triggerUpload(dept.id, 'patronal', 'guia')}
                           className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all mx-auto border border-dashed border-gray-200"
                         >
                           <Plus className="w-3.5 h-3.5" />
                         </button>
                       )}
                    </td>
                    <td className="p-2 text-center border-r border-gray-200">
                       {patData?.urlComprovante ? (
                         <div className="flex items-center justify-center">
                           <button 
                            onClick={() => openDocument(patData.urlComprovante)}
                            className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-100 transition-all border border-emerald-200 shadow-sm"
                           >
                             <CheckCircle className="w-4.5 h-4.5" />
                           </button>
                         </div>
                       ) : (
                        <button 
                          onClick={() => triggerUpload(dept.id, 'patronal', 'comprovante')}
                          className="w-7 h-7 bg-transparent mx-auto"
                        >
                        </button>
                       )}
                    </td>

                    {/* SEGURADOS SECTION */}
                    <td className="p-2 px-4">
                        <div className="min-h-[1.5rem] flex items-center">
                          {segData ? (
                            <textarea 
                              className="bg-transparent border-none p-0 text-[9px] font-bold text-gray-600 w-full focus:ring-0 resize-none h-auto overflow-hidden leading-tight"
                              rows={1}
                              value={segData.identificacaoGrcp || ''}
                              onChange={(e) => handleInlineUpdate(segData.id, 'identificacaoGrcp', e.target.value)}
                            />
                          ) : <span className="text-gray-200 text-[8px]">---</span>}
                        </div>
                    </td>
                    <td className="p-2 px-4">
                        {segData ? (
                          <div className="flex items-center gap-0.5">
                            <span className="font-black text-gray-900 text-[10px]">R$</span>
                            <input 
                              type="number"
                              className="bg-transparent border-none p-0 font-black text-gray-900 w-20 focus:ring-0 text-[10px]"
                              value={segData.valor || 0}
                              onChange={(e) => handleInlineUpdate(segData.id, 'valor', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        ) : <span className="text-gray-200 text-[8px]">---</span>}
                    </td>
                    <td className="p-2 text-center">
                       {segData?.urlGuia ? (
                         <div className="flex items-center justify-center gap-1">
                           <button 
                             onClick={() => openDocument(segData.urlGuia)}
                             className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-100 transition-all border border-blue-200"
                           >
                             <FileText className="w-4 h-4" />
                           </button>
                           <button onClick={() => handleDeleteGuia(segData.id)} className="w-5 h-5 text-rose-300 hover:text-rose-600 transition-colors">
                              <Minus className="w-3.5 h-3.5" />
                           </button>
                         </div>
                       ) : (
                         <button 
                           onClick={() => triggerUpload(dept.id, 'segurado', 'guia')}
                           className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all mx-auto border border-dashed border-gray-200"
                         >
                           <Plus className="w-3.5 h-3.5" />
                         </button>
                       )}
                    </td>
                    <td className="p-2 text-center">
                       {segData?.urlComprovante ? (
                         <div className="flex items-center justify-center">
                           <button 
                            onClick={() => openDocument(segData.urlComprovante)}
                            className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-100 transition-all border border-emerald-200 shadow-sm"
                           >
                             <CheckCircle className="w-4.5 h-4.5" />
                           </button>
                         </div>
                       ) : (
                        <button 
                          onClick={() => triggerUpload(dept.id, 'segurado', 'comprovante')}
                          className="w-7 h-7 bg-transparent mx-auto"
                        >
                        </button>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden File Input */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="application/pdf"
      />

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
