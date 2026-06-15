import React, { useState, useEffect, useRef } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { uploadFile } from "../lib/storage";
import { Departamento, Guia, Secretaria } from "../types";
import {
  FileText,
  CheckCircle,
  Clock,
  Search,
  ArrowLeft,
  Download,
  Eye,
  Calendar,
  Table as TableIcon,
  Filter,
  LayoutGrid,
  FileSearch,
  Plus,
  UploadCloud,
  X,
  Minus,
  RotateCcw,
  Cloud,
  Folder,
  File,
  Link as LinkIcon,
  Layers,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ModalConfirmacao from "./ModalConfirmacao";
import { onedriveService, DriveItem, extractOneDriveItemId } from "../services/onedriveService";
import OneDriveExplorer from "./OneDriveExplorer";

// Helper functions for BRL currency formatting and parsing
const parseBRLToFloat = (value: string | number | undefined | null): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
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
    valorPago:
      g.valorPago !== undefined ? normalizeValue(g.valorPago) : undefined,
  };
};

const formatBRL = (value: number | string | undefined | null): string => {
  if (value === undefined || value === null) return "0,00";
  let numValue = typeof value === "string" ? parseBRLToFloat(value) : value;
  numValue = normalizeValue(numValue);
  return numValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const handleBRLChange = (valStr: string): string => {
  const cleanValue = valStr.replace(/\D/g, "");
  const num = cleanValue ? parseFloat(cleanValue) / 100 : 0;
  return formatBRL(num);
};

interface ConsolidatedTableProps {
  secretariaId: string;
  onBack: () => void;
}

export default function RelatorioConsolidado({
  secretariaId,
  onBack,
}: ConsolidatedTableProps) {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [secretaria, setSecretaria] = useState<Secretaria | null>(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => {
    const saved = sessionStorage.getItem("trabalho_mes");
    return saved ? parseInt(saved) : (new Date().getMonth() + 1);
  });
  const [ano, setAno] = useState(() => {
    const saved = sessionStorage.getItem("trabalho_ano");
    return saved ? parseInt(saved) : new Date().getFullYear();
  });

  useEffect(() => {
    sessionStorage.setItem("trabalho_mes", mes.toString());
  }, [mes]);

  useEffect(() => {
    sessionStorage.setItem("trabalho_ano", ano.toString());
  }, [ano]);

  const [tempValues, setTempValues] = useState<Record<string, string>>({});
  const [activeRegime, setActiveRegime] = useState<
    "capitalizado" | "financeiro"
  >("capitalizado");

  // OneDrive connection and selection states
  const [onedriveConnected, setOnedriveConnected] = useState<boolean>(false);
  const [onedriveUser, setOnedriveUser] = useState<any>(null);
  const [linkContext, setLinkContext] = useState<{
    deptId: string;
    deptNome: string;
    tipo: "patronal" | "segurado";
    target: "guia" | "comprovante";
  } | null>(null);

  // OneDrive file mapping form state
  const [selectedOdFile, setSelectedOdFile] = useState<DriveItem | null>(null);
  const [odFormValor, setOdFormValor] = useState<string>("");
  const [odFormGrcp, setOdFormGrcp] = useState<string>("");
  const [linkingOdInProgress, setLinkingOdInProgress] =
    useState<boolean>(false);
  const [odExtracting, setOdExtracting] = useState<boolean>(false);
  const [linkMode, setLinkMode] = useState<"onedrive" | "local">("onedrive");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadContext, setUploadContext] = useState<{
    deptId: string;
    tipo: "patronal" | "segurado";
    target: "guia" | "comprovante";
  } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    valor: 0,
    identificacaoGrcp: "",
  });
  const [modalValorStr, setModalValorStr] = useState("");
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isExtractingAi, setIsExtractingAi] = useState(false);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    type: "danger" | "warning" | "success" | "info";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: () => {},
  });

  const showAlert = (
    title: string,
    message: string,
    type: "success" | "danger" | "info" | "warning" = "info",
  ) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      confirmText: "OK",
      type: type,
      onConfirm: () => {},
    });
  };

  const askConfirmation = (
    title: string,
    message: string,
    type: "danger" | "warning",
    onConfirm: () => void,
  ) => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      confirmText: "Confirmar",
      type,
      onConfirm,
    });
  };

  const checkOneDriveStatus = async () => {
    try {
      const u = await onedriveService.getUser();
      setOnedriveConnected(!!u);
      setOnedriveUser(u);
    } catch {
      setOnedriveConnected(false);
    }
  };

  const handleConnectOneDriveInRelatorio = async () => {
    try {
      const url = await onedriveService.getAuthUrl();
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = url;
        return;
      }

      const width = 600,
        height = 700;
      const left = window.innerWidth / 2 - width / 2;
      const top = window.innerHeight / 2 - height / 2;

      const popup = window.open(
        url,
        "onedrive_auth",
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      if (!popup || popup.closed || typeof popup.closed === "undefined") {
        window.location.href = url;
        return;
      }

      const handleAuthMessage = async (event: MessageEvent) => {
        if (event.data?.type === "ONEDRIVE_AUTH_SUCCESS") {
          const { token, refreshToken } = event.data;
          if (token) localStorage.setItem("onedrive_token", token);
          if (refreshToken)
            localStorage.setItem("onedrive_refresh_token", refreshToken);

          await checkOneDriveStatus();
          showAlert(
            "Conectado!",
            "OneDrive integrado com sucesso nesta sessão.",
            "success",
          );
          window.removeEventListener("message", handleAuthMessage);
        }
      };

      window.addEventListener("message", handleAuthMessage);
    } catch (err: any) {
      showAlert(
        "Erro",
        err.message || "Erro para abrir canal de autenticação do OneDrive.",
        "danger",
      );
    }
  };

  const handleConfirmOneDriveLink = async () => {
    if (!selectedOdFile || !linkContext) return;
    setLinkingOdInProgress(true);
    try {
      const { deptId, tipo, target } = linkContext;
      let guia = guias.find(
        (g) =>
          g.departamentoId === deptId &&
          g.tipo === tipo &&
          (g.regime || "capitalizado") === activeRegime,
      );
      const urlFieldName = target === "guia" ? "urlGuia" : "urlComprovante";
      const idFieldName = target === "guia" ? "onedriveGuiaId" : "onedriveComprovanteId";
      const valorNum = parseBRLToFloat(odFormValor);

      // Obter link de compartilhamento seguro para evitar navegação para pastas superiores no OneDrive
      let fileUrl = selectedOdFile.webUrl;
      try {
        const shareLink = await onedriveService.createShareLink(selectedOdFile.id);
        if (shareLink) fileUrl = shareLink;
      } catch (shareErr) {
        console.warn("Não foi possível gerar link seguro para OneDrive:", shareErr);
      }

      const payload: any = {
        [urlFieldName]: fileUrl,
        [idFieldName]: selectedOdFile.id, // ID definitivo do item OneDrive
        identificacaoGrcp:
          odFormGrcp || `ONEDRIVE-${Date.now().toString().slice(-6)}`,
        updatedAt: serverTimestamp(),
      };

      if (target === "guia") {
        if (valorNum > 0) payload.valor = valorNum;
      } else {
        // target is comprovante
        payload.status = "pago";
        if (valorNum > 0) payload.valorPago = valorNum;
      }

      if (guia) {
        await updateDoc(doc(db, "guias", guia.id), payload);
      } else {
        const newDoc = {
          departamentoId: deptId,
          tipo: tipo,
          mes: mes,
          ano: ano,
          regime: activeRegime,
          nome: selectedOdFile.name.split(".")[0],
          valor: target === "guia" ? valorNum : 0,
          valorPago: target === "comprovante" ? valorNum : 0,
          status: target === "comprovante" ? "pago" : "pendente",
          identificacaoGrcp: odFormGrcp || `GRCP-OD-${Date.now()}`,
          vencimento: new Date(ano, mes, 0).toISOString().split("T")[0],
          [urlFieldName]: fileUrl,
          [idFieldName]: selectedOdFile.id, // ID definitivo do item OneDrive
          createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, "guias"), newDoc);
      }

      showAlert(
        "Sucesso",
        "Arquivo do OneDrive vinculado com sucesso!",
        "success",
      );
      await fetchData(); // Reload grid!
      setLinkContext(null); // Close modal!
      setSelectedOdFile(null);
    } catch (err: any) {
      console.error(err);
      showAlert("Erro", "Falha ao registrar vínculo do OneDrive.", "danger");
    } finally {
      setLinkingOdInProgress(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const secSnap = await getDocs(collection(db, "secretarias"));
      const sec = secSnap.docs.find((d) => d.id === secretariaId);
      if (sec) setSecretaria({ id: sec.id, ...sec.data() } as Secretaria);

      const deptSnap = await getDocs(
        query(
          collection(db, "departamentos"),
          where("secretariaId", "==", secretariaId),
          orderBy("nome", "asc"),
        ),
      );
      const depts = deptSnap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as Departamento,
      );
      setDepartamentos(depts);

      const guiasSnap = await getDocs(
        query(
          collection(db, "guias"),
          where("mes", "==", mes),
          where("ano", "==", ano),
        ),
      );
      setGuias(
        guiasSnap.docs.map((doc) =>
          normalizeGuia({ id: doc.id, ...doc.data() }),
        ),
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    checkOneDriveStatus();
  }, [secretariaId, mes, ano]);

  const handleInlineUpdate = async (
    guiaId: string,
    field: string,
    value: any,
  ) => {
    try {
      await updateDoc(doc(db, "guias", guiaId), { [field]: value });
      setGuias((prev) =>
        prev.map((g) =>
          g.id === guiaId ? normalizeGuia({ ...g, [field]: value }) : g,
        ),
      );
    } catch (error) {
      console.error(error);
    }
  };

  const triggerUpload = (
    deptId: string,
    tipo: "patronal" | "segurado",
    target: "guia" | "comprovante",
  ) => {
    setUploadContext({ deptId, tipo, target });
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadContext) return;

    // Em vez de subir direto, abre o modal de preenchimento
    const existingGuia = guias.find(
      (g) =>
        g.departamentoId === uploadContext.deptId &&
        g.tipo === uploadContext.tipo &&
        (g.regime || "capitalizado") === activeRegime,
    );
    const initialVal =
      uploadContext.target === "guia"
        ? existingGuia?.valor || 0
        : existingGuia?.valorPago || existingGuia?.valor || 0;
    setPendingFile(file);
    setUploadForm({
      valor: initialVal,
      identificacaoGrcp: existingGuia?.identificacaoGrcp || "",
    });
    setModalValorStr(formatBRL(initialVal));
    setIsFormModalOpen(true);

    // AI extração em background
    const runAiExtraction = async () => {
      setIsExtractingAi(true);
      try {
        const fileToBase64 = (f: File): Promise<string> => {
          return new Promise((resolve) => {
            const r = new FileReader();
            r.readAsDataURL(f);
            r.onload = () => resolve((r.result as string).split(',')[1]);
          });
        };
        const base64Str = await fileToBase64(file);
        const res = await fetch("/api/gemini/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64Data: base64Str,
            mimeType: file.type || "application/pdf",
            filename: file.name,
            type: uploadContext.target
          })
        });
        if (res.ok) {
          const result = await res.json();
          const cleanCode = result.identificacaoGrcp 
            ? result.identificacaoGrcp.replace(/\s+/g, '').toUpperCase() 
            : "";
          const extractedValue = uploadContext.target === "guia" 
            ? (result.valor || 0) 
            : (result.valorPago || 0);

          setUploadForm({
            valor: extractedValue,
            identificacaoGrcp: cleanCode || result.identificacaoGrcp || "",
          });
          setModalValorStr(formatBRL(extractedValue));
        }
      } catch (err) {
        console.error("Erro extração AI background no consolidado:", err);
      } finally {
        setIsExtractingAi(false);
      }
    };
    runAiExtraction();
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !uploadContext) return;
    setIsFormModalOpen(false);

    try {
      setLoading(true);

      // Upload para Firebase Storage
      const downloadUrl = await uploadFile(pendingFile, "guias");

      let guia = guias.find(
        (g) =>
          g.departamentoId === uploadContext.deptId &&
          g.tipo === uploadContext.tipo &&
          (g.regime || "capitalizado") === activeRegime,
      );
      const urlFieldName =
        uploadContext.target === "guia" ? "urlGuia" : "urlComprovante";

      const payload: any = {
        [urlFieldName]: downloadUrl,
        identificacaoGrcp: uploadForm.identificacaoGrcp,
        updatedAt: serverTimestamp(),
      };

      if (uploadContext.target === "guia") {
        payload.valor = uploadForm.valor;
      } else {
        payload.status = "pago";
        payload.valorPago = uploadForm.valor;
      }

      if (guia) {
        await updateDoc(doc(db, "guias", guia.id), payload);
        setGuias((prev) =>
          prev.map((g) =>
            g.id === guia!.id ? normalizeGuia({ ...g, ...payload }) : g,
          ),
        );
      } else {
        const newDoc = {
          departamentoId: uploadContext.deptId,
          tipo: uploadContext.tipo,
          mes: mes,
          ano: ano,
          regime: activeRegime,
          nome: pendingFile.name.split(".")[0],
          valor: uploadContext.target === "guia" ? uploadForm.valor : 0,
          valorPago:
            uploadContext.target === "comprovante" ? uploadForm.valor : 0,
          status: uploadContext.target === "comprovante" ? "pago" : "pendente",
          identificacaoGrcp:
            uploadForm.identificacaoGrcp || `GRCP-${Date.now()}`,
          vencimento: new Date(ano, mes, 0).toISOString().split("T")[0],
          ...payload,
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, "guias"), newDoc);
        setGuias((prev) => [
          ...prev,
          normalizeGuia({ id: docRef.id, ...newDoc }),
        ]);
      }
      showAlert("Sucesso", "Documento enviado e salvo com sucesso!", "success");
    } catch (error: any) {
      console.error("Erro no upload:", error);
      let msg = "Falha ao enviar arquivo para o armazenamento.";

      // Diagnóstico detalhado para o usuário
      if (
        error.message?.includes("Firebase") ||
        error.code?.includes("storage")
      ) {
        msg = `Erro no Armazenamento: ${error.message}.`;
      } else if (
        error.code === "storage/unauthorized" ||
        error.message?.includes("CORS")
      ) {
        msg =
          "Erro de Permissão ou CORS. Verifique as configurações do Storage no console.";
      }

      // Pequeno delay para evitar conflito de canal de mensagem no ambiente AI Studio
      setTimeout(() => {
        showAlert("Erro", msg, "danger");
      }, 100);
    } finally {
      setLoading(false);
      setUploadContext(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteGuia = (guiaId: string) => {
    askConfirmation(
      "Remover Registro",
      "Deseja realmente remover este arquivo e seus dados?",
      "danger",
      async () => {
        try {
          await deleteDoc(doc(db, "guias", guiaId));
          setGuias((prev) => prev.filter((g) => g.id !== guiaId));
          showAlert("Sucesso", "Registro removido.", "success");
        } catch (error) {
          console.error(error);
        }
      },
    );
  };

  const getGuiaForDept = (deptId: string, tipo: "patronal" | "segurado") => {
    return guias.find(
      (g) =>
        g.departamentoId === deptId &&
        g.tipo === tipo &&
        (g.regime || "capitalizado") === activeRegime,
    );
  };

  const openDocument = async (url: string | undefined, docId?: string, isGuia?: boolean, onedriveId?: string) => {
    if (!url || url === "manual") {
      showAlert(
        "Documento não encontrado",
        "Este registro não possui um arquivo PDF anexo para visualização.",
        "info",
      );
      return;
    }

    let targetUrl = url;
    try {
      const resolvedUrl = await onedriveService.getDownloadUrl(url, onedriveId);
      if (resolvedUrl) {
        targetUrl = resolvedUrl;
      }
    } catch (e) {
      console.warn("Falha ao obter URL limpa de download do OneDrive:", e);
    }

    // Preparar URL para visualização
    console.log("[Visualização] Abrindo URL do documento:", targetUrl);

    // Tentar abrir em nova aba de forma sincronizada e instantânea (evita bloqueadores de popup)
    const win = window.open(targetUrl, "_blank");
    if (!win) {
      const link = document.createElement("a");
      link.href = targetUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const downloadDocument = (url: string | undefined, filename: string) => {
    if (!url) return;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert("Download", "Iniciando download...", "success");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header Estilizado - Estilo SOCIAL */}
      <div className="bg-white px-12 py-10 shadow-sm border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:justify-between md:items-center gap-8">
          <div>
            <div className="flex items-center gap-2 text-gray-400 font-bold text-[9px] uppercase tracking-widest mb-2">
              <button
                onClick={onBack}
                className="hover:text-black flex items-center gap-1 transition-colors"
              >
                Início
              </button>
              <span>/</span>
              <span className="text-gray-600">Secretarias</span>
            </div>
            <h1 className="text-2xl font-black italic tracking-tighter text-gray-900 leading-none">
              {secretaria?.nome || "SOCIAL"}
            </h1>
            <p className="flex items-center gap-2 mt-2 text-gray-400 font-black text-[8px] uppercase tracking-[0.2em]">
              <RotateCcw className="w-3 h-3 text-gray-200" /> Relatório
              Consolidado de Previdência
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-white p-3 px-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-6">
              <div className="text-right">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                  MÊS
                </p>
                <select
                  className="appearance-none bg-transparent border-none p-0 font-black text-gray-900 text-sm focus:ring-0 uppercase cursor-pointer min-w-[80px]"
                  value={mes}
                  onChange={(e) => setMes(parseInt(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2024, m - 1).toLocaleString("pt-BR", {
                        month: "long",
                      })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-[1px] h-8 bg-gray-200" />
              <div className="text-right">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                  ANO
                </p>
                <input
                  type="number"
                  className="bg-transparent border-none p-0 font-black text-gray-900 text-sm focus:ring-0 w-16 text-right"
                  value={ano}
                  onChange={(e) => setAno(parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-[1600px] mx-auto">
        {/* Regime Selection Switcher */}
        <div className="flex gap-1.5 mb-6 bg-white p-1.5 rounded-2xl w-fit border border-gray-200 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveRegime("capitalizado")}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeRegime === "capitalizado"
                ? "bg-gray-900 text-white shadow-md"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
          >
            Capitalizado
          </button>
          <button
            type="button"
            onClick={() => setActiveRegime("financeiro")}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeRegime === "financeiro"
                ? "bg-gray-900 text-white shadow-md"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
          >
            Financeiro
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-md border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] text-center border-b border-gray-200">
                <th className="py-5 px-6 text-left border-r border-gray-200 w-[240px]">
                  DEPTO
                </th>
                <th
                  colSpan={4}
                  className="py-5 border-r border-gray-200 text-blue-700 bg-blue-50/30"
                >
                  PATRONAL
                </th>
                <th
                  colSpan={4}
                  className="py-5 text-emerald-700 bg-emerald-50/30"
                >
                  SEGURADOS
                </th>
              </tr>
              <tr className="text-[9px] font-black text-gray-500 uppercase tracking-widest text-left border-b border-gray-200">
                <th className="py-3 px-6 border-r border-gray-200 w-[240px]">
                  DEPARTAMENTO
                </th>

                <th className="py-3 px-4 whitespace-nowrap min-w-[140px]">
                  ID GRCP
                </th>
                <th className="py-3 px-4 min-w-[100px]">VALOR</th>
                <th className="py-3 px-4 text-center">GUIA</th>
                <th className="py-3 px-4 text-center border-r border-gray-200">
                  COMPROVANTE
                </th>

                <th className="py-3 px-4 whitespace-nowrap min-w-[140px]">
                  ID GRCP
                </th>
                <th className="py-3 px-4 min-w-[100px]">VALOR</th>
                <th className="py-3 px-4 text-center">GUIA</th>
                <th className="py-3 px-4 text-center">COMPROVANTE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td className="py-4 px-6 border-r border-gray-100 max-w-[240px] space-y-2">
                      <div className="h-4 w-40 bg-gray-200/80 rounded-md" />
                    </td>
                    {/* Patronal */}
                    <td className="p-3 px-4">
                      <div className="h-3.5 w-24 bg-gray-200/50 rounded" />
                    </td>
                    <td className="p-3 px-4">
                      <div className="h-3.5 w-16 bg-gray-200/60 rounded" />
                    </td>
                    <td className="p-3 text-center">
                      <div className="inline-flex gap-1 justify-center">
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                      </div>
                    </td>
                    <td className="p-3 text-center border-r border-gray-100">
                      <div className="inline-flex gap-1 justify-center">
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                      </div>
                    </td>
                    {/* Segurados */}
                    <td className="p-3 px-4">
                      <div className="h-3.5 w-24 bg-gray-200/50 rounded" />
                    </td>
                    <td className="p-3 px-4">
                      <div className="h-3.5 w-16 bg-gray-200/60 rounded" />
                    </td>
                    <td className="p-3 text-center">
                      <div className="inline-flex gap-1 justify-center">
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="inline-flex gap-1 justify-center">
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                departamentos.map((dept) => {
                  const patData = getGuiaForDept(dept.id, "patronal");
                  const segData = getGuiaForDept(dept.id, "segurado");

                  return (
                    <tr
                      key={dept.id}
                      className="hover:bg-gray-50 transition-colors group"
                    >
                      <td className="py-3 px-6 border-r border-gray-200 max-w-[240px]">
                        <p className="font-black text-gray-900 text-[10px] tracking-tight leading-normal whitespace-normal break-words">
                          {dept.nome}
                        </p>
                      </td>

                      {/* PATRONAL SECTION */}
                      <td className="p-2 px-4 min-w-[140px]">
                        <div className="min-h-[1.5rem] flex items-center">
                          {patData ? (
                            <input
                              type="text"
                              className="bg-transparent border-none p-0 text-[10px] font-bold text-gray-600 w-full focus:ring-0 outline-none leading-tight"
                              value={patData.identificacaoGrcp || ""}
                              onChange={(e) =>
                                handleInlineUpdate(
                                  patData.id,
                                  "identificacaoGrcp",
                                  e.target.value,
                                )
                              }
                            />
                          ) : (
                            <span className="text-gray-200 text-[8px]">
                              ---
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 px-4 min-w-[100px]">
                        {patData ? (
                          <div className="flex items-center gap-0.5">
                            <span className="font-black text-gray-900 text-[10px]">
                              R$
                            </span>
                            <input
                              type="text"
                              className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px]"
                              value={
                                tempValues[patData.id] !== undefined
                                  ? tempValues[patData.id]
                                  : formatBRL(patData.valor)
                              }
                              onFocus={() => {
                                setTempValues((prev) => ({
                                  ...prev,
                                  [patData.id]: formatBRL(patData.valor),
                                }));
                              }}
                              onChange={(e) => {
                                const typed = e.target.value;
                                setTempValues((prev) => ({
                                  ...prev,
                                  [patData.id]: typed,
                                }));
                                handleInlineUpdate(
                                  patData.id,
                                  "valor",
                                  parseBRLToFloat(typed),
                                );
                              }}
                              onBlur={() => {
                                setTempValues((prev) => {
                                  const next = { ...prev };
                                  delete next[patData.id];
                                  return next;
                                });
                              }}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-200 text-[8px]">---</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {patData?.urlGuia ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openDocument(patData.urlGuia, patData.id, true, patData.onedriveGuiaId)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
                                patData.urlGuia?.includes("firebasestorage")
                                  ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                  : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                              }`}
                              title={
                                patData.urlGuia?.includes("firebasestorage")
                                  ? "Visualizar Guia Local"
                                  : "Visualizar Guia no OneDrive"
                              }
                            >
                              {patData.urlGuia?.includes("firebasestorage") ? (
                                <FileText className="w-4 h-4" />
                              ) : (
                                <Cloud className="w-4 h-4 text-indigo-500" />
                              )}
                            </button>
                            <button
                              onClick={() =>
                                downloadDocument(
                                  patData.urlGuia,
                                  `guia-patronal-${dept.nome}.pdf`,
                                )
                              }
                              className="w-8 h-8 bg-gray-50 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all border border-gray-200"
                              title="Baixar"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteGuia(patData.id)}
                              className="w-5 h-5 text-rose-300 hover:text-rose-600 transition-colors"
                              title="Deletar Lançamento"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setLinkContext({
                                deptId: dept.id,
                                deptNome: dept.nome,
                                tipo: "patronal",
                                target: "guia",
                              })
                            }
                            className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all mx-auto border border-dashed border-gray-200"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-center border-r border-gray-200">
                        {patData?.urlComprovante ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openDocument(patData.urlComprovante, patData.id, false, patData.onedriveComprovanteId)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border shadow-sm ${
                                patData.urlComprovante?.includes(
                                  "firebasestorage",
                                )
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                              }`}
                              title={
                                patData.urlComprovante?.includes(
                                  "firebasestorage",
                                )
                                  ? "Visualizar Comprovante Local"
                                  : "Visualizar Comprovante no OneDrive"
                              }
                            >
                              {patData.urlComprovante?.includes(
                                "firebasestorage",
                              ) ? (
                                <CheckCircle className="w-4.5 h-4.5" />
                              ) : (
                                <Cloud className="w-4 h-4 text-indigo-500" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                askConfirmation(
                                  "Remover Comprovante",
                                  "Deseja realmente remover o comprovante de pagamento deste registro?",
                                  "danger",
                                  async () => {
                                    try {
                                      await updateDoc(
                                        doc(db, "guias", patData.id),
                                        {
                                          urlComprovante: null,
                                          status: "pendente",
                                        },
                                      );
                                      setGuias((prev) =>
                                        prev.map((g) =>
                                          g.id === patData.id
                                            ? {
                                                ...g,
                                                urlComprovante: null,
                                                status: "pendente",
                                              }
                                            : g,
                                        ),
                                      );
                                      showAlert(
                                        "Desvinculado",
                                        "Arquivo do comprovante de pagamento desassociado.",
                                        "success",
                                      );
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  },
                                );
                              }}
                              className="w-5 h-5 text-gray-300 hover:text-rose-600 transition-colors"
                              title="Desvincular Comprovante"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setLinkContext({
                                deptId: dept.id,
                                deptNome: dept.nome,
                                tipo: "patronal",
                                target: "comprovante",
                              })
                            }
                            className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all mx-auto border border-dashed border-gray-200"
                          >
                            <Plus className="w-3.5 h-3.5" />
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
                              value={segData.identificacaoGrcp || ""}
                              onChange={(e) =>
                                handleInlineUpdate(
                                  segData.id,
                                  "identificacaoGrcp",
                                  e.target.value,
                                )
                              }
                            />
                          ) : (
                            <span className="text-gray-200 text-[8px]">
                              ---
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 px-4 min-w-[100px]">
                        {segData ? (
                          <div className="flex items-center gap-0.5">
                            <span className="font-black text-gray-900 text-[10px]">
                              R$
                            </span>
                            <input
                              type="text"
                              className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px]"
                              value={
                                tempValues[segData.id] !== undefined
                                  ? tempValues[segData.id]
                                  : formatBRL(segData.valor)
                              }
                              onFocus={() => {
                                setTempValues((prev) => ({
                                  ...prev,
                                  [segData.id]: formatBRL(segData.valor),
                                }));
                              }}
                              onChange={(e) => {
                                const typed = e.target.value;
                                setTempValues((prev) => ({
                                  ...prev,
                                  [segData.id]: typed,
                                }));
                                handleInlineUpdate(
                                  segData.id,
                                  "valor",
                                  parseBRLToFloat(typed),
                                );
                              }}
                              onBlur={() => {
                                setTempValues((prev) => {
                                  const next = { ...prev };
                                  delete next[segData.id];
                                  return next;
                                });
                              }}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-200 text-[8px]">---</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {segData?.urlGuia ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openDocument(segData.urlGuia, segData.id, true, segData.onedriveGuiaId)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
                                segData.urlGuia?.includes("firebasestorage")
                                  ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                  : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                              }`}
                              title={
                                segData.urlGuia?.includes("firebasestorage")
                                  ? "Visualizar Guia Local"
                                  : "Visualizar Guia no OneDrive"
                              }
                            >
                              {segData.urlGuia?.includes("firebasestorage") ? (
                                <FileText className="w-4 h-4" />
                              ) : (
                                <Cloud className="w-4 h-4 text-indigo-500" />
                              )}
                            </button>
                            <button
                              onClick={() =>
                                downloadDocument(
                                  segData.urlGuia,
                                  `guia-segurado-${dept.nome}.pdf`,
                                )
                              }
                              className="w-8 h-8 bg-gray-50 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all border border-gray-200"
                              title="Baixar"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteGuia(segData.id)}
                              className="w-5 h-5 text-rose-300 hover:text-rose-600 transition-colors"
                              title="Deletar Lançamento"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setLinkContext({
                                deptId: dept.id,
                                deptNome: dept.nome,
                                tipo: "segurado",
                                target: "guia",
                              })
                            }
                            className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all mx-auto border border-dashed border-gray-200"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {segData?.urlComprovante ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openDocument(segData.urlComprovante, segData.id, false, segData.onedriveComprovanteId)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border shadow-sm ${
                                segData.urlComprovante?.includes(
                                  "firebasestorage",
                                )
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                              }`}
                              title={
                                segData.urlComprovante?.includes(
                                  "firebasestorage",
                                )
                                  ? "Visualizar Comprovante Local"
                                  : "Visualizar Comprovante no OneDrive"
                              }
                            >
                              {segData.urlComprovante?.includes(
                                "firebasestorage",
                              ) ? (
                                <CheckCircle className="w-4.5 h-4.5" />
                              ) : (
                                <Cloud className="w-4 h-4 text-indigo-500" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                askConfirmation(
                                  "Remover Comprovante",
                                  "Deseja realmente remover o comprovante de pagamento deste registro?",
                                  "danger",
                                  async () => {
                                    try {
                                      await updateDoc(
                                        doc(db, "guias", segData.id),
                                        {
                                          urlComprovante: null,
                                          status: "pendente",
                                        },
                                      );
                                      setGuias((prev) =>
                                        prev.map((g) =>
                                          g.id === segData.id
                                            ? {
                                                ...g,
                                                urlComprovante: null,
                                                status: "pendente",
                                              }
                                            : g,
                                        ),
                                      );
                                      showAlert(
                                        "Desvinculado",
                                        "Arquivo do comprovante de pagamento desassociado.",
                                        "success",
                                      );
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  },
                                );
                              }}
                              className="w-5 h-5 text-gray-300 hover:text-rose-600 transition-colors"
                              title="Desvincular Comprovante"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setLinkContext({
                                deptId: dept.id,
                                deptNome: dept.nome,
                                tipo: "segurado",
                                target: "comprovante",
                              })
                            }
                            className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all mx-auto border border-dashed border-gray-200"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="mt-10 max-w-[1600px] mx-auto px-12 flex flex-col md:flex-row justify-between items-center gap-6 pb-20">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.2em]">
          Total de {departamentos.length} departamentos monitorados
        </p>
        <div className="flex items-center gap-6 bg-white px-8 py-4 rounded-3xl border border-gray-100 shadow-sm">
          <div className="text-center md:text-left">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              Total Patronal
            </p>
            <p className="text-xl font-black text-blue-600">
              R${" "}
              {guias
                .filter(
                  (g) =>
                    g.tipo === "patronal" &&
                    (g.regime || "capitalizado") === activeRegime &&
                    departamentos.some((d) => d.id === g.departamentoId),
                )
                .reduce((acc, g) => acc + g.valor, 0)
                .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="text-center md:text-left">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
              Total Segurados
            </p>
            <p className="text-xl font-black text-emerald-600">
              R${" "}
              {guias
                .filter(
                  (g) =>
                    g.tipo === "segurado" &&
                    (g.regime || "capitalizado") === activeRegime &&
                    departamentos.some((d) => d.id === g.departamentoId),
                )
                .reduce((acc, g) => acc + g.valor, 0)
                .toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </footer>

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
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />

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
              {/* Detalhe Decorativo */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 to-emerald-500" />

              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter text-gray-900 leading-none">
                    CONFERÊNCIA DE DADOS
                  </h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">
                    {uploadContext?.target === "guia"
                      ? "Anexando Guia"
                      : "Anexando Comprovante"}
                  </p>
                </div>
                <button
                  onClick={() => setIsFormModalOpen(false)}
                  className="text-gray-400 hover:text-black"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {isExtractingAi && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-100 px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest animate-pulse mb-6">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Preenchendo automaticamente com IA...</span>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    Identificação (Código GRCP)
                  </label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Ex: GRCP-2026-X"
                    value={uploadForm.identificacaoGrcp}
                    onChange={(e) =>
                      setUploadForm((prev) => ({
                        ...prev,
                        identificacaoGrcp: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                    {uploadContext?.target === "guia"
                      ? "Valor da Guia"
                      : "Valor Pago (Comprovante)"}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-sm">
                      R$
                    </span>
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-12 pr-4 py-3 font-black text-gray-900 text-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      value={modalValorStr}
                      onChange={(e) => {
                        setModalValorStr(e.target.value);
                        setUploadForm((prev) => ({
                          ...prev,
                          valor: parseBRLToFloat(e.target.value),
                        }));
                      }}
                      onBlur={() => {
                        setModalValorStr(
                          formatBRL(parseBRLToFloat(modalValorStr)),
                        );
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
                    className="flex-1 bg-blue-600 text-white px-6 py-4 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/15 disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? "Subindo..." : "Confirmar e Enviar"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Unificado de Vínculo: OneDrive e Local */}
      <AnimatePresence>
        {linkContext && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl p-8 relative overflow-hidden my-8"
            >
              {/* Top border colored gradient */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500" />

              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter text-gray-900 leading-none uppercase">
                    VINCULAR DOCUMENTO
                  </h3>
                  <p className="text-[10px] font-black text-gray-400 mt-2 uppercase">
                    {linkContext.deptNome} &bull;{" "}
                    <span className="text-indigo-600 font-bold">
                      {linkContext.tipo}
                    </span>{" "}
                    &bull;{" "}
                    <span className="text-emerald-600 font-bold">
                      {linkContext.target}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setLinkContext(null);
                    setSelectedOdFile(null);
                  }}
                  className="p-1 rounded-full text-gray-400 hover:text-black hover:bg-gray-100 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Selector Tabs for OneDrive vs Local */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-50 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => setLinkMode("onedrive")}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
                    linkMode === "onedrive"
                      ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <Cloud className="w-4 h-4" />
                  OneDrive Cloud
                </button>
                <button
                  type="button"
                  onClick={() => setLinkMode("local")}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${
                    linkMode === "local"
                      ? "bg-white text-blue-600 shadow-sm border border-gray-100"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  Upload Local
                </button>
              </div>

              {linkMode === "onedrive" ? (
                <div className="space-y-4">
                  {onedriveConnected ? (
                    <div>
                      <div className="flex justify-between items-center bg-indigo-50/50 rounded-2xl p-4 mb-4 border border-indigo-100/30">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs uppercase">
                            {onedriveUser?.displayName?.slice(0, 2) || "OD"}
                          </div>
                          <div>
                            <p className="text-xs font-black text-gray-800 tracking-tight leading-none">
                              {onedriveUser?.displayName}
                            </p>
                            <p className="text-[9px] font-bold text-gray-400 mt-1">
                              {onedriveUser?.mail ||
                                onedriveUser?.userPrincipalName}
                            </p>
                          </div>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                          CONECTADO
                        </span>
                      </div>

                      {selectedOdFile ? (
                        <div className="space-y-4 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
                              <FileText className="w-8 h-8" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <p className="text-xs font-black text-gray-800 truncate">
                                {selectedOdFile.name}
                              </p>
                              <p className="text-[9px] font-bold text-gray-400 mt-0.5">
                                Link direto:{" "}
                                {selectedOdFile.webUrl?.slice(0, 50)}...
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedOdFile(null)}
                              className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:underline"
                            >
                              Trocar
                            </button>
                          </div>

                          {odExtracting ? (
                            <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center border-t border-gray-100">
                              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                              <div className="space-y-1">
                                <p className="text-xs font-black text-gray-800 uppercase tracking-tight">
                                  Extraindo PDF com Inteligência Artificial...
                                </p>
                                <p className="text-[10px] text-gray-400 font-bold max-w-xs mx-auto">
                                  A IA está localizando o código de identificação GRCP e o valor líquido correto do documento. Por favor, aguarde.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                  Identificação (Código GRCP)
                                </label>
                                <input
                                  type="text"
                                  className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 font-bold text-gray-900 text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                  placeholder="Auto-gerado se vazio"
                                  value={odFormGrcp}
                                  onChange={(e) => setOdFormGrcp(e.target.value)}
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                  {linkContext?.target === "guia"
                                    ? "Valor da Guia"
                                    : "Valor Pago (Comprovante)"}
                                </label>
                                <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-xs">
                                    R$
                                  </span>
                                  <input
                                    type="text"
                                    className="w-full bg-white border border-gray-100 rounded-xl pl-10 pr-4 py-3 font-black text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    value={odFormValor}
                                    placeholder="0,00"
                                    onChange={(e) => {
                                      setOdFormValor(e.target.value);
                                    }}
                                    onBlur={() => {
                                      setOdFormValor(
                                        formatBRL(parseBRLToFloat(odFormValor)),
                                      );
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-4 pt-4">
                            <button
                              type="button"
                              onClick={() => setSelectedOdFile(null)}
                              className="flex-1 py-3 text-center border border-gray-100 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-colors"
                            >
                              Voltar
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmOneDriveLink}
                              disabled={linkingOdInProgress || odExtracting}
                              className="flex-grow py-3 text-center bg-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                            >
                              {linkingOdInProgress
                                ? "Vinculando..."
                                : odExtracting
                                ? "Lendo documento..."
                                : "Salvar Vínculo"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
                            Navegue e escolha o arquivo PDF:
                          </p>
                          <OneDriveExplorer
                            persistenceKey={linkContext.target}
                            initialFolderId={
                              departamentos.find(
                                (d) => d.id === linkContext.deptId,
                              )?.onedriveFolderId
                            }
                            onSelectFile={(file) => {
                              if (file.folder) return;
                              setSelectedOdFile(file);
                              
                              // Buscar guias existentes para auto-preenchimento rápido direto
                              const existingGuia = guias.find(
                                (g) =>
                                  g.departamentoId === linkContext.deptId &&
                                  g.tipo === linkContext.tipo &&
                                  (g.regime || "capitalizado") === activeRegime,
                              );
                              setOdFormGrcp(existingGuia?.identificacaoGrcp || "");
                              const initialVal =
                                linkContext.target === "guia"
                                  ? existingGuia?.valor || 0
                                  : existingGuia?.valorPago ||
                                    existingGuia?.valor ||
                                    0;
                              setOdFormValor(formatBRL(initialVal));
                            }}
                          />

                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setLinkContext(null);
                                setSelectedOdFile(null);
                              }}
                              className="px-6 py-3 border border-gray-100 bg-white hover:bg-gray-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 transition-colors"
                            >
                              Fechar / Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-10 border border-dashed border-gray-200 rounded-[2rem] text-center bg-gray-50/50">
                      <Cloud className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-bounce" />
                      <h4 className="text-sm font-black text-gray-800 uppercase tracking-tight">
                        OneDrive Não Conectado
                      </h4>
                      <p className="text-xs text-gray-400 max-w-sm mx-auto mt-2 leading-relaxed">
                        Conecte sua conta Microsoft OneDrive para navegar nas
                        pastas e realizar vínculos de forma instantânea.
                      </p>
                      <button
                        type="button"
                        onClick={handleConnectOneDriveInRelatorio}
                        className="mt-6 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-indigo-600/10"
                      >
                        Conectar ao OneDrive
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div
                    onClick={() => {
                      setUploadContext({
                        deptId: linkContext.deptId,
                        tipo: linkContext.tipo,
                        target: linkContext.target,
                      });
                      setLinkContext(null); // Clean transition logic
                      setTimeout(() => {
                        fileInputRef.current?.click();
                      }, 100);
                    }}
                    className="p-12 border-2 border-dashed border-gray-200 rounded-[2rem] hover:border-blue-500 hover:bg-blue-50/20 text-center cursor-pointer transition-all group"
                  >
                    <UploadCloud className="w-12 h-12 text-gray-300 group-hover:text-blue-500 mx-auto mb-4 transition-all group-hover:scale-110" />
                    <h4 className="text-xs font-black text-gray-700 tracking-tight uppercase">
                      Escolher arquivo local
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-2 max-w-xs mx-auto">
                      Selecione um arquivo PDF de seu computador para realizar
                      upload direto ao Firebase Storage.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setLinkContext(null)}
                      className="px-6 py-3 border border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
