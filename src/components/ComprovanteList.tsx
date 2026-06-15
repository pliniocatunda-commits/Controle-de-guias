import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  getDocs,
  orderBy,
  limit,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import { Comprovante, Guia } from "../types";
import {
  FileCheck,
  Calendar,
  DollarSign,
  Search,
  ArrowLeft,
  Download,
  Eye,
  Filter,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { onedriveService, extractOneDriveItemId } from "../services/onedriveService";
// Removido import do Cloudinary pois agora usamos Firebase Storage direto

export default function ComprovanteList() {
  const [comprovantes, setComprovantes] = useState<
    (Comprovante & { mes?: number; ano?: number; guia?: Guia })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMes, setSelectedMes] = useState<number | "todos">("todos");
  const [selectedAno, setSelectedAno] = useState<number | "todos">("todos");

  const openDocument = async (url: string | undefined, docId?: string, onedriveId?: string) => {
    if (!url) return;
    
    let targetUrl = url;
    try {
      const resolvedUrl = await onedriveService.getDownloadUrl(url, onedriveId);
      if (resolvedUrl) {
        targetUrl = resolvedUrl;
      }
    } catch (e) {
      console.warn("Falha ao obter URL limpa de download do OneDrive:", e);
    }

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
    link.download = filename || "documento.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const compSnapshot = await getDocs(
          query(collection(db, "comprovantes"), orderBy("createdAt", "desc")),
        );
        const compData = compSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Comprovante,
        );

        // Fetch related guias for names
        const guiasSnapshot = await getDocs(collection(db, "guias"));
        const guiasData = guiasSnapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Guia,
        );
        const guiasMap = new Map(guiasData.map((g) => [g.id, g]));

        const enriched = compData.map((c) => {
          const linkedGuia = c.guiaId ? guiasMap.get(c.guiaId) : undefined;

          let mes = c.mes;
          let ano = c.ano;
          if (!mes && linkedGuia) mes = linkedGuia.mes;
          if (!ano && linkedGuia) ano = linkedGuia.ano;
          if (!mes && c.dataPagamento) {
            try {
              mes = new Date(c.dataPagamento).getMonth() + 1;
            } catch (e) {}
          }
          if (!ano && c.dataPagamento) {
            try {
              ano = new Date(c.dataPagamento).getFullYear();
            } catch (e) {}
          }

          return {
            ...c,
            mes,
            ano,
            guia: linkedGuia,
            urlOriginal: c.urlComprovante || (c as any).urlOriginal,
          };
        });

        // Collect existing urls from actual comprovantes to avoid showing duplicate entries in the same portal
        const existingUrls = new Set(
          compData
            .map((c) => c.urlComprovante || (c as any).urlOriginal)
            .filter(Boolean),
        );

        // Generate virtual ones for any guias that already have a linked receipt URL
        const virtualComps = guiasData
          .filter(
            (g) => g.urlComprovante && !existingUrls.has(g.urlComprovante),
          )
          .map((g) => {
            return {
              id: `virtual-${g.id}`,
              guiaId: g.id,
              mes: g.mes,
              ano: g.ano,
              dataPagamento:
                g.vencimento || new Date().toISOString().split("T")[0],
              valorPago: g.valorPago || g.valor || 0,
              urlComprovante: g.urlComprovante!,
              urlOriginal: g.urlComprovante!,
              observacoes: `Guia de Recolhimento (${g.tipo === "patronal" ? "Patronal" : "Segurado"}) vinculada e paga`,
              createdAt: g.createdAt || null,
              guia: g,
            };
          });

        const allComps = [...enriched, ...virtualComps];

        // Sort combined list by date (createdAt desc or fallback helper)
        allComps.sort((a, b) => {
          const dateA = a.createdAt?.toDate
            ? a.createdAt.toDate()
            : a.createdAt
              ? new Date(a.createdAt)
              : new Date(a.dataPagamento);
          const dateB = b.createdAt?.toDate
            ? b.createdAt.toDate()
            : b.createdAt
              ? new Date(b.createdAt)
              : new Date(b.dataPagamento);
          return dateB.getTime() - dateA.getTime();
        });

        setComprovantes(allComps);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filtered = comprovantes.filter((c) => {
    const matchSearch =
      c.guia?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.observacoes?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchMes = selectedMes === "todos" || c.mes === selectedMes;
    const matchAno = selectedAno === "todos" || c.ano === selectedAno;

    return matchSearch && matchMes && matchAno;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-black tracking-tight text-gray-900">
          Arquivo de Comprovantes
        </h1>
        <p className="text-gray-500 font-medium mt-2">
          Histórico completo de pagamentos validados por IA.
        </p>
      </header>

      <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center gap-4 bg-gray-50/30">
          <div className="flex-1 flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-sm focus-within:ring-2 focus-within:ring-black transition-all">
            <Search className="w-5 h-5 text-gray-300" />
            <input
              type="text"
              placeholder="Buscar por nome da guia ou observação..."
              className="bg-transparent border-none focus:ring-0 text-sm w-full font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Mês Select */}
            <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2 text-xs font-bold text-gray-600">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400 font-medium">Mês:</span>
              <select
                value={selectedMes}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMes(val === "todos" ? "todos" : Number(val));
                }}
                className="bg-transparent border-none p-0 text-xs font-black text-gray-950 focus:ring-0 cursor-pointer uppercase"
              >
                <option value="todos">Todos</option>
                <option value="1">Janeiro</option>
                <option value="2">Fevereiro</option>
                <option value="3">Março</option>
                <option value="4">Abril</option>
                <option value="5">Maio</option>
                <option value="6">Junho</option>
                <option value="7">Julho</option>
                <option value="8">Agosto</option>
                <option value="9">Setembro</option>
                <option value="10">Outubro</option>
                <option value="11">Novembro</option>
                <option value="12">Dezembro</option>
              </select>
            </div>

            {/* Ano Select */}
            <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-2 text-xs font-bold text-gray-600">
              <span className="text-gray-400 font-medium">Ano:</span>
              <select
                value={selectedAno}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedAno(val === "todos" ? "todos" : Number(val));
                }}
                className="bg-transparent border-none p-0 text-xs font-black text-gray-950 focus:ring-0 cursor-pointer"
              >
                <option value="todos">Todos</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="space-y-0 divide-y divide-gray-100">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-6 flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-gray-200/60 rounded-2xl shrink-0" />
                    <div className="space-y-2">
                      <div className="h-4.5 w-48 bg-gray-200 rounded" />
                      <div className="h-3 w-80 bg-gray-105 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-9 h-9 bg-gray-250/50 rounded-xl" />
                    <div className="w-9 h-9 bg-gray-250/50 rounded-xl" />
                    <div className="w-9 h-9 bg-gray-250/50 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-24 text-center">
              <FileCheck className="w-16 h-16 mx-auto text-gray-100 mb-4" />
              <p className="text-gray-400 font-bold">
                Nenhum comprovante encontrado.
              </p>
            </div>
          ) : (
            filtered.map((comp) => (
              <motion.div
                key={comp.id}
                whileHover={{ backgroundColor: "#fafafa" }}
                className="p-6 flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-black text-gray-900 group-hover:text-black">
                        {comp.guia?.nome || "Pagamento Avulso"}
                      </h4>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                        VALIDADO
                      </span>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-500" /> R${" "}
                        {(comp.valorPago || 0).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-sm font-medium text-gray-400 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />{" "}
                        {(() => {
                          try {
                            if (!comp.dataPagamento) return "Pago";
                            // Normalize format by checking if it contains timezone/T
                            const parseDate =
                              comp.dataPagamento.includes("H") ||
                              comp.dataPagamento.includes("-")
                                ? new Date(comp.dataPagamento)
                                : new Date(comp.dataPagamento + "T00:00:00");

                            if (isNaN(parseDate.getTime())) {
                              return `Pago: ${comp.dataPagamento}`;
                            }
                            return `Pago em ${format(parseDate, "dd/MM/yyyy")}`;
                          } catch (e) {
                            return `Pago: ${comp.dataPagamento || "Não especificado"}`;
                          }
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {comp.urlComprovante || comp.urlOriginal ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDocument(comp.urlComprovante || comp.urlOriginal, comp.id, comp.onedriveComprovanteId);
                      }}
                      className="p-3 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-all shadow-sm bg-white border border-gray-50 flex items-center justify-center cursor-pointer"
                      title="Visualizar Comprovante"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-3 text-gray-400 hover:text-gray-300 rounded-xl transition-all bg-white border border-gray-50 flex items-center justify-center cursor-not-allowed"
                      title="Nenhum comprovante anexado"
                      disabled
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadDocument(
                        comp.urlComprovante || comp.urlOriginal,
                        `comprovante-${comp.id}.pdf`,
                      );
                    }}
                    className="p-3 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-all shadow-sm bg-white border border-gray-50"
                    title="Baixar Arquivo"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <footer className="mt-8 text-center">
        <p className="text-xs text-gray-400 font-medium italic">
          Exibindo {filtered.length} comprovantes processados.
        </p>
      </footer>
    </div>
  );
}
