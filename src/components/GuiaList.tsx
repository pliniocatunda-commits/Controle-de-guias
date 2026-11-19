import React, { useState, useEffect, useRef } from "react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import {
  collection,
  query,
  getDocs,
  where,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  orderBy,
} from "firebase/firestore";
import { uploadFile } from "../lib/storage";
import { Guia, Departamento, Comprovante, Secretaria } from "../types";
import {
  FileText,
  Calendar,
  DollarSign,
  Tag,
  Search,
  ChevronRight,
  ArrowLeft,
  Upload,
  CheckCircle,
  AlertTriangle,
  FileUp,
  Loader2,
  FileSearch,
  Trash2,
  Eye,
  X,
  Download,
  Plus,
  Minus,
  Pencil,
  RotateCcw,
  FileSpreadsheet,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ModalConfirmacao from "./ModalConfirmacao";
import RelatorioGuiasModal from "./RelatorioGuiasModal";

import OneDriveExplorer from "./OneDriveExplorer";
import { Cloud, Link as LinkIcon } from "lucide-react";
import { onedriveService, extractOneDriveItemId } from "../services/onedriveService";

// Helper functions for BRL currency formatting and parsing
const parseBRLToFloat = (value: string | number | undefined | null): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const trimmed = value.replace(/R\$\s?/gi, "").trim();
  if (!trimmed) return 0;
  if (trimmed.includes(",")) {
    const clean = trimmed.replace(/\./g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  }
  const dotParts = trimmed.split(".");
  if (
    dotParts.length > 2 ||
    (dotParts.length === 2 && dotParts[1].length === 3 && dotParts[0].length >= 1)
  ) {
    return parseFloat(trimmed.replace(/\./g, "")) || 0;
  }
  return parseFloat(trimmed) || 0;
};

const normalizeValue = (val: number | undefined | null): number => {
  if (val === undefined || val === null || isNaN(val)) return 0;
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
  const numValue = normalizeValue(
    typeof value === "string" ? parseBRLToFloat(value) : value,
  );
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

export default function GuiaList({
  departamentoId,
  onBack,
  role,
}: {
  departamentoId?: string;
  onBack: () => void;
  role?: string;
}) {
  const [guias, setGuias] = useState<Guia[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesReferencia, setMesReferencia] = useState(() => {
    const saved = sessionStorage.getItem("trabalho_mes");
    return saved ? parseInt(saved) : (new Date().getMonth() + 1);
  });
  const [anoFiscal, setAnoFiscal] = useState(() => {
    const saved = sessionStorage.getItem("trabalho_ano");
    return saved ? parseInt(saved) : new Date().getFullYear();
  });

  useEffect(() => {
    sessionStorage.setItem("trabalho_mes", mesReferencia.toString());
  }, [mesReferencia]);

  useEffect(() => {
    sessionStorage.setItem("trabalho_ano", anoFiscal.toString());
  }, [anoFiscal]);
  const [activeRegime, setActiveRegime] = useState<
    "capitalizado" | "financeiro"
  >("capitalizado");
  const [oneDrivePickContext, setOneDrivePickContext] = useState<{
    deptId: string;
    deptNome?: string;
    tipo: "patronal" | "segurado";
    target: "guia" | "comprovante";
    complementarId?: string;
    descricaoFolha?: string;
  } | null>(null);

  const [isRelatorioOpen, setIsRelatorioOpen] = useState(false);

  // Modal Control
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadContext, setUploadContext] = useState<{
    deptId: string;
    tipo: "patronal" | "segurado";
    target: "guia" | "comprovante";
    complementarId?: string;
    descricaoFolha?: string;
  } | null>(null);
  const [draftComplementares, setDraftComplementares] = useState<
    Record<string, Array<{ id: string; descricao: string }>>
  >({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({
    valor: 0,
    identificacaoGrcp: "",
  });
  const [modalValorStr, setModalValorStr] = useState("");
  const [tempValues, setTempValues] = useState<Record<string, string>>({});
  const [tempGrcp, setTempGrcp] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, any>>({});
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isExtractingAi, setIsExtractingAi] = useState(false);

  const [obsModalConfig, setObsModalConfig] = useState<{
    isOpen: boolean;
    guiaId: string | null;
    deptId: string;
    departamentoNome: string;
    tipo: "patronal" | "segurado";
    text: string;
    complementarId?: string;
    descricaoFolha?: string;
  } | null>(null);

  const [editGuiaModal, setEditGuiaModal] = useState<{
    guiaId: string;
    deptNome: string;
    tipo: "patronal" | "segurado";
    target: "guia" | "comprovante";
    descricaoFolha: string;
    identificacaoGrcp: string;
    valorStr: string;
    complementarId?: string;
  } | null>(null);

  const [editDraftCompModal, setEditDraftCompModal] = useState<{
    deptId: string;
    compId: string;
    descricao: string;
  } | null>(null);

  // Carrega secretarias e departamentos (somente no carregamento inicial ou se departamentoId mudar)
  useEffect(() => {
    let isMounted = true;
    async function fetchStructure() {
      try {
        const [secSnap, deptSnap] = await Promise.all([
          getDocs(collection(db, "secretarias")),
          getDocs(collection(db, "departamentos")),
        ]);

        const secs = secSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Secretaria,
        );
        secs.sort((a, b) => {
          const getTimestamp = (val: any) => {
            if (!val) return 0;
            if (typeof val.toDate === "function") return val.toDate().getTime();
            if (val.seconds !== undefined)
              return (
                val.seconds * 1000 +
                (val.nanoseconds ? val.nanoseconds / 1000000 : 0)
              );
            if (val instanceof Date) return val.getTime();
            if (typeof val === "number") return val;
            return new Date(val).getTime() || 0;
          };
          const timeA = getTimestamp(a.createdAt);
          const timeB = getTimestamp(b.createdAt);
          if (timeA !== timeB) return timeA - timeB;
          return (a.nome || "").localeCompare(b.nome || "");
        });

        const idxArticulacao = secs.findIndex((sec) => {
          const n = (sec.nome || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return n.includes("articulacao politica");
        });
        const idxEsporte = secs.findIndex((sec) => {
          const n = (sec.nome || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return n.includes("esporte") && n.includes("juventude");
        });

        if (idxArticulacao !== -1 && idxEsporte !== -1) {
          const articulacaoItem = secs[idxArticulacao];
          secs.splice(idxArticulacao, 1);

          const newIdxEsporte = secs.findIndex((sec) => {
            const n = (sec.nome || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            return n.includes("esporte") && n.includes("juventude");
          });

          secs.splice(newIdxEsporte + 1, 0, articulacaoItem);
        }

        if (!isMounted) return;
        setSecretarias(secs);

        let depts = deptSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Departamento,
        );

        if (departamentoId) {
          depts = depts.filter((d) => d.id === departamentoId);
        }

        const secOrder = new Map(secs.map((s, idx) => [s.id, idx]));
        depts.sort((a, b) => {
          const orderA = secOrder.get(a.secretariaId) ?? Infinity;
          const orderB = secOrder.get(b.secretariaId) ?? Infinity;
          if (orderA !== orderB) return orderA - orderB;

          const getTimestamp = (val: any) => {
            if (!val) return 0;
            if (typeof val.toDate === "function") return val.toDate().getTime();
            if (val.seconds !== undefined)
              return (
                val.seconds * 1000 +
                (val.nanoseconds ? val.nanoseconds / 1000000 : 0)
              );
            if (val instanceof Date) return val.getTime();
            if (typeof val === "number") return val;
            return new Date(val).getTime() || 0;
          };
          const timeA = getTimestamp(a.createdAt);
          const timeB = getTimestamp(b.createdAt);
          if (timeA !== timeB) return timeA - timeB;
          return (a.nome || "").localeCompare(b.nome || "");
        });

        setDepartamentos(depts);
      } catch (error) {
        console.error("Erro ao carregar estrutura:", error);
      }
    }
    fetchStructure();
    return () => {
      isMounted = false;
    };
  }, [departamentoId]);

  // Carrega guias com agilidade para o mês e ano fiscal selecionado
  useEffect(() => {
    let isMounted = true;
    async function fetchGuias() {
      if (departamentos.length === 0) setLoading(true);
      try {
        const q = query(
          collection(db, "guias"),
          where("mes", "==", mesReferencia),
          where("ano", "==", anoFiscal),
        );
        const snapshot = await getDocs(q);
        if (isMounted) {
          setGuias(
            snapshot.docs.map((doc) =>
              normalizeGuia({ id: doc.id, ...doc.data() }),
            ),
          );
        }
      } catch (error) {
        console.error("Erro ao buscar guias:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchGuias();
    return () => {
      isMounted = false;
    };
  }, [mesReferencia, anoFiscal]);

  // Atualização otimista imediata na memória com debounce na escrita do Firestore
  const handleInlineUpdate = (
    guiaId: string,
    field: string,
    value: any,
    debounceMs = 500,
  ) => {
    if (role !== "master" && role !== "admin") return;

    // 1. Atualização em memória (0ms de latência visual e recálculo dinâmico)
    setGuias((prev) =>
      prev.map((g) =>
        g.id === guiaId ? normalizeGuia({ ...g, [field]: value }) : g,
      ),
    );

    // 2. Debounce na gravação no Firestore
    const timerKey = `${guiaId}_${field}`;
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey]);
    }

    if (debounceMs <= 0) {
      updateDoc(doc(db, "guias", guiaId), { [field]: value }).catch((err) =>
        console.error("Erro no update inline imediato:", err),
      );
      return;
    }

    debounceTimers.current[timerKey] = setTimeout(async () => {
      try {
        await updateDoc(doc(db, "guias", guiaId), { [field]: value });
      } catch (error) {
        console.error("Erro no update inline debounced:", error);
      } finally {
        delete debounceTimers.current[timerKey];
      }
    }, debounceMs);
  };

  // Garante a persistência imediata ao sair do campo (onBlur)
  const flushInlineUpdate = (guiaId: string, field: string, value: any) => {
    const timerKey = `${guiaId}_${field}`;
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey]);
      delete debounceTimers.current[timerKey];
    }
    if (role === "master" || role === "admin") {
      updateDoc(doc(db, "guias", guiaId), { [field]: value }).catch((err) =>
        console.error("Erro ao persistir campo no onBlur:", err),
      );
    }
  };

  const handleSaveObservation = async (
    guiaId: string | null,
    deptId: string,
    tipo: "patronal" | "segurado",
    text: string,
    complementarId?: string,
    descricaoFolha?: string,
  ) => {
    try {
      if (guiaId) {
        await updateDoc(doc(db, "guias", guiaId), { observacao: text });
        setGuias((prev) =>
          prev.map((g) =>
            g.id === guiaId ? { ...g, observacao: text } : g,
          ),
        );
      } else {
        // Criar uma guia pendente com valor 0 para guardar a observação
        const newDocData: any = {
          departamentoId: deptId,
          mes: mesReferencia,
          ano: anoFiscal,
          valor: 0,
          vencimento: format(new Date(anoFiscal, mesReferencia - 1, 10), "yyyy-MM-dd"),
          status: "pendente",
          tipo,
          regime: activeRegime,
          tipoFolha: complementarId ? "complementar" : "normal",
          complementarId: complementarId || null,
          descricaoFolha:
            descricaoFolha ||
            (complementarId ? "Folha Complementar" : "Folha Normal"),
          observacao: text,
          createdAt: serverTimestamp(),
        };

        const docRef = await addDoc(collection(db, "guias"), newDocData);
        
        const newGuia: Guia = {
          id: docRef.id,
          ...newDocData,
          createdAt: new Date(),
        };
        setGuias((prev) => [...prev, newGuia]);
      }
      showAlert("Sucesso", "Observação salva com sucesso!", "success");
      setObsModalConfig(null);
    } catch (error) {
      console.error("Erro ao salvar observação:", error);
      showAlert("Erro", "Não foi possível salvar a observação.", "danger");
    }
  };

  const handleOpenEditModal = (
    guia: Guia,
    deptNome: string,
    target: "guia" | "comprovante" = "guia",
  ) => {
    const currentVal =
      target === "comprovante"
        ? (guia.valorPago !== undefined && guia.valorPago !== null ? guia.valorPago : (guia.valor || 0))
        : (guia.valor || 0);

    setEditGuiaModal({
      guiaId: guia.id,
      deptNome,
      tipo: guia.tipo,
      target,
      descricaoFolha: guia.descricaoFolha || (guia.tipo === "patronal" ? "Patronal" : "Segurado"),
      identificacaoGrcp: guia.identificacaoGrcp || "",
      valorStr: formatBRL(currentVal),
      complementarId: guia.complementarId,
    });
  };

  const handleSaveEditGuia = async () => {
    if (!editGuiaModal) return;
    const { guiaId, valorStr, identificacaoGrcp, descricaoFolha, target, complementarId } = editGuiaModal;
    try {
      const numVal = parseBRLToFloat(valorStr);
      const updatePayload: Record<string, any> = {
        descricaoFolha: descricaoFolha.trim(),
        identificacaoGrcp: identificacaoGrcp.trim(),
      };

      if (target === "comprovante") {
        updatePayload.valorPago = numVal;
        const currentGuia = guias.find((g) => g.id === guiaId);
        if (!currentGuia?.valor || currentGuia.valor === 0) {
          updatePayload.valor = numVal;
        }
      } else {
        updatePayload.valor = numVal;
        const currentGuia = guias.find((g) => g.id === guiaId);
        if (!currentGuia?.valorPago || currentGuia.valorPago === 0) {
          updatePayload.valorPago = numVal;
        }
      }

      await updateDoc(doc(db, "guias", guiaId), updatePayload);

      if (complementarId && descricaoFolha.trim()) {
        const sisterGuias = guias.filter(
          (g) => g.complementarId === complementarId && g.id !== guiaId,
        );
        for (const sg of sisterGuias) {
          await updateDoc(doc(db, "guias", sg.id), {
            descricaoFolha: descricaoFolha.trim(),
          });
        }
        setDraftComplementares((prev) => {
          const next = { ...prev };
          for (const dId in next) {
            next[dId] = (next[dId] || []).map((c) =>
              c.id === complementarId
                ? { ...c, descricao: descricaoFolha.trim() }
                : c,
            );
          }
          return next;
        });
      }

      setGuias((prev) =>
        prev.map((g) => {
          if (g.id === guiaId) {
            return {
              ...g,
              ...updatePayload,
            };
          }
          if (
            complementarId &&
            g.complementarId === complementarId &&
            descricaoFolha.trim()
          ) {
            return {
              ...g,
              descricaoFolha: descricaoFolha.trim(),
            };
          }
          return g;
        }),
      );

      showAlert("Sucesso", "Lançamento atualizado com sucesso!", "success");
      setEditGuiaModal(null);
    } catch (err) {
      console.error("Erro ao salvar edição:", err);
      showAlert("Erro", "Não foi possível salvar as alterações.", "danger");
    }
  };

  const handleEditComplementarDescricao = (
    deptId: string,
    comp: { id: string; descricao: string },
  ) => {
    const compPat = getGuiaData(deptId, "patronal", comp.id);
    const compSeg = getGuiaData(deptId, "segurado", comp.id);
    const targetGuia = compPat || compSeg;
    const dept = departamentos.find((d) => d.id === deptId);

    if (targetGuia) {
      handleOpenEditModal(
        targetGuia,
        `${dept?.nome || "Departamento"} (${comp.descricao})`,
        "guia",
      );
    } else {
      setEditDraftCompModal({
        deptId,
        compId: comp.id,
        descricao: comp.descricao,
      });
    }
  };

  const handleSaveDraftComplementar = () => {
    if (!editDraftCompModal) return;
    const { deptId, compId, descricao } = editDraftCompModal;
    const trimmed = descricao.trim();
    if (!trimmed) return;
    setDraftComplementares((prev) => ({
      ...prev,
      [deptId]: (prev[deptId] || []).map((c) =>
        c.id === compId ? { ...c, descricao: trimmed } : c,
      ),
    }));
    setEditDraftCompModal(null);
    showAlert("Sucesso", "Descrição atualizada.", "success");
  };

  const triggerUpload = (
    deptId: string,
    tipo: "patronal" | "segurado",
    target: "guia" | "comprovante",
    complementarId?: string,
    descricaoFolha?: string,
  ) => {
    if (role !== "master" && role !== "admin") return;
    setUploadContext({ deptId, tipo, target, complementarId, descricaoFolha });
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadContext) return;

    // Abrir modal de conferência
    const existingGuia = getGuiaData(
      uploadContext.deptId,
      uploadContext.tipo,
      uploadContext.complementarId,
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
        console.error("Erro extração AI background:", err);
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

      const guia = getGuiaData(
        uploadContext.deptId,
        uploadContext.tipo,
        uploadContext.complementarId,
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
            g.id === guia.id ? normalizeGuia({ ...g, ...payload }) : g,
          ),
        );
      } else {
        const newDoc = {
          departamentoId: uploadContext.deptId,
          tipo: uploadContext.tipo,
          mes: mesReferencia,
          ano: anoFiscal,
          regime: activeRegime,
          tipoFolha: uploadContext.complementarId ? "complementar" : "normal",
          complementarId: uploadContext.complementarId || null,
          descricaoFolha:
            uploadContext.descricaoFolha ||
            (uploadContext.complementarId
              ? "Folha Complementar"
              : "Folha Normal"),
          nome: pendingFile.name.split(".")[0],
          valor: uploadContext.target === "guia" ? uploadForm.valor : 0,
          valorPago:
            uploadContext.target === "comprovante" ? uploadForm.valor : 0,
          status: uploadContext.target === "comprovante" ? "pago" : "pendente",
          identificacaoGrcp:
            uploadForm.identificacaoGrcp || `GRCP-${Date.now()}`,
          vencimento: new Date(anoFiscal, mesReferencia, 0)
            .toISOString()
            .split("T")[0],
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

      if (
        error.message?.includes("Firebase") ||
        error.code?.includes("storage")
      ) {
        msg = `Erro no Armazenamento: ${error.message}. Verifique sua conexão e permissões de upload.`;
      } else if (
        error.code === "storage/unauthorized" ||
        error.message?.includes("CORS")
      ) {
        msg =
          "Erro de Permissão ou CORS. Verifique as configurações do Storage no Firebase.";
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
    if (role !== "master" && role !== "admin") return;
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
    showAlert("Download", "Iniciando download do arquivo...", "success");
  };

  const getGuiaData = (
    deptId: string,
    tipo: "patronal" | "segurado",
    complementarId?: string,
  ) => {
    return guias.find((g) => {
      const matchBasic =
        g.departamentoId === deptId &&
        g.tipo === tipo &&
        (g.regime || "capitalizado") === activeRegime;
      if (!matchBasic) return false;
      if (complementarId) {
        return (
          g.complementarId === complementarId ||
          `comp_${g.id}` === complementarId
        );
      }
      return (!g.tipoFolha || g.tipoFolha === "normal") && !g.complementarId;
    });
  };

  const getComplementarGroups = (deptId: string) => {
    const dbComplementares = guias.filter(
      (g) =>
        g.departamentoId === deptId &&
        (g.regime || "capitalizado") === activeRegime &&
        (g.tipoFolha === "complementar" || Boolean(g.complementarId)),
    );

    const map = new Map<string, { id: string; descricao: string }>();

    dbComplementares.forEach((g) => {
      const compId = g.complementarId || `comp_${g.id}`;
      if (!map.has(compId)) {
        map.set(compId, {
          id: compId,
          descricao: g.descricaoFolha || "Folha Complementar",
        });
      }
    });

    (draftComplementares[deptId] || []).forEach((draft) => {
      if (!map.has(draft.id)) {
        map.set(draft.id, draft);
      }
    });

    return Array.from(map.values());
  };

  const handleAddComplementar = (deptId: string) => {
    if (role !== "master" && role !== "admin") return;
    const existing = getComplementarGroups(deptId);
    const nextNum = existing.length + 1;
    const newCompId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const descricao = `Folha Complementar ${nextNum > 1 ? nextNum : ""}`.trim();

    setDraftComplementares((prev) => ({
      ...prev,
      [deptId]: [...(prev[deptId] || []), { id: newCompId, descricao }],
    }));
  };

  const handleDeleteComplementar = (deptId: string, complementarId: string) => {
    if (role !== "master" && role !== "admin") return;
    askConfirmation(
      "Excluir Folha Complementar",
      "Deseja realmente remover esta folha complementar e todos os seus registros vinculados (guias e comprovantes)?",
      "danger",
      async () => {
        try {
          const toDelete = guias.filter(
            (g) =>
              g.departamentoId === deptId &&
              (g.complementarId === complementarId ||
                `comp_${g.id}` === complementarId),
          );
          for (const g of toDelete) {
            await deleteDoc(doc(db, "guias", g.id));
          }
          setGuias((prev) =>
            prev.filter((g) => !toDelete.some((d) => d.id === g.id)),
          );
          setDraftComplementares((prev) => ({
            ...prev,
            [deptId]: (prev[deptId] || []).filter(
              (c) => c.id !== complementarId,
            ),
          }));
          showAlert("Sucesso", "Folha complementar removida.", "success");
        } catch (error) {
          console.error("Erro ao remover folha complementar:", error);
          showAlert("Erro", "Falha ao remover folha complementar.", "danger");
        }
      },
    );
  };

  const handleInlineOrCreate = async (
    deptId: string,
    tipo: "patronal" | "segurado",
    existingGuia: Guia | undefined,
    field: "identificacaoGrcp" | "valor",
    value: any,
    complementarId?: string,
    descricaoFolha?: string,
    debounceMs = 500,
  ) => {
    if (role !== "master" && role !== "admin") return;

    if (existingGuia) {
      handleInlineUpdate(existingGuia.id, field, value, debounceMs);
      return;
    }

    if (field === "valor") {
      const parsedVal = typeof value === "number" ? value : parseBRLToFloat(value);
      if (parsedVal <= 0) return;
    } else if (field === "identificacaoGrcp" && !String(value || "").trim()) {
      return;
    }

    try {
      const isComp = Boolean(complementarId);
      const newDocData: any = {
        departamentoId: deptId,
        tipo,
        mes: mesReferencia,
        ano: anoFiscal,
        regime: activeRegime,
        tipoFolha: isComp ? "complementar" : "normal",
        complementarId: complementarId || null,
        descricaoFolha:
          descricaoFolha ||
          (isComp ? "Folha Complementar" : "Folha Normal"),
        valor:
          field === "valor"
            ? typeof value === "number"
              ? value
              : parseBRLToFloat(value)
            : 0,
        status: "pendente",
        identificacaoGrcp: field === "identificacaoGrcp" ? value : "",
        vencimento: new Date(anoFiscal, mesReferencia, 0)
          .toISOString()
          .split("T")[0],
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "guias"), newDocData);
      const createdGuia: Guia = {
        id: docRef.id,
        ...newDocData,
        createdAt: new Date(),
      };
      setGuias((prev) => [...prev, normalizeGuia(createdGuia)]);
    } catch (err) {
      console.error("Erro ao criar guia inline:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header Estilizado - Estilo Amarelo/SOCIAL do usuário */}
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
              <span className="text-gray-600">Gestão Global</span>
            </div>
            <h1 className="text-2xl font-black italic tracking-tighter text-gray-900 leading-none">
              CONSOLIDADO
            </h1>
            <p className="flex items-center gap-2 mt-2 text-gray-400 font-black text-[8px] uppercase tracking-[0.2em]">
              <RotateCcw className="w-3 h-3 text-gray-200" /> Visão Consolidada
              de Departamentos
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setIsRelatorioOpen(true)}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest p-4 px-6 h-14 rounded-2xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Emitir Relatório</span>
            </button>

            <div className="bg-white p-3 px-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-6">
              <div className="text-right">
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                  MÊS
                </p>
                <select
                  className="appearance-none bg-transparent border-none p-0 font-black text-gray-900 text-sm focus:ring-0 uppercase cursor-pointer min-w-[80px]"
                  value={mesReferencia}
                  onChange={(e) => setMesReferencia(parseInt(e.target.value))}
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
                  value={anoFiscal}
                  onChange={(e) => setAnoFiscal(parseInt(e.target.value))}
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
                  colSpan={5}
                  className="py-5 border-r border-gray-200 text-blue-700 bg-blue-50/30"
                >
                  PATRONAL
                </th>
                <th
                  colSpan={5}
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
                <th className="py-3 px-4 text-center">
                  COMPROVANTE
                </th>
                <th className="py-3 px-4 text-center border-r border-gray-200">
                  OBS
                </th>

                <th className="py-3 px-4 whitespace-nowrap min-w-[140px]">
                  ID GRCP
                </th>
                <th className="py-3 px-4 min-w-[100px]">VALOR</th>
                <th className="py-3 px-4 text-center">GUIA</th>
                <th className="py-3 px-4 text-center">COMPROVANTE</th>
                <th className="py-3 px-4 text-center">OBS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td className="py-4 px-6 border-r border-gray-100 max-w-[240px] space-y-2">
                      <div className="h-3 w-16 bg-gray-200/60 rounded" />
                      <div className="h-4 w-36 bg-gray-200/80 rounded-md" />
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
                    <td className="p-3 text-center">
                      <div className="inline-flex gap-1 justify-center">
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                        <div className="w-7 h-7 bg-gray-200/40 rounded-lg" />
                      </div>
                    </td>
                    <td className="p-3 text-center border-r border-gray-100">
                      <div className="w-7 h-7 bg-gray-200/40 rounded-lg mx-auto" />
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
                    <td className="p-3 text-center">
                      <div className="w-7 h-7 bg-gray-200/40 rounded-lg mx-auto" />
                    </td>
                  </tr>
                ))
              ) : (
                departamentos.map((dept) => {
                  const patData = getGuiaData(dept.id, "patronal");
                  const segData = getGuiaData(dept.id, "segurado");
                  const sec = secretarias.find((s) => s.id === dept.secretariaId);
                  const compGroups = getComplementarGroups(dept.id);

                  return (
                    <React.Fragment key={dept.id}>
                      <tr className="hover:bg-gray-50 transition-colors group">
                        <td className="py-3 px-6 border-r border-gray-200 max-w-[240px]">
                          {sec && (
                            <div className="mb-0.5">
                              <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md font-extrabold text-[8px] uppercase tracking-wider">
                                {sec.sigla || sec.nome}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-black text-gray-900 text-[10px] tracking-tight leading-normal whitespace-normal break-words">
                              {dept.nome}
                            </p>
                            {(role === "master" || role === "admin") && (
                              <button
                                type="button"
                                onClick={() => handleAddComplementar(dept.id)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[8px] font-black rounded border border-indigo-200 transition-colors shrink-0 shadow-2xs"
                                title="Adicionar Folha Complementar"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Folha</span>
                              </button>
                            )}
                          </div>
                          {dept.onedriveFolderId && (
                            <div className="flex items-center gap-1 mt-1">
                              <Cloud className="w-3 h-3 text-emerald-500" />
                              <span className="text-[8px] font-bold text-emerald-600 uppercase">
                                Vinculado
                              </span>
                            </div>
                          )}
                        </td>

                        {/* PATRONAL SECTION */}
                        <td className="p-2 px-4 min-w-[140px]">
                          <div className="min-h-[1.5rem] flex items-center">
                            {patData ? (
                              <input
                                type="text"
                                disabled={role !== "master" && role !== "admin"}
                                className="bg-transparent border-none p-0 text-[10px] font-bold text-gray-600 w-full focus:ring-0 outline-none leading-tight disabled:opacity-75"
                                value={
                                  tempGrcp[patData.id] !== undefined
                                    ? tempGrcp[patData.id]
                                    : (patData.identificacaoGrcp || "")
                                }
                                placeholder="Identificação..."
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTempGrcp((prev) => ({
                                    ...prev,
                                    [patData.id]: val,
                                  }));
                                  handleInlineUpdate(
                                    patData.id,
                                    "identificacaoGrcp",
                                    val,
                                    600,
                                  );
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value;
                                  flushInlineUpdate(
                                    patData.id,
                                    "identificacaoGrcp",
                                    val,
                                  );
                                  setTempGrcp((prev) => {
                                    const next = { ...prev };
                                    delete next[patData.id];
                                    return next;
                                  });
                                }}
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
                                disabled={role !== "master" && role !== "admin"}
                                className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px] disabled:opacity-75"
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
                                  const numVal = parseBRLToFloat(typed);
                                  handleInlineUpdate(
                                    patData.id,
                                    "valor",
                                    numVal,
                                    600,
                                  );
                                }}
                                onBlur={(e) => {
                                  const typed =
                                    tempValues[patData.id] !== undefined
                                      ? tempValues[patData.id]
                                      : e.target.value;
                                  const numVal = parseBRLToFloat(typed);
                                  flushInlineUpdate(patData.id, "valor", numVal);
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
                              {(role === "master" || role === "admin") && (
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteGuia(patData.id)}
                                    className="w-4 h-4 text-rose-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                    title="Deletar Lançamento"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(patData, dept.nome, "guia")}
                                    className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                    title="Editar Descrição / Valor"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            (role === "master" || role === "admin") ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() =>
                                    triggerUpload(dept.id, "patronal", "guia")
                                  }
                                  className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-dashed border-gray-200"
                                  title="Upload Manual"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                {dept.onedriveFolderId && (
                                  <button
                                    onClick={() =>
                                      setOneDrivePickContext({
                                        deptId: dept.id,
                                        deptNome: dept.nome,
                                        tipo: "patronal",
                                        target: "guia",
                                      })
                                    }
                                    className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                    title="Vincular do OneDrive"
                                  >
                                    <Cloud size={14} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 select-none">Pendente</span>
                            )
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {patData?.urlComprovante ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openDocument(patData.urlComprovante, patData.id, false, patData.onedriveComprovanteId)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border shadow-sm ${
                                  patData.urlComprovante?.includes("firebasestorage")
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                                }`}
                                title={
                                  patData.urlComprovante?.includes("firebasestorage")
                                    ? "Visualizar Comprovante Local"
                                    : "Visualizar Comprovante no OneDrive"
                                }
                              >
                                {patData.urlComprovante?.includes("firebasestorage") ? (
                                  <CheckCircle className="w-4.5 h-4.5" />
                                ) : (
                                  <Cloud className="w-4 h-4 text-indigo-500" />
                                )}
                              </button>
                              {(role === "master" || role === "admin") && (
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <button
                                    type="button"
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
                                                onedriveComprovanteId: null,
                                                status: "pendente",
                                              },
                                            );
                                            setGuias((prev) =>
                                              prev.map((g) =>
                                                g.id === patData.id
                                                  ? {
                                                      ...g,
                                                      urlComprovante: undefined,
                                                      onedriveComprovanteId: undefined,
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
                                    className="w-4 h-4 text-gray-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                    title="Desvincular Comprovante"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(patData, dept.nome, "comprovante")}
                                    className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                    title="Editar Descrição / Valor"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            (role === "master" || role === "admin") ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() =>
                                    triggerUpload(dept.id, "patronal", "comprovante")
                                  }
                                  className="w-7 h-7 bg-transparent hover:bg-gray-100 border border-dashed border-gray-200 rounded-lg flex items-center justify-center"
                                  title="Upload Comprovante"
                                >
                                  <Upload className="w-3.5 h-3.5 text-gray-300 hover:text-gray-650" />
                                </button>
                                {dept.onedriveFolderId && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOneDrivePickContext({
                                        deptId: dept.id,
                                        deptNome: dept.nome,
                                        tipo: "patronal",
                                        target: "comprovante",
                                      })
                                    }
                                    className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                    title="Vincular Comprovante do OneDrive"
                                  >
                                    <Cloud size={12} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300 text-[10px]">—</span>
                            )
                          )}
                        </td>
                        <td className="p-2 text-center border-r border-gray-200">
                          <button
                            type="button"
                            onClick={() =>
                              setObsModalConfig({
                                isOpen: true,
                                guiaId: patData?.id || null,
                                deptId: dept.id,
                                departamentoNome: dept.nome,
                                tipo: "patronal",
                                text: patData?.observacao || "",
                              })
                            }
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border mx-auto ${
                              patData?.observacao
                                ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                                : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                            }`}
                            title={patData?.observacao ? "Ver/Editar Observação (Preenchida)" : "Adicionar Observação"}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </td>

                        {/* SEGURADOS SECTION */}
                        <td className="p-2 px-4 min-w-[140px]">
                          <div className="min-h-[1.5rem] flex items-center">
                            {segData ? (
                              <input
                                type="text"
                                disabled={role !== "master" && role !== "admin"}
                                className="bg-transparent border-none p-0 text-[10px] font-bold text-gray-600 w-full focus:ring-0 outline-none leading-tight disabled:opacity-75"
                                value={
                                  tempGrcp[segData.id] !== undefined
                                    ? tempGrcp[segData.id]
                                    : (segData.identificacaoGrcp || "")
                                }
                                placeholder="Identificação..."
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTempGrcp((prev) => ({
                                    ...prev,
                                    [segData.id]: val,
                                  }));
                                  handleInlineUpdate(
                                    segData.id,
                                    "identificacaoGrcp",
                                    val,
                                    600,
                                  );
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value;
                                  flushInlineUpdate(
                                    segData.id,
                                    "identificacaoGrcp",
                                    val,
                                  );
                                  setTempGrcp((prev) => {
                                    const next = { ...prev };
                                    delete next[segData.id];
                                    return next;
                                  });
                                }}
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
                                disabled={role !== "master" && role !== "admin"}
                                className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px] disabled:opacity-75"
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
                                  const numVal = parseBRLToFloat(typed);
                                  handleInlineUpdate(
                                    segData.id,
                                    "valor",
                                    numVal,
                                    600,
                                  );
                                }}
                                onBlur={(e) => {
                                  const typed =
                                    tempValues[segData.id] !== undefined
                                      ? tempValues[segData.id]
                                      : e.target.value;
                                  const numVal = parseBRLToFloat(typed);
                                  flushInlineUpdate(segData.id, "valor", numVal);
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
                              {(role === "master" || role === "admin") && (
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteGuia(segData.id)}
                                    className="w-4 h-4 text-rose-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                    title="Deletar Lançamento"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(segData, dept.nome, "guia")}
                                    className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                    title="Editar Descrição / Valor"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            (role === "master" || role === "admin") ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() =>
                                    triggerUpload(dept.id, "segurado", "guia")
                                  }
                                  className="w-8 h-8 bg-gray-50 text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-dashed border-gray-200"
                                  title="Upload Manual"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                {dept.onedriveFolderId && (
                                  <button
                                    onClick={() =>
                                      setOneDrivePickContext({
                                        deptId: dept.id,
                                        deptNome: dept.nome,
                                        tipo: "segurado",
                                        target: "guia",
                                      })
                                    }
                                    className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                    title="Vincular do OneDrive"
                                  >
                                    <Cloud size={14} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 select-none">Pendente</span>
                            )
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {segData?.urlComprovante ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openDocument(segData.urlComprovante, segData.id, false, segData.onedriveComprovanteId)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border shadow-sm ${
                                  segData.urlComprovante?.includes("firebasestorage")
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                                }`}
                                title={
                                  segData.urlComprovante?.includes("firebasestorage")
                                    ? "Visualizar Comprovante Local"
                                    : "Visualizar Comprovante no OneDrive"
                                }
                              >
                                {segData.urlComprovante?.includes("firebasestorage") ? (
                                  <CheckCircle className="w-4.5 h-4.5" />
                                ) : (
                                  <Cloud className="w-4 h-4 text-indigo-500" />
                                )}
                              </button>
                              {(role === "master" || role === "admin") && (
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <button
                                    type="button"
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
                                                onedriveComprovanteId: null,
                                                status: "pendente",
                                              },
                                            );
                                            setGuias((prev) =>
                                              prev.map((g) =>
                                                g.id === segData.id
                                                  ? {
                                                      ...g,
                                                      urlComprovante: undefined,
                                                      onedriveComprovanteId: undefined,
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
                                    className="w-4 h-4 text-gray-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                    title="Desvincular Comprovante"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(segData, dept.nome, "comprovante")}
                                    className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                    title="Editar Descrição / Valor"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            (role === "master" || role === "admin") ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() =>
                                    triggerUpload(dept.id, "segurado", "comprovante")
                                  }
                                  className="w-7 h-7 bg-transparent hover:bg-gray-100 border border-dashed border-gray-200 rounded-lg flex items-center justify-center"
                                  title="Upload Comprovante"
                                >
                                  <Upload className="w-3.5 h-3.5 text-gray-300 hover:text-gray-650" />
                                </button>
                                {dept.onedriveFolderId && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOneDrivePickContext({
                                        deptId: dept.id,
                                        deptNome: dept.nome,
                                        tipo: "segurado",
                                        target: "comprovante",
                                      })
                                    }
                                    className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                    title="Vincular Comprovante do OneDrive"
                                  >
                                    <Cloud size={12} />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-300 text-[10px]">—</span>
                            )
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setObsModalConfig({
                                isOpen: true,
                                guiaId: segData?.id || null,
                                deptId: dept.id,
                                departamentoNome: dept.nome,
                                tipo: "segurado",
                                text: segData?.observacao || "",
                              })
                            }
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border mx-auto ${
                              segData?.observacao
                                ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                                : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                            }`}
                            title={segData?.observacao ? "Ver/Editar Observação (Preenchida)" : "Adicionar Observação"}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>

                      {/* LINHAS DE FOLHA COMPLEMENTAR */}
                      {compGroups.map((comp) => {
                        const compPatData = getGuiaData(dept.id, "patronal", comp.id);
                        const compSegData = getGuiaData(dept.id, "segurado", comp.id);

                        return (
                          <tr
                            key={`${dept.id}-${comp.id}`}
                            className="bg-indigo-50/20 hover:bg-indigo-50/40 transition-colors border-l-4 border-l-indigo-500"
                          >
                            <td className="py-2.5 pl-6 pr-4 border-r border-gray-200 max-w-[240px]">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-indigo-500 font-bold text-xs select-none">↳</span>
                                  <span className="inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded font-black text-[9px] uppercase tracking-wider truncate">
                                    {comp.descricao}
                                  </span>
                                </div>
                                {(role === "master" || role === "admin") && (
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={() => handleEditComplementarDescricao(dept.id, comp)}
                                      className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
                                      title="Editar Descrição / Valores da Folha Complementar"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteComplementar(dept.id, comp.id)}
                                      className="text-gray-300 hover:text-rose-600 p-1 rounded transition-colors"
                                      title="Excluir Folha Complementar"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* PATRONAL SECTION (COMPLEMENTAR) */}
                            <td className="p-2 px-4 min-w-[140px]">
                              <div className="min-h-[1.5rem] flex items-center">
                                <input
                                  type="text"
                                  disabled={role !== "master" && role !== "admin"}
                                  className="bg-transparent border-none p-0 text-[10px] font-bold text-gray-600 w-full focus:ring-0 outline-none leading-tight disabled:opacity-75"
                                  value={
                                    compPatData && tempGrcp[compPatData.id] !== undefined
                                      ? tempGrcp[compPatData.id]
                                      : (compPatData?.identificacaoGrcp || "")
                                  }
                                  placeholder={role === "master" || role === "admin" ? "Identificação..." : "---"}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (compPatData) {
                                      setTempGrcp((prev) => ({
                                        ...prev,
                                        [compPatData.id]: val,
                                      }));
                                      handleInlineUpdate(
                                        compPatData.id,
                                        "identificacaoGrcp",
                                        val,
                                        600,
                                      );
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value;
                                    if (compPatData) {
                                      flushInlineUpdate(
                                        compPatData.id,
                                        "identificacaoGrcp",
                                        val,
                                      );
                                      setTempGrcp((prev) => {
                                        const next = { ...prev };
                                        delete next[compPatData.id];
                                        return next;
                                      });
                                    } else if (val.trim()) {
                                      handleInlineOrCreate(
                                        dept.id,
                                        "patronal",
                                        compPatData,
                                        "identificacaoGrcp",
                                        val,
                                        comp.id,
                                        comp.descricao,
                                      );
                                    }
                                  }}
                                />
                              </div>
                            </td>
                            <td className="p-2 px-4 min-w-[100px]">
                              <div className="flex items-center gap-0.5">
                                <span className="font-black text-gray-900 text-[10px]">
                                  R$
                                </span>
                                <input
                                  type="text"
                                  disabled={role !== "master" && role !== "admin"}
                                  className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px] disabled:opacity-75"
                                  value={
                                    compPatData && tempValues[compPatData.id] !== undefined
                                      ? tempValues[compPatData.id]
                                      : compPatData
                                        ? formatBRL(compPatData.valor)
                                        : ""
                                  }
                                  placeholder="0,00"
                                  onFocus={() => {
                                    if (compPatData) {
                                      setTempValues((prev) => ({
                                        ...prev,
                                        [compPatData.id]: formatBRL(compPatData.valor),
                                      }));
                                    }
                                  }}
                                  onChange={(e) => {
                                    const typed = e.target.value;
                                    if (compPatData) {
                                      setTempValues((prev) => ({
                                        ...prev,
                                        [compPatData.id]: typed,
                                      }));
                                      const numVal = parseBRLToFloat(typed);
                                      handleInlineUpdate(
                                        compPatData.id,
                                        "valor",
                                        numVal,
                                        600,
                                      );
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const typed =
                                      compPatData && tempValues[compPatData.id] !== undefined
                                        ? tempValues[compPatData.id]
                                        : e.target.value;
                                    const numVal = parseBRLToFloat(typed);
                                    if (compPatData) {
                                      flushInlineUpdate(compPatData.id, "valor", numVal);
                                      setTempValues((prev) => {
                                        const next = { ...prev };
                                        delete next[compPatData.id];
                                        return next;
                                      });
                                    } else if (numVal > 0) {
                                      handleInlineOrCreate(
                                        dept.id,
                                        "patronal",
                                        compPatData,
                                        "valor",
                                        numVal,
                                        comp.id,
                                        comp.descricao,
                                      );
                                    }
                                  }}
                                />
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              {compPatData?.urlGuia ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => openDocument(compPatData.urlGuia, compPatData.id, true, compPatData.onedriveGuiaId)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
                                      compPatData.urlGuia?.includes("firebasestorage")
                                        ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                        : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                                    }`}
                                    title={
                                      compPatData.urlGuia?.includes("firebasestorage")
                                        ? "Visualizar Guia Local"
                                        : "Visualizar Guia no OneDrive"
                                    }
                                  >
                                    {compPatData.urlGuia?.includes("firebasestorage") ? (
                                      <FileText className="w-4 h-4" />
                                    ) : (
                                      <Cloud className="w-4 h-4 text-indigo-500" />
                                    )}
                                  </button>
                                  {(role === "master" || role === "admin") && (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteGuia(compPatData.id)}
                                        className="w-4 h-4 text-rose-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                        title="Deletar Lançamento"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(compPatData, `${dept.nome} (${comp.descricao})`, "guia")}
                                        className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                        title="Editar Descrição / Valor"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                (role === "master" || role === "admin") ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() =>
                                        triggerUpload(dept.id, "patronal", "guia", comp.id, comp.descricao)
                                      }
                                      className="w-8 h-8 bg-white text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-dashed border-rose-200 shadow-2xs"
                                      title="Upload Guia Complementar"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                    {dept.onedriveFolderId && (
                                      <button
                                        onClick={() =>
                                          setOneDrivePickContext({
                                            deptId: dept.id,
                                            deptNome: `${dept.nome} (${comp.descricao})`,
                                            tipo: "patronal",
                                            target: "guia",
                                            complementarId: comp.id,
                                            descricaoFolha: comp.descricao,
                                          })
                                        }
                                        className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                        title="Vincular Guia Complementar do OneDrive"
                                      >
                                        <Cloud size={14} />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400 select-none">Pendente</span>
                                )
                              )}
                            </td>
                            <td className="p-2 text-center">
                              {compPatData?.urlComprovante ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => openDocument(compPatData.urlComprovante, compPatData.id, false, compPatData.onedriveComprovanteId)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border shadow-xs ${
                                      compPatData.urlComprovante?.includes("firebasestorage")
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                        : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                                    }`}
                                    title={
                                      compPatData.urlComprovante?.includes("firebasestorage")
                                        ? "Visualizar Comprovante Local"
                                        : "Visualizar Comprovante no OneDrive"
                                    }
                                  >
                                    {compPatData.urlComprovante?.includes("firebasestorage") ? (
                                      <CheckCircle className="w-4.5 h-4.5" />
                                    ) : (
                                      <Cloud className="w-4 h-4 text-indigo-500" />
                                    )}
                                  </button>
                                  {(role === "master" || role === "admin") && (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          askConfirmation(
                                            "Remover Comprovante",
                                            "Deseja realmente remover o comprovante de pagamento deste registro?",
                                            "danger",
                                            async () => {
                                              try {
                                                await updateDoc(
                                                  doc(db, "guias", compPatData.id),
                                                  {
                                                    urlComprovante: null,
                                                    onedriveComprovanteId: null,
                                                    status: "pendente",
                                                  },
                                                );
                                                setGuias((prev) =>
                                                  prev.map((g) =>
                                                    g.id === compPatData.id
                                                      ? {
                                                          ...g,
                                                          urlComprovante: undefined,
                                                          onedriveComprovanteId: undefined,
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
                                        className="w-4 h-4 text-gray-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                        title="Desvincular Comprovante"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(compPatData, `${dept.nome} (${comp.descricao})`, "comprovante")}
                                        className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                        title="Editar Descrição / Valor"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                (role === "master" || role === "admin") ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() =>
                                        triggerUpload(dept.id, "patronal", "comprovante", comp.id, comp.descricao)
                                      }
                                      className="w-7 h-7 bg-white hover:bg-gray-100 border border-dashed border-rose-200 rounded-lg flex items-center justify-center"
                                      title="Upload Comprovante Complementar"
                                    >
                                      <Upload className="w-3.5 h-3.5 text-rose-400 hover:text-gray-650" />
                                    </button>
                                    {dept.onedriveFolderId && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setOneDrivePickContext({
                                            deptId: dept.id,
                                            deptNome: `${dept.nome} (${comp.descricao})`,
                                            tipo: "patronal",
                                            target: "comprovante",
                                            complementarId: comp.id,
                                            descricaoFolha: comp.descricao,
                                          })
                                        }
                                        className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                        title="Vincular Comprovante Complementar do OneDrive"
                                      >
                                        <Cloud size={12} />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400 select-none">—</span>
                                )
                              )}
                            </td>
                            <td className="p-2 text-center border-r border-gray-200">
                              <button
                                type="button"
                                onClick={() =>
                                  setObsModalConfig({
                                    isOpen: true,
                                    guiaId: compPatData?.id || null,
                                    deptId: dept.id,
                                    departamentoNome: `${dept.nome} (${comp.descricao})`,
                                    tipo: "patronal",
                                    text: compPatData?.observacao || "",
                                    complementarId: comp.id,
                                    descricaoFolha: comp.descricao,
                                  })
                                }
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border mx-auto ${
                                  compPatData?.observacao
                                    ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                                    : "bg-white text-gray-400 border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                                }`}
                                title={compPatData?.observacao ? "Ver/Editar Observação (Preenchida)" : "Adicionar Observação"}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            </td>

                            {/* SEGURADOS SECTION (COMPLEMENTAR) */}
                            <td className="p-2 px-4 min-w-[140px]">
                              <div className="min-h-[1.5rem] flex items-center">
                                <input
                                  type="text"
                                  disabled={role !== "master" && role !== "admin"}
                                  className="bg-transparent border-none p-0 text-[10px] font-bold text-gray-600 w-full focus:ring-0 outline-none leading-tight disabled:opacity-75"
                                  value={
                                    compSegData && tempGrcp[compSegData.id] !== undefined
                                      ? tempGrcp[compSegData.id]
                                      : (compSegData?.identificacaoGrcp || "")
                                  }
                                  placeholder={role === "master" || role === "admin" ? "Identificação..." : "---"}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (compSegData) {
                                      setTempGrcp((prev) => ({
                                        ...prev,
                                        [compSegData.id]: val,
                                      }));
                                      handleInlineUpdate(
                                        compSegData.id,
                                        "identificacaoGrcp",
                                        val,
                                        600,
                                      );
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value;
                                    if (compSegData) {
                                      flushInlineUpdate(
                                        compSegData.id,
                                        "identificacaoGrcp",
                                        val,
                                      );
                                      setTempGrcp((prev) => {
                                        const next = { ...prev };
                                        delete next[compSegData.id];
                                        return next;
                                      });
                                    } else if (val.trim()) {
                                      handleInlineOrCreate(
                                        dept.id,
                                        "segurado",
                                        compSegData,
                                        "identificacaoGrcp",
                                        val,
                                        comp.id,
                                        comp.descricao,
                                      );
                                    }
                                  }}
                                />
                              </div>
                            </td>
                            <td className="p-2 px-4 min-w-[100px]">
                              <div className="flex items-center gap-0.5">
                                <span className="font-black text-gray-900 text-[10px]">
                                  R$
                                </span>
                                <input
                                  type="text"
                                  disabled={role !== "master" && role !== "admin"}
                                  className="bg-transparent border-none p-0 font-black text-gray-900 w-full focus:ring-0 text-[10px] disabled:opacity-75"
                                  value={
                                    compSegData && tempValues[compSegData.id] !== undefined
                                      ? tempValues[compSegData.id]
                                      : compSegData
                                        ? formatBRL(compSegData.valor)
                                        : ""
                                  }
                                  placeholder="0,00"
                                  onFocus={() => {
                                    if (compSegData) {
                                      setTempValues((prev) => ({
                                        ...prev,
                                        [compSegData.id]: formatBRL(compSegData.valor),
                                      }));
                                    }
                                  }}
                                  onChange={(e) => {
                                    const typed = e.target.value;
                                    if (compSegData) {
                                      setTempValues((prev) => ({
                                        ...prev,
                                        [compSegData.id]: typed,
                                      }));
                                      const numVal = parseBRLToFloat(typed);
                                      handleInlineUpdate(
                                        compSegData.id,
                                        "valor",
                                        numVal,
                                        600,
                                      );
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const typed =
                                      compSegData && tempValues[compSegData.id] !== undefined
                                        ? tempValues[compSegData.id]
                                        : e.target.value;
                                    const numVal = parseBRLToFloat(typed);
                                    if (compSegData) {
                                      flushInlineUpdate(compSegData.id, "valor", numVal);
                                      setTempValues((prev) => {
                                        const next = { ...prev };
                                        delete next[compSegData.id];
                                        return next;
                                      });
                                    } else if (numVal > 0) {
                                      handleInlineOrCreate(
                                        dept.id,
                                        "segurado",
                                        compSegData,
                                        "valor",
                                        numVal,
                                        comp.id,
                                        comp.descricao,
                                      );
                                    }
                                  }}
                                />
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              {compSegData?.urlGuia ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => openDocument(compSegData.urlGuia, compSegData.id, true, compSegData.onedriveGuiaId)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
                                      compSegData.urlGuia?.includes("firebasestorage")
                                        ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                        : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                                    }`}
                                    title={
                                      compSegData.urlGuia?.includes("firebasestorage")
                                        ? "Visualizar Guia Local"
                                        : "Visualizar Guia no OneDrive"
                                    }
                                  >
                                    {compSegData.urlGuia?.includes("firebasestorage") ? (
                                      <FileText className="w-4 h-4" />
                                    ) : (
                                      <Cloud className="w-4 h-4 text-indigo-500" />
                                    )}
                                  </button>
                                  {(role === "master" || role === "admin") && (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteGuia(compSegData.id)}
                                        className="w-4 h-4 text-rose-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                        title="Deletar Lançamento"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(compSegData, `${dept.nome} (${comp.descricao})`, "guia")}
                                        className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                        title="Editar Descrição / Valor"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                (role === "master" || role === "admin") ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() =>
                                        triggerUpload(dept.id, "segurado", "guia", comp.id, comp.descricao)
                                      }
                                      className="w-8 h-8 bg-white text-rose-400 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-dashed border-rose-200 shadow-2xs"
                                      title="Upload Guia Complementar"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                    {dept.onedriveFolderId && (
                                      <button
                                        onClick={() =>
                                          setOneDrivePickContext({
                                            deptId: dept.id,
                                            deptNome: `${dept.nome} (${comp.descricao})`,
                                            tipo: "segurado",
                                            target: "guia",
                                            complementarId: comp.id,
                                            descricaoFolha: comp.descricao,
                                          })
                                        }
                                        className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                        title="Vincular Guia Complementar do OneDrive"
                                      >
                                        <Cloud size={14} />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400 select-none">Pendente</span>
                                )
                              )}
                            </td>
                            <td className="p-2 text-center">
                              {compSegData?.urlComprovante ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => openDocument(compSegData.urlComprovante, compSegData.id, false, compSegData.onedriveComprovanteId)}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border shadow-xs ${
                                      compSegData.urlComprovante?.includes("firebasestorage")
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                                        : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                                    }`}
                                    title={
                                      compSegData.urlComprovante?.includes("firebasestorage")
                                        ? "Visualizar Comprovante Local"
                                        : "Visualizar Comprovante no OneDrive"
                                    }
                                  >
                                    {compSegData.urlComprovante?.includes("firebasestorage") ? (
                                      <CheckCircle className="w-4.5 h-4.5" />
                                    ) : (
                                      <Cloud className="w-4 h-4 text-indigo-500" />
                                    )}
                                  </button>
                                  {(role === "master" || role === "admin") && (
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          askConfirmation(
                                            "Remover Comprovante",
                                            "Deseja realmente remover o comprovante de pagamento deste registro?",
                                            "danger",
                                            async () => {
                                              try {
                                                await updateDoc(
                                                  doc(db, "guias", compSegData.id),
                                                  {
                                                    urlComprovante: null,
                                                    onedriveComprovanteId: null,
                                                    status: "pendente",
                                                  },
                                                );
                                                setGuias((prev) =>
                                                  prev.map((g) =>
                                                    g.id === compSegData.id
                                                      ? {
                                                          ...g,
                                                          urlComprovante: undefined,
                                                          onedriveComprovanteId: undefined,
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
                                        className="w-4 h-4 text-gray-300 hover:text-rose-600 transition-colors flex items-center justify-center"
                                        title="Desvincular Comprovante"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(compSegData, `${dept.nome} (${comp.descricao})`, "comprovante")}
                                        className="w-4 h-4 text-gray-400 hover:text-blue-600 transition-colors flex items-center justify-center"
                                        title="Editar Descrição / Valor"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                (role === "master" || role === "admin") ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() =>
                                        triggerUpload(dept.id, "segurado", "comprovante", comp.id, comp.descricao)
                                      }
                                      className="w-7 h-7 bg-white hover:bg-gray-100 border border-dashed border-rose-200 rounded-lg flex items-center justify-center"
                                      title="Upload Comprovante Complementar"
                                    >
                                      <Upload className="w-3.5 h-3.5 text-rose-400 hover:text-gray-650" />
                                    </button>
                                    {dept.onedriveFolderId && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setOneDrivePickContext({
                                            deptId: dept.id,
                                            deptNome: `${dept.nome} (${comp.descricao})`,
                                            tipo: "segurado",
                                            target: "comprovante",
                                            complementarId: comp.id,
                                            descricaoFolha: comp.descricao,
                                          })
                                        }
                                        className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all border border-emerald-200"
                                        title="Vincular Comprovante Complementar do OneDrive"
                                      >
                                        <Cloud size={12} />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400 select-none">—</span>
                                )
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setObsModalConfig({
                                    isOpen: true,
                                    guiaId: compSegData?.id || null,
                                    deptId: dept.id,
                                    departamentoNome: `${dept.nome} (${comp.descricao})`,
                                    tipo: "segurado",
                                    text: compSegData?.observacao || "",
                                    complementarId: comp.id,
                                    descricaoFolha: comp.descricao,
                                  })
                                }
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border mx-auto ${
                                  compSegData?.observacao
                                    ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                                    : "bg-white text-gray-400 border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                                }`}
                                title={compSegData?.observacao ? "Ver/Editar Observação (Preenchida)" : "Adicionar Observação"}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
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
                .reduce((acc, g) => acc + (g.valor || 0), 0)
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
                .reduce((acc, g) => acc + (g.valor || 0), 0)
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

      {/* Observation Dialog Modal */}
      <AnimatePresence>
        {obsModalConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-black uppercase tracking-widest mb-2 border border-amber-200">
                    Observação {obsModalConfig.tipo === "patronal" ? "Patronal" : "Segurado"}
                  </span>
                  <h3 className="text-xl font-black tracking-tight text-gray-900 leading-none">
                    {obsModalConfig.departamentoNome}
                  </h3>
                  <p className="text-gray-400 font-bold text-[9px] uppercase tracking-widest mt-1">
                    Referência: {new Date(2024, mesReferencia - 1).toLocaleString("pt-BR", { month: "long" })} / {anoFiscal}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setObsModalConfig(null)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-900"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                    Texto da Observação
                  </label>
                  <textarea
                    rows={5}
                    disabled={role !== "master" && role !== "admin"}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs font-medium text-gray-700 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none transition-all disabled:opacity-75"
                    placeholder={(role === "master" || role === "admin") ? "Digite a observação para esta guia..." : "Sem observação preenchida."}
                    value={obsModalConfig.text}
                    onChange={(e) =>
                      setObsModalConfig((prev) =>
                        prev ? { ...prev, text: e.target.value } : null
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setObsModalConfig(null)}
                  className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  {(role === "master" || role === "admin") ? "Cancelar" : "Fechar"}
                </button>
                {(role === "master" || role === "admin") && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveObservation(
                        obsModalConfig.guiaId,
                        obsModalConfig.deptId,
                        obsModalConfig.tipo,
                        obsModalConfig.text,
                        obsModalConfig.complementarId,
                        obsModalConfig.descricaoFolha,
                      )
                    }
                    className="px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all"
                  >
                    Salvar
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                  <h3 className="text-lg font-black italic tracking-tighter text-gray-900 leading-none uppercase">
                    Vincular do OneDrive
                  </h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">
                    {oneDrivePickContext.deptNome ? `${oneDrivePickContext.deptNome} • ` : ""}Escolha o arquivo PDF para vincular
                  </p>
                </div>
                <button
                  onClick={() => setOneDrivePickContext(null)}
                  className="text-gray-400 hover:text-black"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <OneDriveExplorer
                persistenceKey={oneDrivePickContext.target}
                initialFolderId={
                  departamentos.find((d) => d.id === oneDrivePickContext.deptId)
                    ?.onedriveFolderId
                }
                onSelectFile={async (file) => {
                  if (file.folder) return;

                  try {
                    setLoading(true);
                    
                    const existingGuia = getGuiaData(
                      oneDrivePickContext.deptId,
                      oneDrivePickContext.tipo,
                      oneDrivePickContext.complementarId,
                    );

                    const urlFieldName =
                      oneDrivePickContext.target === "guia"
                        ? "urlGuia"
                        : "urlComprovante";

                    const idFieldName =
                      oneDrivePickContext.target === "guia"
                        ? "onedriveGuiaId"
                        : "onedriveComprovanteId";

                    // Obter link de compartilhamento seguro para evitar navegação para pastas superiores no OneDrive
                    let fileUrl = file.webUrl;
                    try {
                      const shareLink = await onedriveService.createShareLink(file.id);
                      if (shareLink) fileUrl = shareLink;
                    } catch (shareErr) {
                      console.warn("Não foi possível gerar link anônimo seguro, usando clássico:", shareErr);
                    }

                    const payload: any = {
                      [urlFieldName]: fileUrl, // Link de visualização seguro do OneDrive
                      [idFieldName]: file.id, // ID definitivo do item OneDrive
                      updatedAt: serverTimestamp(),
                    };

                    if (oneDrivePickContext.target === "comprovante") {
                      payload.status = "pago";
                    }

                    if (existingGuia) {
                      await updateDoc(
                        doc(db, "guias", existingGuia.id),
                        payload,
                      );
                      setGuias((prev) =>
                        prev.map((g) =>
                          g.id === existingGuia.id
                            ? normalizeGuia({ ...g, ...payload })
                            : g,
                        ),
                      );
                    } else {
                      const newDoc = {
                        departamentoId: oneDrivePickContext.deptId,
                        tipo: oneDrivePickContext.tipo,
                        mes: mesReferencia,
                        ano: anoFiscal,
                        regime: activeRegime,
                        tipoFolha: oneDrivePickContext.complementarId ? "complementar" : "normal",
                        complementarId: oneDrivePickContext.complementarId || null,
                        descricaoFolha:
                          oneDrivePickContext.descricaoFolha ||
                          (oneDrivePickContext.complementarId
                            ? "Folha Complementar"
                            : "Folha Normal"),
                        nome: file.name.split(".")[0],
                        valor: 0,
                        valorPago: 0,
                        status: oneDrivePickContext.target === "comprovante" ? "pago" : "pendente",
                        identificacaoGrcp: `GRCP-OD-${Date.now()}`,
                        vencimento: new Date(anoFiscal, mesReferencia, 0)
                          .toISOString()
                          .split("T")[0],
                        [urlFieldName]: fileUrl,
                        [idFieldName]: file.id, // ID definitivo do item OneDrive
                        createdAt: serverTimestamp(),
                      };
                      const docRef = await addDoc(
                        collection(db, "guias"),
                        newDoc,
                      );
                      setGuias((prev) => [
                        ...prev,
                        normalizeGuia({ id: docRef.id, ...newDoc }),
                      ]);
                    }

                    setOneDrivePickContext(null);
                    showAlert(
                      "Sucesso",
                      "Arquivo vinculado com sucesso!",
                      "success",
                    );
                  } catch (err) {
                    console.error(err);
                    showAlert(
                      "Erro",
                      "Não foi possível vincular o arquivo.",
                      "danger",
                    );
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
                  <h3 className="text-xl font-black italic tracking-tighter text-gray-900 leading-none">
                    CONFERÊNCIA DE DADOS
                  </h3>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">
                    GESTÃO GLOBAL DE GUIAS
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

        {/* MODAL DE EDIÇÃO DE DESCRIÇÃO E VALOR */}
        {editGuiaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                  <Pencil className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 tracking-tight">
                    Editar Lançamento
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {editGuiaModal.deptNome} • <span className="capitalize">{editGuiaModal.tipo}</span> ({editGuiaModal.target === "guia" ? "Guia" : "Comprovante"})
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                    Descrição da Folha / Lançamento
                  </label>
                  <input
                    type="text"
                    value={editGuiaModal.descricaoFolha}
                    onChange={(e) =>
                      setEditGuiaModal((prev) =>
                        prev ? { ...prev, descricaoFolha: e.target.value } : null,
                      )
                    }
                    placeholder="Ex: Folha Mensal, Folha Complementar 1, etc."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 font-bold focus:bg-white focus:border-blue-500 focus:outline-hidden transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                    Identificação GRCP
                  </label>
                  <input
                    type="text"
                    value={editGuiaModal.identificacaoGrcp}
                    onChange={(e) =>
                      setEditGuiaModal((prev) =>
                        prev ? { ...prev, identificacaoGrcp: e.target.value } : null,
                      )
                    }
                    placeholder="Ex: GRCP 123456"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 font-medium focus:bg-white focus:border-blue-500 focus:outline-hidden transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                    Valor (R$)
                  </label>
                  <input
                    type="text"
                    value={editGuiaModal.valorStr}
                    onChange={(e) =>
                      setEditGuiaModal((prev) =>
                        prev ? { ...prev, valorStr: handleBRLChange(e.target.value) } : null,
                      )
                    }
                    placeholder="0,00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 font-mono font-bold focus:bg-white focus:border-blue-500 focus:outline-hidden transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setEditGuiaModal(null)}
                  className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditGuia}
                  className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all"
                >
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* MODAL DE EDIÇÃO DE DESCRIÇÃO DE FOLHA COMPLEMENTAR (RASCUNHO) */}
        {editDraftCompModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
                  <Pencil className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 tracking-tight">
                    Editar Folha Complementar
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Defina o rótulo de identificação desta folha
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                  Descrição da Folha
                </label>
                <input
                  type="text"
                  value={editDraftCompModal.descricao}
                  onChange={(e) =>
                    setEditDraftCompModal((prev) =>
                      prev ? { ...prev, descricao: e.target.value } : null,
                    )
                  }
                  placeholder="Ex: Folha Complementar 1"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 font-bold focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => setEditDraftCompModal(null)}
                  className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraftComplementar}
                  className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:shadow-lg transition-all"
                >
                  Salvar Descrição
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <RelatorioGuiasModal
        isOpen={isRelatorioOpen}
        onClose={() => setIsRelatorioOpen(false)}
        secretarias={secretarias}
        departamentos={departamentos}
        guias={guias}
        mesReferencia={mesReferencia}
        anoFiscal={anoFiscal}
      />
    </div>
  );
}
