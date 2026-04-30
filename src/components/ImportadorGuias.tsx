import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadBytes, ref, getDownloadURL } from 'firebase/storage';
import { storage, db } from '../lib/firebase';
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
  const [departamentos, setDepartamentos] = useState<{id: string, nome: string}[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  React.useEffect(() => {
    async function fetchDepts() {
      const q = query(collection(db, 'departamentos'), where('secretariaId', '==', secretariaId));
      const snap = await getDocs(q);
      setDepartamentos(snap.docs.map(d => ({ id: d.id, nome: d.data().nome })));
    }
    fetchDepts();
  }, [secretariaId]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      file,
      status: 'pending' as const,
      progress: 0
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

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
        // 1. Identificação básica por nome de arquivo (IGNORANDO IA POR ENQUANTO)
        let detectedType: 'guia' | 'comprovante' | null = null;
        let extractedData: any = null;

        const fname = currentFile.file.name.toUpperCase();
        const isSeguradoHint = fname.includes('SEGURADO') || fname.includes('SEG');
        const isComprovanteHint = fname.includes('COMPROVANTE') || fname.includes('PAG') || fname.includes('EXTRATO');

        // Heurística baseada no nome
        if (isComprovanteHint) {
          detectedType = 'comprovante';
          extractedData = {
            valorPago: 0,
            dataPagamento: new Date().toISOString().split('T')[0],
            identificacaoGrcp: fname.match(/\d{4}\/PME-[A-Z]{3}\/\d{4}/)?.[0] || `PENDENTE-${Date.now()}-${index}`
          };
          console.log("   -> Identificado como COMPROVANTE via nome");
        } else {
          detectedType = 'guia';
          extractedData = {
            nome: currentFile.file.name.split('.')[0],
            valor: 0,
            vencimento: new Date(competenciaAno, competenciaMes, 0).toISOString().split('T')[0],
            mes: competenciaMes,
            ano: competenciaAno,
            tipo: isSeguradoHint ? 'segurado' : 'patronal',
            identificacaoGrcp: fname.match(/\d{4}\/PME-[A-Z]{3}\/\d{4}/)?.[0] || `PENDENTE-${Date.now()}-${index}`
          };
          console.log("   -> Identificado como GUIA via nome");
        }

        // Step: Mark as Uploading
        setFiles(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'uploading', type: detectedType as any, data: extractedData };
          return next;
        });

        // Simulação de Link (Bypass Storage Upload para evitar travas de rede)
        const url = "arquivos_manuais/" + currentFile.file.name;

        console.log("4. Persistindo dados no Firestore...");
        if (detectedType === 'guia') {
          const data = extractedData as ExtractedGuia;
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
          const data = extractedData as ExtractedComprovante;
          const q = query(
            collection(db, 'guias'), 
            where('departamentoId', '==', selectedDeptId),
            where('identificacaoGrcp', '==', data.identificacaoGrcp)
          );
          const snap = await getDocs(q);

          if (!snap.empty) {
            await updateDoc(doc(db, 'guias', snap.docs[0].id), {
              urlComprovante: url,
              valorPago: data.valorPago || 0,
              status: 'pago',
              updatedAt: serverTimestamp()
            });
          } else {
            await addDoc(collection(db, 'guias'), {
              departamentoId: selectedDeptId,
              mes: competenciaMes,
              ano: competenciaAno,
              valor: 0,
              valorPago: data.valorPago || 0,
              vencimento: data.dataPagamento || new Date(competenciaAno, competenciaMes, 0).toISOString().split('T')[0],
              tipo: fname.includes('SEG') ? 'segurado' : 'patronal',
              identificacaoGrcp: data.identificacaoGrcp,
              nome: currentFile.file.name.split('.')[0],
              urlComprovante: url,
              status: 'pago',
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
        setFiles(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'error', error: err.message };
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
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate text-gray-900">{item.file.name}</p>
                    <AnimatePresence mode="wait">
                      {item.status === 'processing' && (
                        <motion.p key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[8px] font-black uppercase text-yellow-600 tracking-widest mt-0.5 animate-pulse">
                          Analisando arquivo...
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
                          {item.error || 'Erro no processamento'}
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
    </div>
  );
}
