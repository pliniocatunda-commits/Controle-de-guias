import React from "react";
import { Guia, Departamento, Secretaria } from "../types";
import { X, Printer, FileSpreadsheet, Eye, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
// @ts-ignore
import logoImg from "@/logo-ipme.png";

interface RelatorioGuiasModalProps {
  isOpen: boolean;
  onClose: () => void;
  secretarias: Secretaria[];
  departamentos: Departamento[];
  guias: Guia[];
  mesReferencia: number;
  anoFiscal: number;
}

const obterNomeMes = (mesNum: number): string => {
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return meses[mesNum - 1] || "";
};

const formatBRLValue = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return "0,00";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export default function RelatorioGuiasModal({
  isOpen,
  onClose,
  secretarias,
  departamentos,
  guias,
  mesReferencia,
  anoFiscal,
}: RelatorioGuiasModalProps) {
  if (!isOpen) return null;

  // Helpers to fetch filtered guides
  const getGuiaData = (deptId: string, tipo: "patronal" | "segurado", regime: "capitalizado" | "financeiro") => {
    return guias.find(
      (g) =>
        g.departamentoId === deptId &&
        g.tipo === tipo &&
        (g.regime || "capitalizado") === regime
    );
  };

  // Calculations for both regimes
  const calculateTotals = (regime: "capitalizado" | "financeiro") => {
    let patronal = 0;
    let segurado = 0;

    departamentos.forEach((dept) => {
      const pat = getGuiaData(dept.id, "patronal", regime);
      const seg = getGuiaData(dept.id, "segurado", regime);
      patronal += pat?.valor || 0;
      segurado += seg?.valor || 0;
    });

    return {
      patronal,
      segurado,
      total: patronal + segurado,
    };
  };

  const totalsCap = calculateTotals("capitalizado");
  const totalsFin = calculateTotals("financeiro");
  const grandTotal = totalsCap.total + totalsFin.total;

  // Export spreadsheet: CSV with semicolon separation and Portuguese localized decimals
  const exportToCSV = () => {
    let csv = "\uFEFF"; // UTF-8 BOM so Microsoft Excel can import accented letters properly
    const mesStr = obterNomeMes(mesReferencia).toUpperCase();

    csv += `RELATÓRIO CONSOLIDADO DE GUIAS DE RECOLHIMENTO;;\n`;
    csv += `MÊS/ANO DE CONFERÊNCIA:;${mesStr} / ${anoFiscal};;\n`;
    csv += `EMISSÃO:;${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")};;\n\n`;

    // 1. REGIME CAPITALIZADO SECTION
    csv += `1. REGIME CAPITALIZADO\n`;
    csv += `Secretaria;Departamento;GRCP Patronal;Valor Patronal;Status Patronal;GRCP Segurado;Valor Segurado;Status Segurado;Total Depto\n`;

    departamentos.forEach((dept) => {
      const sec = secretarias.find((s) => s.id === dept.secretariaId);
      const pat = getGuiaData(dept.id, "patronal", "capitalizado");
      const seg = getGuiaData(dept.id, "segurado", "capitalizado");

      const patVal = pat?.valor || 0;
      const segVal = seg?.valor || 0;
      const sumVal = patVal + segVal;

      const secName = sec ? (sec.sigla || sec.nome) : "N/D";
      const patStatus = pat ? (pat.status === "pago" ? "Pago" : "Pendente") : "Pendente";
      const segStatus = seg ? (seg.status === "pago" ? "Pago" : "Pendente") : "Pendente";

      csv += `"${secName.replace(/"/g, '""')}";"${dept.nome.replace(/"/g, '""')}";"${pat?.identificacaoGrcp || "—"}";"${formatBRLValue(patVal)}";"${patStatus}";"${seg?.identificacaoGrcp || "—"}";"${formatBRLValue(segVal)}";"${segStatus}";"${formatBRLValue(sumVal)}"\n`;
    });

    csv += `TOTAL REGIME CAPITALIZADO;;;"${formatBRLValue(totalsCap.patronal)}";;;"${formatBRLValue(totalsCap.segurado)}";;"${formatBRLValue(totalsCap.total)}"\n\n`;

    // 2. REGIME FINANCEIRO SECTION
    csv += `2. REGIME FINANCEIRO\n`;
    csv += `Secretaria;Departamento;GRCP Patronal;Valor Patronal;Status Patronal;GRCP Segurado;Valor Segurado;Status Segurado;Total Depto\n`;

    departamentos.forEach((dept) => {
      const sec = secretarias.find((s) => s.id === dept.secretariaId);
      const pat = getGuiaData(dept.id, "patronal", "financeiro");
      const seg = getGuiaData(dept.id, "segurado", "financeiro");

      const patVal = pat?.valor || 0;
      const segVal = seg?.valor || 0;
      const sumVal = patVal + segVal;

      const secName = sec ? (sec.sigla || sec.nome) : "N/D";
      const patStatus = pat ? (pat.status === "pago" ? "Pago" : "Pendente") : "Pendente";
      const segStatus = seg ? (seg.status === "pago" ? "Pago" : "Pendente") : "Pendente";

      csv += `"${secName.replace(/"/g, '""')}";"${dept.nome.replace(/"/g, '""')}";"${pat?.identificacaoGrcp || "—"}";"${formatBRLValue(patVal)}";"${patStatus}";"${seg?.identificacaoGrcp || "—"}";"${formatBRLValue(segVal)}";"${segStatus}";"${formatBRLValue(sumVal)}"\n`;
    });

    csv += `TOTAL REGIME FINANCEIRO;;;"${formatBRLValue(totalsFin.patronal)}";;;"${formatBRLValue(totalsFin.segurado)}";;"${formatBRLValue(totalsFin.total)}"\n\n`;

    // 3. CONSOLIDATED SUMMARY
    csv += `RESUMO GERAL CONSOLIDADO\n`;
    csv += `Regime;Total Patronal;Total Segurado;Total Geral\n`;
    csv += `Capitalizado;"${formatBRLValue(totalsCap.patronal)}";"${formatBRLValue(totalsCap.segurado)}";"${formatBRLValue(totalsCap.total)}"\n`;
    csv += `Financeiro;"${formatBRLValue(totalsFin.patronal)}";"${formatBRLValue(totalsFin.segurado)}";"${formatBRLValue(totalsFin.total)}"\n`;
    csv += `TOTAL GERAL CONSOLIDADO;"${formatBRLValue(totalsCap.patronal + totalsFin.patronal)}";"${formatBRLValue(totalsCap.segurado + totalsFin.segurado)}";"${formatBRLValue(grandTotal)}"\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_consolidado_guias_${mesReferencia}_${anoFiscal}.csv`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF: Dual reliability printing strategy (Window open + sandboxed iframe fallback)
  const exportPDF = () => {
    const mesStr = obterNomeMes(mesReferencia).toUpperCase();
    const dataEmissao = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium"
    }).format(new Date());

    // Construct highly-polished, printable HTML report view
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>GestiPrev - Relatório de Guias</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@450;600;800&display=swap');
          
          @page {
            size: auto;
            margin: 0;
            margin-bottom: 22mm;
          }
          
          @page {
            @bottom-left {
              content: "GestiPrev - Sistema de Gestão Previdenciária © ${new Date().getFullYear()} | Desenvolvido por LPC";
              font-family: 'Inter', sans-serif;
              font-size: 7.5px;
              color: #94a3b8;
              text-transform: uppercase;
              font-weight: 600;
              letter-spacing: 0.05em;
              padding-left: 15mm;
              padding-top: 6px;
              vertical-align: top;
            }
            @bottom-right {
              content: "Página " counter(page);
              font-family: 'Inter', sans-serif;
              font-size: 7.5px;
              color: #94a3b8;
              text-transform: uppercase;
              font-weight: 600;
              letter-spacing: 0.05em;
              padding-right: 15mm;
              padding-top: 6px;
              vertical-align: top;
            }
          }
          
          body {
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            background-color: #fff;
            margin: 0;
            padding: 0;
            font-size: 10px;
            line-height: 1.35;
            box-sizing: border-box;
          }
          
          /* Master Layout Table for dynamic paged headers/footers spacing */
          .master-table {
            width: 100%;
            border-collapse: collapse;
            border: none;
            margin: 0;
            padding: 0;
          }
          .master-table > thead > tr > td {
            height: 28mm; /* Reserved height for fixed header */
            padding: 0;
            border: none;
          }
          .master-table > tfoot > tr > td {
            height: 4mm; /* Spacing key to prevent content overlapping the footer line */
            padding: 0;
            border: none;
          }
          .master-table > tbody > tr > td {
            padding: 0;
            border: none;
            vertical-align: top;
          }
          
          header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 28mm;
            padding: 12mm 15mm 0 15mm;
            background-color: #fff;
            z-index: 1000;
            box-sizing: border-box;
          }
          .header-content {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .title-container h1 {
            font-size: 15px;
            font-weight: 800;
            letter-spacing: -0.025em;
            text-transform: uppercase;
            margin: 0;
            color: #0f172a;
          }
          .title-container p {
            font-size: 8.5px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.1em;
            margin: 4px 0 0 0;
          }
          .meta-info {
            text-align: right;
            font-size: 8.5px;
            color: #64748b;
          }
          .meta-info strong {
            color: #0f172a;
          }
          
          footer {
            position: fixed;
            bottom: 0;
            left: 15mm;
            right: 15mm;
            border-top: 1px solid #cbd5e1;
            z-index: 1000;
          }
          
          .report-content {
            padding: 2mm 15mm;
            box-sizing: border-box;
          }
          
          .regime-header {
            font-size: 11px;
            font-weight: 800;
            color: #0f172a;
            margin: 15px 0 6px 0;
            padding-bottom: 3px;
            border-bottom: 1px solid #e2e8f0;
            text-transform: uppercase;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          .data-table th, .summary-table th {
            background-color: #f8fafc;
            font-weight: 800;
            text-transform: uppercase;
            font-size: 8px;
            letter-spacing: 0.05em;
            color: #475569;
            border: 1px solid #cbd5e1;
            padding: 5px 6px;
            text-align: left;
          }
          .data-table td, .summary-table td {
            border: 1px solid #e2e8f0;
            padding: 4px 6px;
            text-align: left;
          }
          .center {
            text-align: center;
          }
          .right {
            text-align: right;
          }
          .font-medium {
            font-weight: 600;
          }
          .bg-grey {
            background-color: #f1f5f9;
          }
          .status-badge {
            display: inline-block;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          .status-pago {
            background-color: #dcfce7;
            color: #15803d;
          }
          .status-pendente {
            background-color: #fef3c7;
            color: #b45309;
          }
          .total-row {
            background-color: #f8fafc;
            font-weight: 800;
            color: #0f172a;
          }
          .dept-badge {
            background-color: #eff6ff;
            color: #1d4ed8;
            padding: 1px 3px;
            border-radius: 2px;
            font-size: 7.5px;
            font-weight: 800;
            text-transform: uppercase;
            margin-right: 4px;
          }
          .summary-card {
            background-color: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px;
            margin-top: 15px;
            page-break-inside: avoid;
          }
          .summary-card h3 {
            margin: 0 0 6px 0;
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            color: #0f172a;
          }
          .summary-table th {
            background-color: #f1f5f9;
          }
          @media print {
            .page-break {
              page-break-before: always;
            }
          }
        </style>
      </head>
      <body>
        <!-- Fixed Header -->
        <header>
          <div class="header-content" style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${logoImg}" style="height: 48px; width: auto; object-fit: contain; flex-shrink: 0;" />
              <div class="title-container">
                <h1>Relatório Consolidado de Guias</h1>
                <p>SISTEMA GESTIPREV DE GESTÃO PREVIDENCIÁRIA</p>
              </div>
            </div>
            <div class="meta-info">
              Referência: <strong>${mesStr} / ${anoFiscal}</strong><br>
              Emissão: ${dataEmissao}
            </div>
          </div>
        </header>

        <!-- Fixed Footer Line (Text and page numbers printed dynamically via CSS Page Margin Boxes) -->
        <footer></footer>

        <!-- Master Layout Wrapper -->
        <table class="master-table">
          <thead>
            <tr><td></td></tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="report-content">
                  <!-- 1. REGIME CAPITALIZADO -->
                  <div class="regime-header">1. Regime Capitalizado</div>
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th style="width: 25%">DEPARTAMENTO / ORGÃO</th>
                        <th style="width: 15%">GRCP PATRONAL</th>
                        <th style="width: 13%" class="right">VALOR PATRONAL</th>
                        <th style="width: 10%" class="center">STATUS (PAT)</th>
                        <th style="width: 15%">GRCP SEGURADO</th>
                        <th style="width: 22%" class="right">VALOR SEGURADO</th>
                        <th style="width: 10%" class="center">STATUS (SEG)</th>
                      </tr>
                    </thead>
                    <tbody>
    `;

    // Add Capitalizado table entries Grouped by Secretaria
    departamentos.forEach((dept) => {
      const sec = secretarias.find((s) => s.id === dept.secretariaId);
      const pat = getGuiaData(dept.id, "patronal", "capitalizado");
      const seg = getGuiaData(dept.id, "segurado", "capitalizado");

      const patVal = pat?.valor || 0;
      const segVal = seg?.valor || 0;

      const secTag = sec ? `<span class="dept-badge">${sec.sigla || sec.nome}</span>` : "";
      const patBadge = pat ? `<span class="status-badge ${pat.status === "pago" ? "status-pago" : "status-pendente"}">${pat.status === "pago" ? "Pago" : "Pendente"}</span>` : `<span class="status-badge status-pendente">Pendente</span>`;
      const segBadge = seg ? `<span class="status-badge ${seg.status === "pago" ? "status-pago" : "status-pendente"}">${seg.status === "pago" ? "Pago" : "Pendente"}</span>` : `<span class="status-badge status-pendente">Pendente</span>`;

      htmlContent += `
        <tr>
          <td class="font-medium">${secTag}${dept.nome}</td>
          <td>${pat?.identificacaoGrcp || "—"}</td>
          <td class="right font-medium">R$ ${formatBRLValue(patVal)}</td>
          <td class="center">${patBadge}</td>
          <td>${seg?.identificacaoGrcp || "—"}</td>
          <td class="right font-medium">R$ ${formatBRLValue(segVal)}</td>
          <td class="center">${segBadge}</td>
        </tr>
      `;
    });

    htmlContent += `
          <tr class="total-row">
            <td>TOTAL REGIME CAPITALIZADO</td>
            <td>—</td>
            <td class="right">R$ ${formatBRLValue(totalsCap.patronal)}</td>
            <td class="center">—</td>
            <td>—</td>
            <td class="right">R$ ${formatBRLValue(totalsCap.segurado)}</td>
            <td class="center">—</td>
          </tr>
          <tr class="total-row bg-grey">
            <td colspan="5">SOMA TOTAL DO REGIME CAPITALIZADO</td>
            <td colspan="2" class="right" style="font-size: 11px; color: #1e3a8a;">R$ ${formatBRLValue(totalsCap.total)}</td>
          </tr>
        </tbody>
      </table>

      <!-- 2. REGIME FINANCEIRO -->
      <div class="regime-header">2. Regime Financeiro</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 25%">DEPARTAMENTO / ORGÃO</th>
            <th style="width: 15%">GRCP PATRONAL</th>
            <th style="width: 13%" class="right">VALOR PATRONAL</th>
            <th style="width: 10%" class="center">STATUS (PAT)</th>
            <th style="width: 15%">GRCP SEGURADO</th>
            <th style="width: 22%" class="right">VALOR SEGURADO</th>
            <th style="width: 10%" class="center">STATUS (SEG)</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Add Financeiro table entries
    departamentos.forEach((dept) => {
      const sec = secretarias.find((s) => s.id === dept.secretariaId);
      const pat = getGuiaData(dept.id, "patronal", "financeiro");
      const seg = getGuiaData(dept.id, "segurado", "financeiro");

      const patVal = pat?.valor || 0;
      const segVal = seg?.valor || 0;

      const secTag = sec ? `<span class="dept-badge">${sec.sigla || sec.nome}</span>` : "";
      const patBadge = pat ? `<span class="status-badge ${pat.status === "pago" ? "status-pago" : "status-pendente"}">${pat.status === "pago" ? "Pago" : "Pendente"}</span>` : `<span class="status-badge status-pendente">Pendente</span>`;
      const segBadge = seg ? `<span class="status-badge ${seg.status === "pago" ? "status-pago" : "status-pendente"}">${seg.status === "pago" ? "Pago" : "Pendente"}</span>` : `<span class="status-badge status-pendente">Pendente</span>`;

      htmlContent += `
        <tr>
          <td class="font-medium">${secTag}${dept.nome}</td>
          <td>${pat?.identificacaoGrcp || "—"}</td>
          <td class="right font-medium">R$ ${formatBRLValue(patVal)}</td>
          <td class="center">${patBadge}</td>
          <td>${seg?.identificacaoGrcp || "—"}</td>
          <td class="right font-medium">R$ ${formatBRLValue(segVal)}</td>
          <td class="center">${segBadge}</td>
        </tr>
      `;
    });

    htmlContent += `
          <tr class="total-row">
            <td>TOTAL REGIME FINANCEIRO</td>
            <td>—</td>
            <td class="right">R$ ${formatBRLValue(totalsFin.patronal)}</td>
            <td class="center">—</td>
            <td>—</td>
            <td class="right">R$ ${formatBRLValue(totalsFin.segurado)}</td>
            <td class="center">—</td>
          </tr>
          <tr class="total-row bg-grey">
            <td colspan="5">SOMA TOTAL DO REGIME FINANCEIRO</td>
            <td colspan="2" class="right" style="font-size: 11px; color: #1e3a8a;">R$ ${formatBRLValue(totalsFin.total)}</td>
          </tr>
        </tbody>
      </table>

      <!-- 3. RESUMO GERAL CONSOLIDADO -->
      <div class="summary-card">
        <h3>Resumo Geral das Guias de Recolhimento</h3>
        <table class="summary-table">
          <thead>
            <tr>
              <th>REGIME</th>
              <th class="right">TOTAL PATRONAL</th>
              <th class="right">TOTAL SEGURADOS</th>
              <th class="right">FUNDO DE PREVIDÊNCIA (TOTAL)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-medium">Capitalizado</td>
              <td class="right">R$ ${formatBRLValue(totalsCap.patronal)}</td>
              <td class="right">R$ ${formatBRLValue(totalsCap.segurado)}</td>
              <td class="right font-medium">R$ ${formatBRLValue(totalsCap.total)}</td>
            </tr>
            <tr>
              <td class="font-medium">Financeiro</td>
              <td class="right">R$ ${formatBRLValue(totalsFin.patronal)}</td>
              <td class="right">R$ ${formatBRLValue(totalsFin.segurado)}</td>
              <td class="right font-medium">R$ ${formatBRLValue(totalsFin.total)}</td>
            </tr>
            <tr class="total-row" style="font-size: 11px; background-color: #0f172a; color: #fff;">
              <td style="color: #fff;">VALOR TOTAL CONSOLIDADO</td>
              <td class="right" style="color: #fff;">R$ ${formatBRLValue(totalsCap.patronal + totalsFin.patronal)}</td>
              <td class="right" style="color: #fff;">R$ ${formatBRLValue(totalsCap.segurado + totalsFin.segurado)}</td>
              <td class="right" style="color: #60a5fa;">R$ ${formatBRLValue(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td></td></tr>
          </tfoot>
        </table>
      </body>
      </html>
    `;

    // Attempting highly reliable window.open popup Strategy
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Allow minor delay for css rendering engine and fonts load
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch (err) {
          console.error("Window print error, falling back to document method", err);
        }
      }, 350);
    } else {
      // Fallback Strategy: Safe standard offscreen iframe integration
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.error("Iframe print blocked/failed", err);
            // Last resort: If completely blocked, we can open a raw printable view in same tab or trigger normal alert/instruction, or print the whole window
            window.print();
          }
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1500);
        }, 500);
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white p-6 px-10 flex justify-between items-center shrink-0">
            <div>
              <div className="flex items-center gap-1.5 text-blue-400 font-bold text-[9px] uppercase tracking-widest mb-1">
                <FileText className="w-3.5 h-3.5" />
                <span>Central de Conferência e Relatórios</span>
              </div>
              <h2 className="text-xl font-black italic tracking-tight uppercase leading-none">
                Demonstrativo Consolidado de Guias
              </h2>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">
                Referência: {obterNomeMes(mesReferencia)} de {anoFiscal}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors p-2 bg-slate-800 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-slate-50 border-b border-slate-200 p-5 px-10 flex flex-col md:flex-row md:justify-between md:items-center gap-4 shrink-0">
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                Capitalizado: <strong>R$ {formatBRLValue(totalsCap.total)}</strong>
              </span>
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full hidden md:inline" />
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-teal-500 rounded-full" />
                Financeiro: <strong>R$ {formatBRLValue(totalsFin.total)}</strong>
              </span>
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full hidden md:inline" />
              <span className="flex items-center gap-1 text-slate-900 bg-slate-200/60 p-1 px-2.5 rounded-full font-black">
                Geral: R$ {formatBRLValue(grandTotal)}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={exportPDF}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest p-3 px-6 h-11 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4 text-blue-400" />
                <span>Emitir PDF / Imprimir</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest p-3 px-6 h-11 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Exportar Planilha (XLS/CSV)</span>
              </button>
            </div>
          </div>

          {/* Report Preview - Beautiful Grid representation inside the modal */}
          <div className="flex-1 overflow-y-auto p-10 space-y-12">
            
            {/* 1. REGIME CAPITALIZADO PREVIEW */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 px-2.5 bg-blue-50 text-blue-600 rounded-lg text-xs">01</span>
                  Regime Capitalizado
                </h3>
                <span className="text-xs text-slate-500 font-bold">
                  Soma Consolidada: R$ {formatBRLValue(totalsCap.total)}
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black tracking-wider text-slate-600 uppercase">
                      <th className="p-4 pl-6 w-[28%]">Departamento / Órgão</th>
                      <th className="p-4 w-[18%]">ID GRCP Patronal</th>
                      <th className="p-4 text-right w-[15%]">Valor Patronal</th>
                      <th className="p-4 text-center w-[12%]">Status (Pat)</th>
                      <th className="p-4 w-[18%]">ID GRCP Segurado</th>
                      <th className="p-4 text-right w-[15%]">Valor Segurado</th>
                      <th className="p-4 text-center w-[12%]">Status (Seg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departamentos.map((dept) => {
                      const sec = secretarias.find((s) => s.id === dept.secretariaId);
                      const pat = getGuiaData(dept.id, "patronal", "capitalizado");
                      const seg = getGuiaData(dept.id, "segurado", "capitalizado");

                      return (
                        <tr key={`cap-${dept.id}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 pl-6">
                            {sec && (
                              <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[8px] font-black uppercase mr-1.5">
                                {sec.sigla || sec.nome}
                              </span>
                            )}
                            <span className="font-extrabold text-slate-900">{dept.nome}</span>
                          </td>
                          <td className="p-3 text-slate-500 font-mono">{pat?.identificacaoGrcp || "—"}</td>
                          <td className="p-3 text-right font-black text-slate-950">R$ {formatBRLValue(pat?.valor || 0)}</td>
                          <td className="p-3 text-center">
                            {pat ? (
                              pat.status === "pago" ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-emerald-600 uppercase bg-emerald-50 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Pago</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-amber-600 uppercase bg-amber-50 rounded-full px-2 py-0.5"><AlertCircle className="w-3 h-3 text-amber-500" /> Pendente</span>
                              )
                            ) : (
                              <span className="text-slate-350 text-[9px] uppercase tracking-wide">Pendente</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 font-mono">{seg?.identificacaoGrcp || "—"}</td>
                          <td className="p-3 text-right font-black text-slate-950">R$ {formatBRLValue(seg?.valor || 0)}</td>
                          <td className="p-3 text-center">
                            {seg ? (
                              seg.status === "pago" ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-emerald-600 uppercase bg-emerald-50 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Pago</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-amber-600 uppercase bg-amber-50 rounded-full px-2 py-0.5"><AlertCircle className="w-3 h-3 text-amber-500" /> Pendente</span>
                              )
                            ) : (
                              <span className="text-slate-350 text-[9px] uppercase tracking-wide">Pendente</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals under capitalizado */}
                    <tr className="bg-slate-50/50 font-extrabold text-slate-900">
                      <td className="p-4 pl-6 uppercase text-[9px] tracking-wider text-slate-500">Subtotais Capitalizado</td>
                      <td className="p-4">—</td>
                      <td className="p-4 text-right font-black text-slate-900">R$ {formatBRLValue(totalsCap.patronal)}</td>
                      <td className="p-4 text-center">—</td>
                      <td className="p-4">—</td>
                      <td className="p-4 text-right font-black text-slate-900">R$ {formatBRLValue(totalsCap.segurado)}</td>
                      <td className="p-4 text-center">—</td>
                    </tr>
                    <tr className="bg-blue-50/30 text-blue-900 font-black">
                      <td className="p-4 pl-6 uppercase text-[9px] tracking-wider" colSpan={5}>Soma Total Regime Capitalizado</td>
                      <td className="p-4 text-right text-sm text-blue-700" colSpan={2}>R$ {formatBRLValue(totalsCap.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. REGIME FINANCEIRO PREVIEW */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 px-2.5 bg-teal-500 text-white rounded-lg text-xs">02</span>
                  Regime Financeiro
                </h3>
                <span className="text-xs text-slate-500 font-bold">
                  Soma Consolidada: R$ {formatBRLValue(totalsFin.total)}
                </span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black tracking-wider text-slate-600 uppercase">
                      <th className="p-4 pl-6 w-[28%]">Departamento / Órgão</th>
                      <th className="p-4 w-[18%]">ID GRCP Patronal</th>
                      <th className="p-4 text-right w-[15%]">Valor Patronal</th>
                      <th className="p-4 text-center w-[12%]">Status (Pat)</th>
                      <th className="p-4 w-[18%]">ID GRCP Segurado</th>
                      <th className="p-4 text-right w-[15%]">Valor Segurado</th>
                      <th className="p-4 text-center w-[12%]">Status (Seg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {departamentos.map((dept) => {
                      const sec = secretarias.find((s) => s.id === dept.secretariaId);
                      const pat = getGuiaData(dept.id, "patronal", "financeiro");
                      const seg = getGuiaData(dept.id, "segurado", "financeiro");

                      return (
                        <tr key={`fin-${dept.id}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 pl-6">
                            {sec && (
                              <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[8px] font-black uppercase mr-1.5">
                                {sec.sigla || sec.nome}
                              </span>
                            )}
                            <span className="font-extrabold text-slate-900">{dept.nome}</span>
                          </td>
                          <td className="p-3 text-slate-500 font-mono">{pat?.identificacaoGrcp || "—"}</td>
                          <td className="p-3 text-right font-black text-slate-950">R$ {formatBRLValue(pat?.valor || 0)}</td>
                          <td className="p-3 text-center">
                            {pat ? (
                              pat.status === "pago" ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-emerald-600 uppercase bg-emerald-50 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Pago</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-amber-600 uppercase bg-amber-50 rounded-full px-2 py-0.5"><AlertCircle className="w-3 h-3 text-amber-500" /> Pendente</span>
                              )
                            ) : (
                              <span className="text-slate-350 text-[9px] uppercase tracking-wide">Pendente</span>
                            )}
                          </td>
                          <td className="p-3 text-slate-500 font-mono">{seg?.identificacaoGrcp || "—"}</td>
                          <td className="p-3 text-right font-black text-slate-950">R$ {formatBRLValue(seg?.valor || 0)}</td>
                          <td className="p-3 text-center">
                            {seg ? (
                              seg.status === "pago" ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-emerald-600 uppercase bg-emerald-50 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Pago</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-[8.5px] text-amber-600 uppercase bg-amber-50 rounded-full px-2 py-0.5"><AlertCircle className="w-3 h-3 text-amber-500" /> Pendente</span>
                              )
                            ) : (
                              <span className="text-slate-350 text-[9px] uppercase tracking-wide">Pendente</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals under financeiro */}
                    <tr className="bg-slate-50/50 font-extrabold text-slate-900">
                      <td className="p-4 pl-6 uppercase text-[9px] tracking-wider text-slate-500">Subtotais Financeiro</td>
                      <td className="p-4">—</td>
                      <td className="p-4 text-right font-black text-slate-900">R$ {formatBRLValue(totalsFin.patronal)}</td>
                      <td className="p-4 text-center">—</td>
                      <td className="p-4">—</td>
                      <td className="p-4 text-right font-black text-slate-900">R$ {formatBRLValue(totalsFin.segurado)}</td>
                      <td className="p-4 text-center">—</td>
                    </tr>
                    <tr className="bg-teal-50/20 text-teal-900 font-black">
                      <td className="p-4 pl-6 uppercase text-[9px] tracking-wider" colSpan={5}>Soma Total Regime Financeiro</td>
                      <td className="p-4 text-right text-sm text-teal-700" colSpan={2}>R$ {formatBRLValue(totalsFin.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. RESUMO GERAL CONSOLIDADO PREVIEW */}
            <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-md">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-4">
                03. Resumo Geral Consolidado (Tabela de Caixa)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-800/65 p-4 rounded-2xl border border-slate-700/50">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Patronal Consolidado</span>
                  <strong className="text-xl font-bold tracking-tight mt-1.5 block">
                    R$ {formatBRLValue(totalsCap.patronal + totalsFin.patronal)}
                  </strong>
                </div>
                <div className="bg-slate-800/65 p-4 rounded-2xl border border-slate-700/50">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Segurados Consolidado</span>
                  <strong className="text-xl font-bold tracking-tight mt-1.5 block">
                    R$ {formatBRLValue(totalsCap.segurado + totalsFin.segurado)}
                  </strong>
                </div>
                <div className="bg-slate-800 p-4 rounded-2xl border-2 border-blue-500/30">
                  <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block">Valor Total Geral Fundo</span>
                  <strong className="text-2xl font-black tracking-tight text-blue-300 mt-1 block">
                    R$ {formatBRLValue(grandTotal)}
                  </strong>
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
