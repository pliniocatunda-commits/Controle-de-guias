import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { db } from '../lib/firebase';
import { uploadFile } from '../lib/storage';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { extractGuiaData, extractComprovanteData, ExtractedGuia, ExtractedComprovante } from '../services/geminiService';
import { 
  FileUp, FileText, CheckCircle, AlertCircle, 
  Loader2, X, UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ModalConfirmacao from './ModalConfirmacao';

interface ImportadorGuiasProps {
  departamentoId?: string;
  secretariaId: string;
  onComplete: () => void;
}

interface FileProcessState {
  file: File;
  status: 'pending' | 'processing' | 'uploading' | 'done' | 'error';
  type?: 'guia' | 'comprovante';
  data?: ExtractedGuia | ExtractedComprovante;
  error?: string;
  progress: number;
}

export default function ImportadorGuias({ departamentoId, secretariaId, onComplete }: ImportadorGuiasProps) {
  const [files, setFiles] = useState<FileProcessState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState(departamentoId || '');
  const [competenciaMes, setCompetenciaMes] = useState(new Date().getMonth() + 1);
  const [competenciaAno, setCompetenciaAno] = useState(new Date().getFullYear());
  const [selectedRegime, setSelectedRegime] = useState<'capitalizado' | 'financeiro'>('capitalizado');
  const [departamentos, setDepartamentos] = useState<{id: string, nome: string}[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Estados para edição antes do upload
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ valor: 0, identificacaoGrcp: '', tipo: 'patronal' as 'patronal' | 'segurado' });

  React.useEffect(() => {
    async function fetchDepts() {
      const q = query(collection(db, 'departamentos'), where('secretariaId', '==', secretariaId));
      const snap = await getDocs(q);
      setDepartamentos(snap.docs.map(d => ({ id: d.id, nome: d.data().nome })));
    }
    fetchDepts();
  }, [secretariaId]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => {
      const fname = file.name.toUpperCase();
      const isSegurado = fname.includes('SEGURADO') || fname.includes('SEG');
      const isComprovante = fname.includes('COMPROVANTE') || fname.includes('PAG') || fname.includes('EXTRATO');
      
      return {
        file,
        status: 'pending' as const,
        progress: 0,
        type: isComprovante ? 'comprovante' : 'guia',
        data: {
          nome: file.name.split('.')[0],
          valor: 0,
          valorPago: 0,
          vencimento: new Date(competenciaAno, competenciaMes, 0).toISOString().split('T')[0],
          dataPagamento: new Date(competenciaAno, competenciaMes, 0).toISOString().split('T')[0],
          mes: competenciaMes,
          ano: competenciaAno,
          tipo: isSegurado ? 'segurado' : 'patronal',
          identificacaoGrcp: fname.match(/\d{4}\/PME-[A-Z]{3}\/\d{4}/)?.[0] || `FALTA-EDITAR-${Date.now().toString().slice(-4)}`
        } as any
      } as FileProcessState;
    });
    setFiles(prev => [...prev, ...newFiles]);
  }, [competenciaAno, competenciaMes]);

  const openEditor = (index: number) => {
    const item = files[index];
    if (!item || !item.data) return;
    
    setEditingIndex(index);
    setEditForm({
      valor: item.type === 'guia' ? (item.data as any).valor : (item.data as any).valorPago,
      identificacaoGrcp: item.data.identificacaoGrcp || '',
      tipo: (item.data as any).tipo || 'patronal'
    });
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    
    setFiles(prev => {
      const next = [...prev];
      const item = next[editingIndex];
      if (item.data) {
        if (item.type === 'guia') {
          (item.data as any).valor = editForm.valor;
          (item.data as any).tipo = editForm.tipo;
        } else {
          (item.data as any).valorPago = editForm.valor;
          (item.data as any).tipo = editForm.tipo;
        }
        item.data.identificacaoGrcp = editForm.identificacaoGrcp;
      }
      return next;
    });
    setEditingIndex(null);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'application/pdf': ['.pdf'] }
  } as any);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    if (!selectedDeptId) {
      setModalOpen(true);
      return;
    }
    
    setIsUploading(true);
    console.log("Iniciando processamento de", files.length, "arquivos...");

    const processItem = async (index: number) => {
      // Get the latest file state from current files list
      // Note: We use the index but we need to check if it's still valid
      let currentFile = files[index];
      if (!currentFile || currentFile.status === 'done') {
        console.log(`Pulando arquivo no index ${index} (já concluído ou inválido)`);
        return;
      }

      console.group(`Processando: ${currentFile.file.name}`);
      
      // Step: Mark as Processing
      setFiles(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'processing', error: undefined };
        return next;
      });

      try {
        const detectedType = currentFile.type || 'guia';
        const extractedData = currentFile.data;

        // Step: Mark as Uploading
        setFiles(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'uploading' };
          return next;
        });

        // 3. Upload para Firebase Storage
        const url = await uploadFile(currentFile.file, 'guias');

        console.log("4. Persistindo dados no Firestore...");
        const data: any = extractedData;
        const fname = currentFile.file.name.toUpperCase();

        if (detectedType === 'guia') {
          // Busca se já existe guia com esta GRCP para este depto
          const q = query(
            collection(db, 'guias'), 
            where('departamentoId', '==', selectedDeptId),
            where('identificacaoGrcp', '==', data.identificacaoGrcp)
          );
          const snap = await getDocs(q);

          const payload: any = {
            departamentoId: selectedDeptId,
            mes: data.mes,
            ano: data.ano,
            valor: data.valor,
            vencimento: data.vencimento,
            tipo: data.tipo,
            identificacaoGrcp: data.identificacaoGrcp,
            urlGuia: url,
            regime: selectedRegime,
            updatedAt: serverTimestamp()
          };

          if (snap.empty) {
            payload.status = 'pendente';
            payload.createdAt = serverTimestamp();
            await addDoc(collection(db, 'guias'), payload);
          } else {
            await updateDoc(doc(db, 'guias', snap.docs[0].id), payload);
          }
        } else {
          // É COMPROVANTE
          const q = query(
            collection(db, 'guias'), 
            where('departamentoId', '==', selectedDeptId),
            where('identificacaoGrcp', '==', data.identificacaoGrcp)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
            await updateDoc(doc(db, 'guias', snap.docs[0].id), {
              urlComprovante: url,
              valorPago: data.valorPago || data.valor || 0,
              status: 'pago',
              updatedAt: serverTimestamp()
            });
          } else {
            await addDoc(collection(db, 'guias'), {
              departamentoId: selectedDeptId,
              mes: data.mes || competenciaMes,
              ano: data.ano || competenciaAno,
              valor: 0,
              valorPago: data.valorPago || data.valor || 0,
              vencimento: data.vencimento || new Date(competenciaAno, competenciaMes, 0).toISOString().split('T')[0],
              tipo: data.tipo || 'patronal',
              identificacaoGrcp: data.identificacaoGrcp,
              nome: currentFile.file.name.split('.')[0],
              urlComprovante: url,
              status: 'pago',
              regime: selectedRegime,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        }

        setFiles(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'done' };
          return next;
        });
        console.log("✅ Concluído com sucesso.");

      } catch (err: any) {
        console.error(`❌ Erro em ${currentFile.file.name}:`, err);
        let friendlyError = err.message;
        
        if (err.message.includes('CORS') || err.code === 'storage/unauthorized') {
          friendlyError = "Erro de Permissão/CORS. Verifique as configurações de Storage no console.";
        } else if (err.code === 'storage/retry-limit-exceeded') {
          friendlyError = "Tempo limite excedido. Verifique sua conexão.";
        }

        setFiles(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'error', error: friendlyError };
          return next;
        });
      } finally {
        console.groupEnd();
      }
    };

    // Sequential loop for better stability and debugging
    for (let i = 0; i < files.length; i++) {
      await processItem(i);
    }
    
    // Check results after loop
    setFiles(currentFiles => {
      const allDone = currentFiles.every(f => f.status === 'done' || f.status === 'error');
      if (allDone && currentFiles.some(f => f.status === 'done')) {
        console.log("Processamento finalizado. Redirecionando...");
        onComplete();
      } else {
        setIsUploading(false);
      }
      return currentFiles;
    });
  };

  return (
    <div className="bg-white p-8 rounded-[32px] w-full max-w-4xl shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-yellow-400" />
      
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-gray-900 uppercase italic">
            Importação <span className="text-yellow-500">Múltipla</span>
          </h2>
          <p className="text-gray-500 text-sm font-medium mt-1">Envie as 4 guias e comprovantes (Patronal e Segurados).</p>
        </div>
        <div className="bg-yellow-50 p-3 rounded-2xl">
          <UploadCloud className="w-6 h-6 text-yellow-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Selecionar Departamento</label>
            <select 
              className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-yellow-400 focus:ring-0 outline-none transition-all font-bold text-gray-700"
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
            >
              <option value="">Escolha um departamento...</option>
              {departamentos.map(d => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Regime de Segregação</label>
            <div className="flex gap-2 bg-gray-50 p-1 rounded-2xl border-2 border-gray-100">
              <button
                type="button"
                onClick={() => setSelectedRegime('capitalizado')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  selectedRegime === 'capitalizado'
                    ? 'bg-yellow-400 text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Capitalizado
              </button>
              <button
                type="button"
                onClick={() => setSelectedRegime('financeiro')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  selectedRegime === 'financeiro'
                    ? 'bg-yellow-400 text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                Financeiro
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Competência (Mês)</label>
              <select 
                className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-yellow-400 focus:ring-0 outline-none transition-all font-bold text-gray-700"
                value={competenciaMes}
                onChange={e => setCompetenciaMes(parseInt(e.target.value))}
              >
                {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Ano</label>
              <input 
                type="number"
                className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-yellow-400 focus:ring-0 outline-none transition-all font-bold text-gray-700"
                value={competenciaAno}
                onChange={e => setCompetenciaAno(parseInt(e.target.value))}
              />
            </div>
          </div>
          
          <div className="mt-8">
             <div 
               {...getRootProps()} 
               className={`border-4 border-dashed rounded-[32px] p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${
                 isDragActive ? 'border-yellow-400 bg-yellow-50 scale-[1.02]' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
               }`}
             >
               <input {...getInputProps()} />
               <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                 <FileUp className={`w-8 h-8 ${isDragActive ? 'text-yellow-500' : 'text-gray-300'}`} />
               </div>
               <div>
                  <p className="text-sm font-black text-gray-900 uppercase tracking-widest leading-none">Arraste os arquivos</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2">PDFs das Guias e Comprovantes</p>
               </div>
             </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-[32px] p-6 border border-gray-100 flex flex-col">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Arquivos na Fila ({files.length})</h3>
          
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[400px] pr-2 custom-scrollbar">
            {files.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-center text-center opacity-20">
                <FileText className="w-12 h-12 mb-3" />
                <p className="text-[10px] font-bold uppercase">Nenhum arquivo selecionado</p>
              </div>
            ) : (
              files.map((item, idx) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={idx}
                  className="bg-white p-3 rounded-2xl flex items-center gap-3 border border-gray-100 group shadow-sm"
                >
                  <div className={`p-2 rounded-xl ${item.status === 'done' ? 'bg-emerald-50' : item.status === 'error' ? 'bg-rose-50' : 'bg-gray-100'}`}>
                    {item.status === 'processing' || item.status === 'uploading' ? (
                      <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
                    ) : item.status === 'done' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : item.status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    ) : (
                      <FileText className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => item.status === 'error' ? processFiles() : openEditor(idx)}>
                    <p className="text-xs font-bold truncate text-gray-900 group-hover:text-yellow-600 transition-colors uppercase">{item.file.name}</p>
                    <AnimatePresence mode="wait">
                      {item.status === 'pending' && (
                        <motion.p key="pend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[8px] font-black uppercase text-gray-400 tracking-widest mt-0.5">
                          Clique para conferir dados
                        </motion.p>
                      )}
                      {item.status === 'uploading' && (
                        <motion.p key="upl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[8px] font-black uppercase text-blue-600 tracking-widest mt-0.5">
                          Enviando arquivo...
                        </motion.p>
                      )}
                      {item.status === 'done' && item.type && (
                        <motion.p key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[8px] font-black uppercase text-emerald-600 tracking-widest mt-0.5">
                          {item.type} identificado e salvo
                        </motion.p>
                      )}
                      {item.status === 'error' && (
                        <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[8px] font-black uppercase text-rose-600 tracking-widest mt-0.5">
                          {item.error || 'Erro'}. Clique para tentar novamente.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                  <button 
                    disabled={isUploading}
                    onClick={() => removeFile(idx)}
                    className="p-1.5 hover:bg-rose-50 text-gray-300 hover:text-rose-500 rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ))
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button 
              disabled={files.length === 0 || isUploading}
              onClick={processFiles}
              className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-black font-black uppercase tracking-[0.2em] text-xs rounded-2xl transition-all shadow-xl shadow-yellow-400/20 disabled:grayscale disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Iniciar Importação'
              )}
            </button>
          </div>
        </div>
      </div>

      <ModalConfirmacao 
        isOpen={modalOpen}
        title="Departamento Necessário"
        message="Por favor, selecione para qual departamento deseja importar estas guias antes de iniciar o processamento."
        type="warning"
        confirmText="Entendi"
        onConfirm={() => setModalOpen(false)}
        onClose={() => setModalOpen(false)}
      />

      {/* Modal de Edição de Dados antes do Upload */}
      <AnimatePresence>
        {editingIndex !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md p-10 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-yellow-400" />
              
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black italic tracking-tighter text-gray-900 leading-none">CONFERIR ARQUIVO</h3>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">{files[editingIndex].file.name}</p>
                </div>
                <button onClick={() => setEditingIndex(null)} className="text-gray-400 hover:text-black">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">Tipo de Guia</label>
                  <div className="grid grid-cols-2 gap-2">
                     <button 
                       onClick={() => setEditForm(prev => ({ ...prev, tipo: 'patronal' }))}
                       className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${editForm.tipo === 'patronal' ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : 'border-gray-100 text-gray-400 hover:border-gray-300'}`}
                     >
                       Patronal
                     </button>
                     <button 
                       onClick={() => setEditForm(prev => ({ ...prev, tipo: 'segurado' }))}
                       className={`py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all ${editForm.tipo === 'segurado' ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' : 'border-gray-100 text-gray-400 hover:border-gray-300'}`}
                     >
                       Segurado
                     </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Identificação GRCP</label>
                  <input 
                    type="text"
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-4 font-black text-gray-900 focus:border-yellow-400 outline-none transition-all placeholder:text-gray-300"
                    placeholder="Ex: 2026/PME-GRCP/1234"
                    value={editForm.identificacaoGrcp}
                    onChange={e => setEditForm(prev => ({ ...prev, identificacaoGrcp: e.target.value.toUpperCase() }))}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Valor (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">R$</span>
                    <input 
                      type="number"
                      step="0.01"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl pl-12 pr-4 py-4 font-black text-gray-900 text-2xl focus:border-yellow-400 outline-none transition-all"
                      value={editForm.valor}
                      onChange={e => setEditForm(prev => ({ ...prev, valor: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                
                <div className="pt-4">
                  <button 
                    onClick={saveEdit}
                    className="w-full bg-yellow-400 text-black px-6 py-5 rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-yellow-500 transition-all shadow-xl shadow-yellow-400/20 active:scale-95"
                  >
                    Salvar e Confirmar
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
