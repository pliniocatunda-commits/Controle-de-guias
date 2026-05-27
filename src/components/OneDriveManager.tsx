import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, updateDoc, addDoc, query, where, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Secretaria, Departamento, Guia } from '../types';
import { onedriveService, DriveItem } from '../services/onedriveService';
import { 
  Cloud, Folder, File, ChevronRight, Loader2, ArrowLeft, ExternalLink, 
  Settings, Link as LinkIcon, Building2, Layers, Calendar, DollarSign,
  CheckCircle2, Info, RefreshCw, Eye, Trash2, ShieldCheck, AlertCircle, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ModalConfirmacao from './ModalConfirmacao';

export default function OneDriveManager() {
  const [activeTab, setActiveTab] = useState<'picker' | 'linked'>('picker');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [oneDriveUser, setOneDriveUser] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  // Firestore Data
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [allLinkedGuias, setAllLinkedGuias] = useState<Guia[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // OneDrive Navigation State
  const [items, setItems] = useState<DriveItem[]>([]);
  const [navHistory, setNavHistory] = useState<{ id: string; name: string }[]>([]);
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  // Selection & Linkage Form State
  const [selectedFile, setSelectedFile] = useState<DriveItem | null>(null);
  const [formSecretariaId, setFormSecretariaId] = useState('');
  const [formDepartamentoId, setFormDepartamentoId] = useState('');
  const [formTipo, setFormTipo] = useState<'patronal' | 'segurado'>('patronal');
  const [formTarget, setFormTarget] = useState<'guia' | 'comprovante'>('guia');
  const [formMes, setFormMes] = useState(new Date().getMonth() + 1);
  const [formAno, setFormAno] = useState(new Date().getFullYear());
  const [formValor, setFormValor] = useState('');
  const [formGrcp, setFormGrcp] = useState('');
  const [linkingInProgress, setLinkingInProgress] = useState(false);

  // Alerts & Modals
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
      type,
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

  // 1. Initial Data Loading
  useEffect(() => {
    checkOneDriveConnection();
    loadSystemData();
  }, []);

  const checkOneDriveConnection = async () => {
    try {
      const u = await onedriveService.getUser();
      if (u) {
        setIsConnected(true);
        setOneDriveUser(u);
        const diag = await onedriveService.getDiagnostics();
        setDiagnostics(diag);
      } else {
        setIsConnected(false);
      }
    } catch (err) {
      console.error(err);
      setIsConnected(false);
    }
  };

  const loadSystemData = async () => {
    setLoadingData(true);
    try {
      // Secretarias
      const secSnap = await getDocs(collection(db, 'secretarias'));
      const secs = secSnap.docs.map(d => ({ id: d.id, ...d.data() } as Secretaria));
      setSecretarias(secs);

      // Departamentos
      const depSnap = await getDocs(collection(db, 'departamentos'));
      const deps = depSnap.docs.map(d => ({ id: d.id, ...d.data() } as Departamento));
      setDepartamentos(deps);

      // Active Linked Guias
      const guiasSnap = await getDocs(collection(db, 'guias'));
      const linked = guiasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Guia));
      setAllLinkedGuias(linked);
    } catch (error) {
      console.error("Erro ao carregar dados do Firestore:", error);
    } finally {
      setLoadingData(false);
    }
  };

  // 2. Fetch OneDrive files
  useEffect(() => {
    if (isConnected === true) {
      fetchOneDriveItems();
    }
  }, [currentFolder, isConnected]);

  const fetchOneDriveItems = async () => {
    setLoadingItems(true);
    try {
      const data = await onedriveService.listFiles(currentFolder?.id);
      setItems(data);
    } catch (err) {
      console.error("Erro ao listar arquivos do OneDrive:", err);
      showAlert("Erro", "Não foi possível resgatar arquivos desta pasta.", "danger");
    } finally {
      setLoadingItems(false);
    }
  };

  const handleNavigateToFolder = (folder: DriveItem) => {
    if (folder.folder) {
      if (currentFolder) {
        setNavHistory(prev => [...prev, currentFolder]);
      }
      setCurrentFolder({ id: folder.id, name: folder.name });
    }
  };

  const handleNavigateBack = () => {
    const freshHistory = [...navHistory];
    const previous = freshHistory.pop();
    setNavHistory(freshHistory);
    setCurrentFolder(previous || null);
  };

  // 3. Connect OneDrive Flow
  const handleConnectOneDrive = async () => {
    try {
      const url = await onedriveService.getAuthUrl();
      const width = 600, height = 700;
      const left = window.innerWidth / 2 - width / 2;
      const top = window.innerHeight / 2 - height / 2;
      
      const popup = window.open(url, 'onedrive_auth', `width=${width},height=${height},left=${left},top=${top}`);

      const handleAuthMessage = async (event: MessageEvent) => {
        if (event.data?.type === 'ONEDRIVE_AUTH_SUCCESS') {
          const { token, refreshToken } = event.data;
          if (token) localStorage.setItem('onedrive_token', token);
          if (refreshToken) localStorage.setItem('onedrive_refresh_token', refreshToken);
          
          await checkOneDriveConnection();
          showAlert("Conectado!", "Sua conta do OneDrive foi integrada com sucesso.", "success");
          window.removeEventListener('message', handleAuthMessage);
        }
      };

      window.addEventListener('message', handleAuthMessage);
    } catch (err: any) {
      showAlert("Erro", err.message || "Erro para abrir canal de autenticação.", "danger");
    }
  };

  const handleDisconnect = () => {
    askConfirmation(
      "Desconectar Conta",
      "Deseja realmente remover seu vínculo da conta OneDrive e esvaziar credenciais de segurança?",
      "warning",
      () => {
        localStorage.removeItem('onedrive_token');
        localStorage.removeItem('onedrive_refresh_token');
        setIsConnected(false);
        setOneDriveUser(null);
        setItems([]);
        setCurrentFolder(null);
        setNavHistory([]);
        showAlert("Desconectado", "Credenciais de acesso do OneDrive limpas com sucesso.", "info");
      }
    );
  };

  // When selected file changes, pre-fill form suggesting data from filename
  const handleSelectFileForLink = (file: DriveItem) => {
    setSelectedFile(file);
    const fname = file.name.toLowerCase();
    
    // Guess type
    if (fname.includes('patronal') || fname.includes('patr')) {
      setFormTipo('patronal');
    } else if (fname.includes('segurado') || fname.includes('seg')) {
      setFormTipo('segurado');
    }

    // Guess target
    if (fname.includes('comprovante') || fname.includes('comp') || fname.includes('recibo') || fname.includes('pago')) {
      setFormTarget('comprovante');
    } else {
      setFormTarget('guia');
    }

    // Guess reference date (e.g., 05-2026, 05/2026, 2026-05)
    const matchYear = fname.match(/202[4-9]/);
    if (matchYear) {
      setFormAno(parseInt(matchYear[0]));
    }
    const matchMonth = fname.match(/(?:0[1-9]|1[0-2])\b/); 
    if (matchMonth) {
      setFormMes(parseInt(matchMonth[0]));
    }

    // Default GRCP suggest
    setFormGrcp(`ONEDRIVE-${Date.now().toString().slice(-6)}`);
    setFormValor('');
  };

  // Complete file-to-dept linkage
  const handleConfirmLinkage = async () => {
    if (!selectedFile) return;
    if (!formSecretariaId) {
      showAlert("Atenção", "Selecione uma secretaria para vincular o documento.", "warning");
      return;
    }
    if (!formDepartamentoId) {
      showAlert("Atenção", "Selecione o departamento correspondente.", "warning");
      return;
    }

    setLinkingInProgress(true);
    try {
      // Find out if Guia registry already exists for that month, year, dept and type
      const targetQuery = query(
        collection(db, 'guias'),
        where('departamentoId', '==', formDepartamentoId),
        where('tipo', '==', formTipo),
        where('mes', '==', formMes),
        where('ano', '==', formAno)
      );
      const snap = await getDocs(targetQuery);
      
      const urlFieldName = formTarget === 'guia' ? 'urlGuia' : 'urlComprovante';
      const valorNum = parseFloat(formValor) || 0;

      const payload: any = {
        [urlFieldName]: selectedFile.webUrl,
        updatedAt: serverTimestamp()
      };

      if (formGrcp) payload.identificacaoGrcp = formGrcp;
      
      if (formTarget === 'guia') {
        if (valorNum > 0) payload.valor = valorNum;
      } else {
        // is comprovante
        payload.status = 'pago';
        if (valorNum > 0) payload.valorPago = valorNum;
      }

      if (!snap.empty) {
        // Edit existing registry
        const oldDoc = snap.docs[0];
        const oldDocId = oldDoc.id;
        await updateDoc(doc(db, 'guias', oldDocId), payload);
      } else {
        // Create new Guia registry
        const newDoc: any = {
          departamentoId: formDepartamentoId,
          tipo: formTipo,
          mes: formMes,
          ano: formAno,
          nome: selectedFile.name.split('.')[0],
          valor: formTarget === 'guia' ? valorNum : 0,
          valorPago: formTarget === 'comprovante' ? valorNum : 0,
          status: formTarget === 'comprovante' ? 'pago' : 'pendente',
          identificacaoGrcp: formGrcp || `GRCP-OD-${Date.now()}`,
          vencimento: new Date(formAno, formMes, 0).toISOString().split('T')[0],
          [urlFieldName]: selectedFile.webUrl,
          createdAt: serverTimestamp()
        };
        await addDoc(collection(db, 'guias'), newDoc);
      }

      await loadSystemData(); // Refresh list
      showAlert("Sucesso", `O arquivo "${selectedFile.name}" foi vinculado com êxito!`, "success");
      setSelectedFile(null); // Reset selection
    } catch (err: any) {
      console.error(err);
      showAlert("Erro na Gravação", "Ocorreu uma exceção ao salvar o vínculo em sua base de dados.", "danger");
    } finally {
      setLinkingInProgress(false);
    }
  };

  const handleRemoveLinkFromGuia = (guiaId: string, docTarget: 'guia' | 'comprovante') => {
    const targetText = docTarget === 'guia' ? 'a guia principal' : 'o comprovante';
    askConfirmation(
      "Remover Vínculo",
      `Deseja realmente desvincular do OneDrive ${targetText} deste registro fiscal? O arquivo em si NÃO será deletado da nuvem.`,
      "danger",
      async () => {
        try {
          const fieldToClear = docTarget === 'guia' ? 'urlGuia' : 'urlComprovante';
          const guiaDoc = doc(db, 'guias', guiaId);
          
          if (docTarget === 'guia') {
            await updateDoc(guiaDoc, { urlGuia: null });
          } else {
            // Se tirar o comprovante, volta o status a pendente
            await updateDoc(guiaDoc, { urlComprovante: null, status: 'pendente' });
          }
          await loadSystemData();
          showAlert("Desvinculado", "O arquivo foi desassociado desse departamento com sucesso.", "success");
        } catch (err) {
          console.error(err);
          showAlert("Erro", "Falha ao desassociar vínculo.", "danger");
        }
      }
    );
  };

  // Helper selectors
  const filteredDepartments = departamentos.filter(d => d.secretariaId === formSecretariaId);
  const connectedUserMail = oneDriveUser?.mail || oneDriveUser?.userPrincipalName || 'N/D';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Top Title Bar */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8 bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Cloud className="text-blue-500 animate-pulse" size={24} />
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 flex items-center gap-1">
              Integração Cloud <Sparkles size={12} className="text-amber-500 fill-amber-50" />
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none uppercase">Central de Arquivos OneDrive</h1>
          <p className="text-gray-400 font-bold text-[10px] uppercase tracking-[0.2em] mt-2">
            Faça a vinculação automática de relatórios em secretarias e departamentos correspondentes
          </p>
        </div>

        {isConnected === true && (
          <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
            <div className="text-right">
              <p className="text-sm font-black text-gray-900 leading-tight">{oneDriveUser?.displayName}</p>
              <p className="text-[9px] text-gray-400 font-bold truncate max-w-[180px]">{connectedUserMail}</p>
            </div>
            <button 
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-500 hover:text-white text-xs font-bold uppercase tracking-wider transition-all"
            >
              Sair
            </button>
          </div>
        )}
      </header>

      {/* Connection State Panel */}
      {isConnected === null ? (
        <div className="bg-white rounded-3xl p-20 text-center border shadow-sm flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-indigo-500" size={32} />
          <p className="text-sm font-semibold text-gray-500">Buscando status de autorização do OneDrive...</p>
        </div>
      ) : isConnected === false ? (
        <div className="bg-white rounded-[2rem] p-16 text-center border-2 border-dashed border-gray-200 shadow-sm flex flex-col items-center max-w-xl mx-auto my-12">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 mb-6 border border-blue-100">
            <Cloud size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Conecte sua conta corporativa/estudantil</h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-8">
            Para acessar, vincular e visualizar comprovantes de aposentadoria e guias de recolhimento previdenciário diretamente de suas pastas virtuais no OneDrive, acesse sua conta da Microsoft.
          </p>
          <button
            onClick={handleConnectOneDrive}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 font-bold shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            <Cloud size={18} />
            CONECTAR CONTA ONEDRIVE
          </button>
        </div>
      ) : (
        /* Connected Workspace interface */
        <div className="space-y-6">
          {/* Main Action Tabs */}
          <div className="flex gap-2 p-1 bg-gray-200/60 rounded-2xl max-w-md">
            <button
              onClick={() => { setActiveTab('picker'); setSelectedFile(null); }}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === 'picker' 
                  ? 'bg-white text-black shadow-md' 
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              1. Localizar e Vincular Arquivo
            </button>
            <button
              onClick={() => setActiveTab('linked')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === 'linked' 
                  ? 'bg-white text-black shadow-md' 
                  : 'text-gray-500 hover:text-black'
              }`}
            >
              2. Visualizar Vínculos Ativos
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'picker' ? (
              <motion.div 
                key="picker-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
              >
                {/* Left Side: OneDrive Explorer Tree */}
                <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[500px]">
                  <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center whitespace-nowrap">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {navHistory.length > 0 || currentFolder ? (
                        <button 
                          onClick={handleNavigateBack}
                          className="p-2 hover:bg-gray-200 text-gray-700 rounded-xl transition-all"
                        >
                          <ArrowLeft size={16} />
                        </button>
                      ) : (
                        <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                          <Cloud size={16} />
                        </div>
                      )}
                      
                      <div className="overflow-hidden">
                        <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest leading-none">Pasta Atual</p>
                        <h4 className="text-sm font-black text-gray-900 truncate mt-1">
                          {currentFolder ? currentFolder.name : 'OneDrive / Raiz Corporativa'}
                        </h4>
                      </div>
                    </div>

                    <button 
                      onClick={fetchOneDriveItems}
                      title="Sincronizar Arquivos"
                      className="p-2 text-gray-400 hover:text-black rounded-lg transition-colors flex items-center gap-2 text-xs font-bold border hover:bg-white"
                    >
                      <RefreshCw size={14} className={loadingItems ? "animate-spin" : ""} />
                      Sincronizar
                    </button>
                  </div>

                  {/* OneDrive File/Folder loop List */}
                  <div className="flex-1 max-h-[500px] overflow-y-auto min-h-[300px]">
                    {loadingItems ? (
                      <div className="p-24 flex flex-col items-center justify-center gap-3 text-gray-400">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p className="text-xs font-bold uppercase tracking-widest mt-2 shrink-0 animate-pulse">Consultando Repositório...</p>
                      </div>
                    ) : items.length === 0 ? (
                      <div className="p-24 text-center text-gray-400 flex flex-col items-center justify-center">
                        <Folder className="text-gray-200 mb-4 stroke-[1.5px]" size={48} />
                        <p className="font-semibold text-gray-900 text-sm">Esta pasta está vazia.</p>
                        <p className="text-xs text-gray-400 mt-1">Nenhum arquivo PDF ou subpasta recuperados.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {items.map((item) => {
                          const isPdf = item.name.toLowerCase().endsWith('.pdf');
                          const isFolder = !!item.folder;

                          if (!isFolder && !isPdf) return null; // We filter out non-folders or non-PDFs

                          return (
                            <div 
                              key={item.id}
                              onClick={() => isFolder ? handleNavigateToFolder(item) : handleSelectFileForLink(item)}
                              className={`flex items-center justify-between p-4 hover:bg-indigo-50/30 cursor-pointer group transition-all ${
                                selectedFile?.id === item.id ? 'bg-indigo-50 border-y border-indigo-100/50' : ''
                              }`}
                            >
                              <div className="flex items-center gap-4 min-w-0">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                                  isFolder 
                                    ? 'bg-blue-50 border-blue-100 text-blue-500 fill-blue-50' 
                                    : 'bg-rose-50 border-rose-100 text-rose-500'
                                }`}>
                                  {isFolder ? <Folder size={18} /> : <File size={18} />}
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-sm font-bold truncate transition-colors ${
                                    isFolder ? 'text-gray-900 group-hover:text-blue-600' : 'text-gray-800 group-hover:text-rose-600'
                                  }`}>
                                    {item.name}
                                  </p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    {isFolder ? 'Subpasta de Arquivos' : `${(item.size / 1024 / 1024).toFixed(2)} MB • PDF Documento`}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                {!isFolder && (
                                  <a 
                                    href={item.webUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent shadow-sm hover:border-gray-100"
                                    title="Visualizar no Navegador"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                )}
                                {isFolder && <ChevronRight size={16} className="text-gray-300" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: Map & Association Widget */}
                <div className="space-y-6">
                  <AnimatePresence mode="wait">
                    {!selectedFile ? (
                      <motion.div 
                        key="no-selection"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-indigo-900 text-white p-8 rounded-3xl border border-indigo-950 flex flex-col justify-center min-h-[400px] shadow-lg relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
                        <Info className="text-indigo-300 mb-6" size={32} />
                        <h3 className="text-xl font-bold tracking-tight mb-2">Instruções de Vinculação</h3>
                        <p className="text-indigo-100 text-xs leading-relaxed mb-6">
                          Selecione qualquer arquivo PDF de prestação de contas no painel esquerdo para mapeá-lo e vinculá-lo a uma secretaria e departamento do GestiPrev.
                        </p>
                        <div className="space-y-3 text-indigo-200 font-bold text-[10px] uppercase tracking-widest">
                          <p className="flex items-center gap-2">✔ 1. Navegue pelas pastas</p>
                          <p className="flex items-center gap-2">✔ 2. Selecione o PDF correspondente</p>
                          <p className="flex items-center gap-2">✔ 3. Preencha os dados no formulário</p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="with-selection"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[8px] font-black bg-rose-50 border border-rose-100 text-rose-600 px-2 py-1 rounded-md uppercase tracking-wider">
                              PDF Selecionado
                            </span>
                            <button onClick={() => setSelectedFile(null)} className="text-xs text-gray-400 hover:text-black">
                              Cancelar
                            </button>
                          </div>
                          <h3 className="text-sm font-black text-gray-900 break-words leading-tight">{selectedFile.name}</h3>
                          <p className="text-xs text-gray-400 mt-1">Localizado em OneDrive / {currentFolder?.name || 'Raiz'}</p>
                        </div>

                        <hr className="border-gray-100" />

                        {/* Mapping Form */}
                        <div className="space-y-4 text-left">
                          <div>
                            <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                              1. Secretaria Destinatária
                            </label>
                            <select 
                              className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl font-bold text-gray-800 text-xs focus:ring-2 focus:ring-indigo-500"
                              value={formSecretariaId}
                              onChange={(e) => {
                                setFormSecretariaId(e.target.value);
                                setFormDepartamentoId(''); // Clear dept selector on hierarchy change
                              }}
                            >
                              <option value="">-- SELECIONE A SECRETARIA --</option>
                              {secretarias.map(sec => (
                                <option key={sec.id} value={sec.id}>{sec.nome} ({sec.sigla})</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                              2. Departamento Vinculado
                            </label>
                            <select 
                              disabled={!formSecretariaId}
                              className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl font-bold text-gray-800 text-xs focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                              value={formDepartamentoId}
                              onChange={(e) => setFormDepartamentoId(e.target.value)}
                            >
                              <option value="">-- SELECIONE O DEPARTAMENTO --</option>
                              {filteredDepartments.map(dep => (
                                <option key={dep.id} value={dep.id}>{dep.nome}</option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                                3. Regime Tributário
                              </label>
                              <select 
                                className="w-full px-3 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-800 text-xs focus:ring-2 focus:ring-indigo-500"
                                value={formTipo}
                                onChange={(e) => setFormTipo(e.target.value as any)}
                              >
                                <option value="patronal">Patronal</option>
                                <option value="segurado">Segurado</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                                4. Destino Visual
                              </label>
                              <select 
                                className="w-full px-3 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-800 text-xs focus:ring-2 focus:ring-indigo-500"
                                value={formTarget}
                                onChange={(e) => setFormTarget(e.target.value as any)}
                              >
                                <option value="guia">Guia Principal</option>
                                <option value="comprovante">Comprovante</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                                Mês Referência
                              </label>
                              <select 
                                className="w-full px-3 py-2.5 bg-gray-50 border-none rounded-xl font-bold text-gray-800 text-xs"
                                value={formMes}
                                onChange={(e) => setFormMes(parseInt(e.target.value))}
                              >
                                {Array.from({length: 12}).map((_, i) => (
                                  <option key={i+1} value={i+1}>
                                    {new Date(2026, i).toLocaleString('pt-BR', { month: 'long' })}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                                Ano Fiscal
                              </label>
                              <input 
                                type="number"
                                className="w-full px-3 py-2 bg-gray-50 border-none rounded-xl font-bold text-gray-800 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                                value={formAno}
                                onChange={e => setFormAno(parseInt(e.target.value) || new Date().getFullYear())}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                              Código de Identificação GRCP (Opcional)
                            </label>
                            <input 
                              type="text"
                              placeholder="Ex: GRCP-X-2026"
                              className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl text-gray-800 font-bold text-xs focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                              value={formGrcp}
                              onChange={e => setFormGrcp(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="block text-[8px] mb-1.5 font-bold text-gray-400 uppercase tracking-widest">
                              Valor Financeiro (Opcional)
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">R$</span>
                              <input 
                                type="number"
                                step="0.01"
                                placeholder="0,00"
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border-none rounded-xl text-gray-800 font-black text-xs focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                                value={formValor}
                                onChange={e => setFormValor(e.target.value)}
                              />
                            </div>
                          </div>

                          <button 
                            onClick={handleConfirmLinkage}
                            disabled={linkingInProgress}
                            className="w-full py-4 mt-4 bg-black text-white hover:bg-gray-800 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xl shadow-black/10 flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {linkingInProgress ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Vinculando...
                              </>
                            ) : (
                              <>
                                <LinkIcon size={16} />
                                CONFIRMAR VINCULAÇÃO FISCAL
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              /* Linked Items Dashboard Tab (#2 of request) */
              <motion.div 
                key="linked-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="p-6 border-b border-gray-50 bg-gray-50/10 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-gray-950 uppercase tracking-tight">Obrigações Ativas Vincluladas ao OneDrive</h4>
                    <p className="text-xs text-gray-400 mt-0.5">Relação de arquivos hospedados na nuvem e mapeados aos caixas municipais</p>
                  </div>
                  <button 
                    onClick={loadSystemData}
                    className="p-2 border rounded-xl hover:bg-gray-50 text-gray-500 hover:text-black font-bold tracking-widest text-[9px] uppercase transition-all"
                  >
                    Recarregar Base
                  </button>
                </div>

                <div className="overflow-x-auto">
                  {allLinkedGuias.filter(g => g.urlGuia || g.urlComprovante).length === 0 ? (
                    <div className="p-20 text-center text-gray-400">
                      <Layers className="w-12 h-12 stroke-[1.5px] text-gray-200 mx-auto mb-4" />
                      <p className="font-bold text-gray-800 text-sm">Não há vínculos ativos cadastrados.</p>
                      <p className="text-xs text-gray-400 mt-1">Arraste ou mapeie arquivos do OneDrive no Painel anterior para vê-los aqui.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/55 border-b border-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                          <th className="py-4 px-6">Secretaria / Depto</th>
                          <th className="py-4 px-6 text-center">Referência</th>
                          <th className="py-4 px-6">Identificação</th>
                          <th className="py-4 px-6 text-center">Tipo</th>
                          <th className="py-4 px-6">Guia Principal</th>
                          <th className="py-4 px-6">Comprovante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {allLinkedGuias.filter(g => g.urlGuia || g.urlComprovante).map((guia) => {
                          const dept = departamentos.find(d => d.id === guia.departamentoId);
                          const sec = secretarias.find(s => s.id === dept?.secretariaId);
                          const monthName = new Date(2026, guia.mes - 1).toLocaleString('pt-BR', { month: 'long' });

                          return (
                            <tr key={guia.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-4 px-6">
                                <p className="text-xs font-black text-gray-900">{dept?.nome || 'Depto Desconhecido'}</p>
                                <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-1">
                                  {sec?.nome} ({sec?.sigla})
                                </p>
                              </td>
                              <td className="py-4 px-6 text-center whitespace-nowrap">
                                <span className="bg-slate-100 text-xs font-bold text-slate-800 px-3 py-1.5 rounded-xl uppercase">
                                  {monthName} / {guia.ano}
                                </span>
                              </td>
                              <td className="py-4 px-6 font-mono text-xs text-slate-500">
                                {guia.identificacaoGrcp || 'N/D'}
                              </td>
                              <td className="py-4 px-6 text-center">
                                <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border ${
                                  guia.tipo === 'patronal' 
                                    ? 'bg-blue-50 text-blue-600 border-blue-100' 
                                    : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                }`}>
                                  {guia.tipo}
                                </span>
                              </td>
                              
                              {/* Guia Column */}
                              <td className="py-4 px-6">
                                {guia.urlGuia ? (
                                  <div className="flex items-center gap-2">
                                    <a 
                                      href={guia.urlGuia}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 border hover:border-black rounded-lg transition-all text-xs font-semibold hover:bg-white flex items-center gap-1 leading-none shadow-sm"
                                    >
                                      <Eye size={12} />
                                      Visualizar
                                    </a>
                                    <button 
                                      onClick={() => handleRemoveLinkFromGuia(guia.id, 'guia')}
                                      title="Desvincular"
                                      className="p-1.5 text-gray-300 hover:text-red-600 rounded-lg hover:bg-rose-50"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-300 font-bold">NÃO ATRIBUÍDA</span>
                                )}
                              </td>

                              {/* Comprovante Column */}
                              <td className="py-4 px-6">
                                {guia.urlComprovante ? (
                                  <div className="flex items-center gap-2">
                                    <a 
                                      href={guia.urlComprovante}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 border hover:border-black rounded-lg transition-all text-xs font-semibold hover:bg-white flex items-center gap-1 leading-none shadow-sm text-emerald-700 hover:text-black border-emerald-100 bg-emerald-50/20"
                                    >
                                      <Eye size={12} />
                                      Visualizar
                                    </a>
                                    <button 
                                      onClick={() => handleRemoveLinkFromGuia(guia.id, 'comprovante')}
                                      title="Desvincular"
                                      className="p-1.5 text-gray-300 hover:text-red-600 rounded-lg hover:bg-rose-50"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-300 font-bold">PENDENTE</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Confirmation and info popup modaldialogs */}
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
