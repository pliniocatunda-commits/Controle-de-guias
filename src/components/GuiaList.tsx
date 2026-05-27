import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, where, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { uploadFile } from '../lib/storage';
import { Guia, Departamento, Comprovante } from '../types';
import { 
  FileText, Calendar, DollarSign, Tag, Search, 
  ChevronRight, ArrowLeft, Upload, CheckCircle, AlertTriangle, FileUp, Loader2, FileSearch, Trash2, Eye, X, Download,
  Plus, Minus, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ModalConfirmacao from './ModalConfirmacao';

import OneDriveExplorer from './OneDriveExplorer';
import { Cloud, Link as LinkIcon } from 'lucide-react';

// Helper functions for BRL currency formatting and parsing
const parseBRLToFloat = (value: string | number | undefined | null): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const clean = value.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
};

const normalizeValue = (val: number | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  if (val > 0 && val < 120) {
    return val * 1000;
  }
  return val;
};

const normalizeGuia = (g: any): Guia => {
  return {
    ...g,
    valor: normalizeValue(g.valor),
    valorPago: g.valorPago !== undefined ? normalizeValue(g.valorPago) : undefined
  };
};

const formatBRL = (value: number | string | undefined | null): string => {
  if (value === undefined || value === null) return '0,00';
  let numValue = typeof value === 'string' ? parseBRLToFloat(value) : value;
  numValue = normalizeValue(numValue);
  return numValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const handleBRLChange = (valStr: string): string => {
  const cleanValue = valStr.replace(/\D/g, "");
  const num = cleanValue ? parseFloat(cleanValue) / 100 : 0;
  return formatBRL(num);
};

export default function GuiaList({ departamentoId, onBack }: { departamentoId?: string, onBack: () => void }) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesReferencia, setMesReferencia] = useState(new Date().getMonth() + 1);
  const [anoFiscal, setAnoFiscal] = useState(new Date().getFullYear());
  const [oneDrivePickContext, setOneDrivePickContext] = useState<{deptId: string, tipo: 'patronal' | 'segurado', target: 'guia' | 'comprovante'} | null>(null);
  
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ valor: 0, identificacaoGrcp: '' });
  const [modalValorStr, setModalValorStr] = useState('');
  const [tempValues, setTempValues] = useState<Record<string, string>>({});
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

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
        setGuias(snapshot.docs.map(doc => normalizeGuia({ id: doc.id, ...doc.data() })));
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
      setGuias(prev => prev.map(g => g.id === guiaId ? normalizeGuia({ ...g, [field]: value }) : g));
    } catch (error) {
      console.error("Erro no update inline:", error);
    }
  };

  const triggerUpload = (deptId: string, tipo: 'patronal' | 'segurado', target: 'guia' | 'comprovante') => {
    setUploadContext({ deptId, tipo, target });
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadContext) return;

    // Abrir modal de conferência
    const existingGuia = guias.find(g => g.departamentoId === uploadContext.deptId && g.tipo === uploadContext.tipo);
    const initialVal = uploadContext.target === 'guia' ? (existingGuia?.valor || 0) : (existingGuia?.valorPago || existingGuia?.valor || 0);
    setPendingFile(file);
    setUploadForm({
      valor: initialVal,
      identificacaoGrcp: existingGuia?.identificacaoGrcp || ''
    });
    setModalValorStr(formatBRL(initialVal));
    setIsFormModalOpen(true);
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !uploadContext) return;
    setIsFormModalOpen(false);

    try {
      setLoading(true);

      // Upload para Firebase Storage
      const downloadUrl = await uploadFile(pendingFile, 'guias');

      let guia = guias.find(g => g.departamentoId === uploadContext.deptId && g.tipo === uploadContext.tipo);
      const urlFieldName = uploadContext.target === 'guia' ? 'urlGuia' : 'urlComprovante';
      
      const payload: any = {
        [urlFieldName]: downloadUrl,
        identificacaoGrcp: uploadForm.identificacaoGrcp,
        updatedAt: serverTimestamp()
      };

      if (uploadContext.target === 'guia') {
        payload.valor = uploadForm.valor;
      } else {
        payload.status = 'pago';
        payload.valorPago = uploadForm.valor;
      }

      if (guia) {
        await updateDoc(doc(db, 'guias', guia.id), payload);
        setGuias(prev => prev.map(g => g.id === guia!.id ? normalizeGuia({ ...g, ...payload }) : g));
      } else {
        const newDoc = {
          departamentoId: uploadContext.deptId,
          tipo: uploadContext.tipo,
          mes: mesReferencia,
          ano: anoFiscal,
          nome: pendingFile.name.split('.')[0],
          valor: uploadContext.target === 'guia' ? uploadForm.valor : 0,
          valorPago: uploadContext.target === 'comprovante' ? uploadForm.valor : 0,
          status: uploadContext.target === 'comprovante' ? 'pago' : 'pendente',
          identificacaoGrcp: uploadForm.identificacaoGrcp || `GRCP-${Date.now()}`,
          vencimento: new Date(anoFiscal, mesReferencia, 0).toISOString().split('T')[0],
          ...payload,
          createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, 'guias'), newDoc);
        setGuias(prev => [...prev, normalizeGuia({ id: docRef.id, ...newDoc })]);
      }
      
      showAlert("Sucesso", "Documento enviado e salvo com sucesso!", "success");
    } catch (error: any) {
      console.error("Erro no upload:", error);
      let msg = "Falha ao enviar arquivo para o armazenamento.";
      
      if (error.message?.includes('Firebase') || error.code?.includes('storage')) {
        msg = `Erro no Armazenamento: ${error.message}. Verifique sua conexão e permissões de upload.`;
      } else if (error.code === 'storage/unauthorized' || error.message?.includes('CORS')) {
        msg = "Erro de Permissão ou CORS. Verifique as configurações do Storage no Firebase.";
      }
      
      // Pequeno delay para evitar conflito de canal de mensagem no ambiente AI Studio
      setTimeout(() => {
        showAlert("Erro", msg, "danger");
      }, 100);
    } finally {
      setLoading(false);
      setUploadContext(null);
      setPendingFile(null);
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
    
    // Preparar URL para visualização
    const sanitizedUrl = url;
    console.log("[Visualização] Abrindo URL:", sanitizedUrl);

    // Tentar abrir em nova aba
    const win = window.open(sanitizedUrl, '_blank');
    if (!win) {
      const link = document.createElement('a');
      link.href = sanitizedUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadDocument = (url: string | undefined, filename: string) => {
    if (!url) return;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert("Download", "Iniciando download do arquivo...", "success");
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
                <th className="py-5 px-6 text-left border-r border-gray-200 w-[240px]">DEPTO</th>
                <th colSpan={4} className="py-5 border-r border-gray-200 text-blue-700 bg-blue-50/30">PATRONAL</th>
                <th colSpan={4} className="py-5 text-emerald-700 bg-emerald-50/30">SEGURADOS</th>
              </tr>
              <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest text-left border-b border-gray-200">
                <th className="py-3 px-6 border-r border-gray-200 w-[240px]">DEPARTAMENTO</th>
                
                <th className="py-3 px-4 whitespace-nowrap min-w-[140px]">ID GRCP</th>
                <th className="py-3 px-4 min-w-[100px]">VALOR</th>
                <th className="py-3 px-4 text-center">GUIA</th>
                <th className="py-3 px-4 text-center border-r border-gray-200">COMPROVANTE</th>

                <th className="py-3 px-4 whitespace-nowrap min-w-[140px]">ID GRCP</th>
                <th className="py-3 px-4 min-w-[100px]">VALOR</th>
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
                    <td className="py-3 px-6 border-r border-gray-200 max-w-[240px]">
                      <p className="font-black text-gray-900 text-[10px] tracking-tight leading-normal whitespace-normal break-words">{dept.nome}</p>
                      {dept.onedriveFolderId && (
                        <div className="flex items-center gap-1 mt-1">
                          <Cloud className="w-3 h-3 text-emerald-500" />
                          <span className="text-[8px] font-bold text-emerald-600 uppercase">Vinculado</span>
                        </div>
                      )}
                    </td>

                    {/* PATRONAL SECTION */}
                    <td className="p-2 px-4 min-w-[140px]">
                        <div className="min-h-[1.5rem] flex items-center">
                          {patData ? (
                            <input 
                              type="text"
                              className="bg-transparent border-none p-0 text-[10px] font-bold text-gray-600 w-full focus:ring-0 outline-none leading-tight"
                              value={patData.identificacaoGrcp || ''}
                              onChange={(e) => handleInlineUpdate(patData.id, 'identificacaoGrcp', e.target.value)}
                            />
                          ) : <span className="text-gray-200 text-[8px]">---</span>}
                        </div>
                    </td>
                    <td className="p-2 px-4 min-w-[100px]">
                        {patData ? (
                          <div className="flex items-center gap-0.5">
                            <span className="font-black text-gray-900 text-[10px]">R$</span>
                            <input 
                              type="text"
                              className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px]"
                              value={tempValues[patData.id] !== undefined ? tempValues[patData.id] : formatBRL(patData.valor)}
                              onFocus={() => {
                                setTempValues(prev => ({ ...prev, [patData.id]: formatBRL(patData.valor) }));
                              }}
                              onChange={(e) => {
                                const typed = e.target.value;
                                setTempValues(prev => ({ ...prev, [patData.id]: typed }));
                                handleInlineUpdate(patData.id, 'valor', parseBRLToFloat(typed));
                              }}
                              onBlur={() => {
                                setTempValues(prev => {
                                  const next = { ...prev };
                                  delete next[patData.id];
                                  return next;
                                });
                              }}
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
                             title="Visualizar"
                           >
                             <FileText className="w-4 h-4" />
                           </button>
                           <button 
                             onClick={() => downloadDocument(patData.urlGuia, `guia-patronal-${dept.nome}.pdf`)}
                             className="w-8 h-8 bg-gray-50 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all border border-gray-200"
                             title="Baixar"
                           >
                             <Download className="w-4 h-4" />
                           </button>
                           <button onClick={() => handleDeleteGuia(patData.id)} className="w-5 h-5 text-rose-300 hover:text-rose-600 transition-colors">
                              <Minus className="w-3.5 h-3.5" />
                           </button>
                         </div>
                       ) : (
                         <div className="flex items-center justify-center gap-1">
                           <button 
                             onClick={() => triggerUpload(dept.id, 'patronal', 'guia')}
                             className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-dashed border-gray-200"
                             title="Upload Manual"
                           >
                             <Plus className="w-3.5 h-3.5" />
                           </button>
                           {dept.onedriveFolderId && (
                             <button 
                               onClick={() => setOneDrivePickContext({ deptId: dept.id, tipo: 'patronal', target: 'guia' })}
                               className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                               title="Vincular do OneDrive"
                             >
                               <Cloud size={14} />
                             </button>
                           )}
                         </div>
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
                    <td className="p-2 px-4 min-w-[140px]">
                        <div className="min-h-[1.5rem] flex items-center">
                          {segData ? (
                            <input 
                              type="text"
                              className="bg-transparent border-none p-0 text-[10px] font-bold text-gray-600 w-full focus:ring-0 outline-none leading-tight"
                              value={segData.identificacaoGrcp || ''}
                              onChange={(e) => handleInlineUpdate(segData.id, 'identificacaoGrcp', e.target.value)}
                            />
                          ) : <span className="text-gray-200 text-[8px]">---</span>}
                        </div>
                    </td>
                    <td className="p-2 px-4 min-w-[100px]">
                        {segData ? (
                          <div className="flex items-center gap-0.5">
                            <span className="font-black text-gray-900 text-[10px]">R$</span>
                            <input 
                              type="text"
                              className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px]"
                              value={tempValues[segData.id] !== undefined ? tempValues[segData.id] : formatBRL(segData.valor)}
                              onFocus={() => {
                                setTempValues(prev => ({ ...prev, [segData.id]: formatBRL(segData.valor) }));
                              }}
                              onChange={(e) => {
                                const typed = e.target.value;
                                setTempValues(prev => ({ ...prev, [segData.id]: typed }));
                                handleInlineUpdate(segData.id, 'valor', parseBRLToFloat(typed));
                              }}
                              onBlur={() => {
                                setTempValues(prev => {
                                  const next = { ...prev };
                                  delete next[segData.id];
                                  return next;
                                });
                              }}
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
                             title="Visualizar"
                           >
                             <FileText className="w-4 h-4" />
                           </button>
                           <button 
                             onClick={() => downloadDocument(segData.urlGuia, `guia-segurado-${dept.nome}.pdf`)}
                             className="w-8 h-8 bg-gray-50 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all border border-gray-200"
                             title="Baixar"
                           >
                             <Download className="w-4 h-4" />
                           </button>
                           <button onClick={() => handleDeleteGuia(segData.id)} className="w-5 h-5 text-rose-300 hover:text-rose-600 transition-colors">
                              <Minus className="w-3.5 h-3.5" />
                           </button>
                         </div>
                       ) : (
                         <div className="flex items-center justify-center gap-1">
                           <button 
                             onClick={() => triggerUpload(dept.id, 'segurado', 'guia')}
                             className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-dashed border-gray-200"
                             title="Upload Manual"
                           >
                             <Plus className="w-3.5 h-3.5" />
                           </button>
                           {dept.onedriveFolderId && (
                             <button 
                               onClick={() => setOneDrivePickContext({ deptId: dept.id, tipo: 'segurado', target: 'guia' })}
                               className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                               title="Vincular do OneDrive"
                             >
                               <Cloud size={14} />
                             </button>
                           )}
                         </div>
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

      {/* OneDrive File Picker Modal */}
      <AnimatePresence>
        {oneDrivePickContext && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-emerald-500" />
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black italic tracking-tighter text-gray-900 leading-none uppercase">Vincular do OneDrive</h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">Escolha o arquivo PDF para vincular</p>
                </div>
                <button onClick={() => setOneDrivePickContext(null)} className="text-gray-400 hover:text-black">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <OneDriveExplorer 
                initialFolderId={departamentos.find(d => d.id === oneDrivePickContext.deptId)?.onedriveFolderId}
                onSelectFile={async (file) => {
                  if (file.folder) return;
                  
                  try {
                    setLoading(true);
                    const dept = departamentos.find(d => d.id === oneDrivePickContext.deptId);
                    const existingGuia = guias.find(g => g.departamentoId === oneDrivePickContext.deptId && g.tipo === oneDrivePickContext.tipo);
                    
                    const urlFieldName = oneDrivePickContext.target === 'guia' ? 'urlGuia' : 'urlComprovante';
                    const payload: any = {
                      [urlFieldName]: file.webUrl, // Link de visualização do OneDrive
                      updatedAt: serverTimestamp()
                    };

                    if (existingGuia) {
                      await updateDoc(doc(db, 'guias', existingGuia.id), payload);
                      setGuias(prev => prev.map(g => g.id === existingGuia.id ? normalizeGuia({ ...g, ...payload }) : g));
                    } else {
                      const newDoc = {
                        departamentoId: oneDrivePickContext.deptId,
                        tipo: oneDrivePickContext.tipo,
                        mes: mesReferencia,
                        ano: anoFiscal,
                        nome: file.name.split('.')[0],
                        valor: 0,
                        valorPago: 0,
                        status: 'pendente',
                        identificacaoGrcp: `ONEDRIVE-${Date.now()}`,
                        vencimento: new Date(anoFiscal, mesReferencia, 0).toISOString().split('T')[0],
                        [urlFieldName]: file.webUrl,
                        createdAt: serverTimestamp()
                      };
                      const docRef = await addDoc(collection(db, 'guias'), newDoc);
                      setGuias(prev => [...prev, normalizeGuia({ id: docRef.id, ...newDoc })]);
                    }
                    
                    setOneDrivePickContext(null);
                    showAlert("Sucesso", "Arquivo vinculado com sucesso!", "success");
                  } catch (err) {
                    console.error(err);
                    showAlert("Erro", "Não foi possível vincular o arquivo.", "danger");
                  } finally {
                    setLoading(false);
                  }
                }}
              />
              
              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => setOneDrivePickContext(null)}
                  className="px-6 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-black"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Preenchimento antes do Upload */}
      <AnimatePresence>
        {isFormModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-10 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 to-emerald-500" />
              
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter text-gray-900 leading-none">CONFERÊNCIA DE DADOS</h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">GESTÃO GLOBAL DE GUIAS</p>
                </div>
                <button onClick={() => setIsFormModalOpen(false)} className="text-gray-400 hover:text-black">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Identificação (Código GRCP)</label>
                  <input 
                    type="text"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Ex: GRCP-2026-X"
                    value={uploadForm.identificacaoGrcp}
                    onChange={e => setUploadForm(prev => ({ ...prev, identificacaoGrcp: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    {uploadContext?.target === 'guia' ? 'Valor da Guia' : 'Valor Pago (Comprovante)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-sm">R$</span>
                    <input 
                      type="text"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-12 pr-4 py-3 font-black text-gray-900 text-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={modalValorStr}
                      onChange={e => {
                        setModalValorStr(e.target.value);
                        setUploadForm(prev => ({ ...prev, valor: parseBRLToFloat(e.target.value) }));
                      }}
                      onBlur={() => {
                        setModalValorStr(formatBRL(parseBRLToFloat(modalValorStr)));
                      }}
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex gap-4">
                  <button 
                    onClick={() => setIsFormModalOpen(false)}
                    className="flex-1 px-6 py-4 rounded-xl font-black text-[11px] uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleConfirmUpload}
                    disabled={loading}
                    className="flex-1 bg-black text-white px-6 py-4 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50"
                  >
                    {loading ? 'Subindo...' : 'Confirmar e Enviar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
