import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  FileText, CheckCircle2, TrendingUp, Download, Filter,
  DollarSign, FileCheck, Shield, Users, AlertTriangle,
  X, Info, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Guia, Comprovante, Departamento, Secretaria } from '../types';

const formatBRLValue = (val: number): string => {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getNomeMes = (m: number | 'todos'): string => {
  if (m === 'todos') return 'Todos os Meses';
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return nomes[m - 1] || '';
};

const formatYAxisTick = (val: number): string => {
  if (val === 0) return 'R$ 0';
  if (val >= 1000000) {
    const formatted = (val / 1000000).toFixed(1).replace('.0', '').replace('.', ',');
    return `R$ ${formatted}M`;
  }
  if (val >= 1000) {
    const formatted = (val / 1000).toFixed(0);
    return `R$ ${formatted} mil`;
  }
  return `R$ ${val}`;
};

const normalizeValue = (val: number | string | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  let num: number;
  if (typeof val === 'string') {
    // Clean string by removing "R$", space separators, and converting BRL format to standard float representation
    const clean = val.replace(/R\$\s?/gi, "").trim();
    if (!clean) return 0;
    
    // Check if it uses BRL structure (has dot as thousand sep and comma as decimal separator)
    if (clean.includes(',') && clean.includes('.')) {
      num = parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
    } else if (clean.includes(',')) {
      num = parseFloat(clean.replace(",", ".")) || 0;
    } else {
      num = parseFloat(clean) || 0;
    }
  } else {
    num = val;
  }
  
  if (isNaN(num)) return 0;
  
  // If the value is between 0 and 120, it represents thousands (e.g. 3.26 -> 3260, 45.4 -> 45400)
  if (num > 0 && num < 120) {
    num = num * 1000;
  }
  return num;
};

export default function Dashboard() {
  const [allGuias, setAllGuias] = useState<Guia[]>([]);
  const [allComprovantes, setAllComprovantes] = useState<Comprovante[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState(false);

  // Filters state (defaults to current month and year)
  const [selectedMes, setSelectedMes] = useState<number | 'todos'>(new Date().getMonth() + 1);
  const [selectedAno, setSelectedAno] = useState<number | 'todos'>(new Date().getFullYear());
  const [selectedRegime, setSelectedRegime] = useState<'todos' | 'capitalizado' | 'financeiro'>('todos');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch secretarias
        const secsRef = collection(db, 'secretarias');
        const secsSnapshot = await getDocs(secsRef);
        const secsData = secsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Secretaria);
        setSecretarias(secsData);

        // Fetch departamentos
        const deptsRef = collection(db, 'departamentos');
        const deptsSnapshot = await getDocs(deptsRef);
        const deptsData = deptsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Departamento);
        setDepartamentos(deptsData);

        // Fetch all guias
        const guiasRef = collection(db, 'guias');
        const guiasSnapshot = await getDocs(guiasRef);
        const guiasData = guiasSnapshot.docs.map(d => {
          const data = d.data();
          const valorNum = normalizeValue(data.valor);
          const valorPagoNum = data.valorPago !== undefined ? normalizeValue(data.valorPago) : undefined;
          
          return {
            id: d.id,
            ...data,
            valor: valorNum,
            valorPago: valorPagoNum
          } as Guia;
        });
        setAllGuias(guiasData);

        // Fetch all comprovantes
        const compRef = collection(db, 'comprovantes');
        const compSnapshot = await getDocs(compRef);
        const guiasMap = new Map(guiasData.map(g => [g.id, g]));
        
        const compData = compSnapshot.docs.map(d => {
          const data = d.data();
          const linkedGuia = data.guiaId ? guiasMap.get(data.guiaId) : null;
          
          let mes = data.mes;
          let ano = data.ano;
          if (!mes && linkedGuia) mes = linkedGuia.mes;
          if (!ano && linkedGuia) ano = linkedGuia.ano;
          if (!mes && data.dataPagamento) {
            try {
              mes = new Date(data.dataPagamento).getMonth() + 1;
            } catch (e) {}
          }
          if (!ano && data.dataPagamento) {
            try {
              ano = new Date(data.dataPagamento).getFullYear();
            } catch (e) {}
          }
          
          return {
            id: d.id,
            ...data,
            mes,
            ano
          } as Comprovante;
        });
        setAllComprovantes(compData);
      } catch (error) {
        console.error("Erro ao carregar dados do Dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Filter lists based on selected criteria with robust type safety
  const filteredGuias = allGuias.filter(g => {
    const matchMes = selectedMes === 'todos' || Number(g.mes) === Number(selectedMes);
    const matchAno = selectedAno === 'todos' || Number(g.ano) === Number(selectedAno);
    const matchRegime = selectedRegime === 'todos' || (g.regime || 'capitalizado') === selectedRegime;
    return matchMes && matchAno && matchRegime;
  });

  const filteredComprovantes = allComprovantes.filter(c => {
    const matchMes = selectedMes === 'todos' || Number(c.mes) === Number(selectedMes);
    const matchAno = selectedAno === 'todos' || Number(c.ano) === Number(selectedAno);
    const linkedGuia = c.guiaId ? allGuias.find(g => g.id === c.guiaId) : null;
    const compRegime = c.regime || (linkedGuia && linkedGuia.regime) || 'capitalizado';
    const matchRegime = selectedRegime === 'todos' || compRegime === selectedRegime;
    return matchMes && matchAno && matchRegime;
  });

  // Calculate high-level KPIs based on the filtered records
  const totalGuias = filteredGuias.length;
  
  // Calculate unique comprovantes across both the comprovantes collection and guias with urlComprovante
  const uniqueComps = new Set<string>();
  filteredComprovantes.forEach(c => {
    if (c.urlComprovante) {
      uniqueComps.add(c.urlComprovante);
    } else {
      uniqueComps.add(c.id);
    }
  });

  filteredGuias.forEach(g => {
    if (g.urlComprovante) {
      uniqueComps.add(g.urlComprovante);
    }
  });

  const totalComprovantes = uniqueComps.size;

  // Group by URL to find shared comprovantes for diagnostics
  const sharedGroupsMap: Record<string, Guia[]> = {};
  filteredGuias.forEach(g => {
    if (g.urlComprovante) {
      if (!sharedGroupsMap[g.urlComprovante]) {
        sharedGroupsMap[g.urlComprovante] = [];
      }
      sharedGroupsMap[g.urlComprovante].push(g);
    }
  });

  const sharedGroupsList = Object.entries(sharedGroupsMap)
    .filter(([url, list]) => list.length > 1)
    .map(([url, list]) => ({ url, list }));

  // Track discrepancy of documents
  const guiasPendentes = filteredGuias.filter(g => g.status !== 'pago');
  const totalPendentes = guiasPendentes.length;
  const temDivergencia = totalGuias !== totalComprovantes || totalPendentes > 0;
  const difQuantidade = Math.abs(totalGuias - totalComprovantes);
  const valorPendenteTotal = guiasPendentes.reduce((acc, g) => acc + (g.valor || 0), 0);

  const valorTotalPago = filteredGuias
    .filter(g => g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

  const valorPatronalPago = filteredGuias
    .filter(g => g.tipo === 'patronal' && g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

  const valorSeguradoPago = filteredGuias
    .filter(g => g.tipo === 'segurado' && g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

  const valorPatronalTotal = filteredGuias
    .filter(g => g.tipo === 'patronal')
    .reduce((acc, g) => acc + (g.valor || 0), 0);

  const valorSeguradoTotal = filteredGuias
    .filter(g => g.tipo === 'segurado')
    .reduce((acc, g) => acc + (g.valor || 0), 0);

  // Monthly Evolution dataset for Recharts
  const monthlyData = [
    { name: 'Jan', valor: 0 },
    { name: 'Fev', valor: 0 },
    { name: 'Mar', valor: 0 },
    { name: 'Abr', valor: 0 },
    { name: 'Mai', valor: 0 },
    { name: 'Jun', valor: 0 },
    { name: 'Jul', valor: 0 },
    { name: 'Ago', valor: 0 },
    { name: 'Set', valor: 0 },
    { name: 'Out', valor: 0 },
    { name: 'Nov', valor: 0 },
    { name: 'Dez', valor: 0 },
  ];

  // Populate monthly trends from guides matching active Year, Regime & Month filters
  allGuias.forEach(g => {
    const matchAno = selectedAno === 'todos' || Number(g.ano) === Number(selectedAno);
    const compRegime = g.regime || 'capitalizado';
    const matchRegime = selectedRegime === 'todos' || compRegime === selectedRegime;
    const matchMes = selectedMes === 'todos' || Number(g.mes) === Number(selectedMes);

    if (matchAno && matchRegime && matchMes) {
      const mesNum = Number(g.mes);
      if (mesNum >= 1 && mesNum <= 12 && g.status === 'pago') {
        const val = g.valorPago || g.valor || 0;
        monthlyData[mesNum - 1].valor += val;
      }
    }
  });

  const formattedMonthlyData = monthlyData.map(m => ({
    name: m.name,
    valor: parseFloat(m.valor.toFixed(2))
  }));

  // Regime Pie Chart Data (Capitalizado vs Financeiro)
  const capitalizadoPago = filteredGuias
    .filter(g => (g.regime || 'capitalizado') === 'capitalizado' && g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

  const financeiroPago = filteredGuias
    .filter(g => (g.regime || 'capitalizado') === 'financeiro' && g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

  const regimePieData = [
    { name: 'Capitalizado', valor: parseFloat(capitalizadoPago.toFixed(2)) },
    { name: 'Financeiro', valor: parseFloat(financeiroPago.toFixed(2)) }
  ].filter(item => item.valor > 0);

  const hasRegimeData = regimePieData.length > 0;

  // Tipo Pie Chart Data (Patronal vs Segurado)
  const patronalPago = filteredGuias
    .filter(g => g.tipo === 'patronal' && g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

  const seguradoPago = filteredGuias
    .filter(g => g.tipo === 'segurado' && g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

  const tipoPieData = [
    { name: 'Patronal', valor: parseFloat(patronalPago.toFixed(2)) },
    { name: 'Segurado', valor: parseFloat(seguradoPago.toFixed(2)) }
  ].filter(item => item.valor > 0);

  const hasTipoData = tipoPieData.length > 0;

  const REGIME_COLORS = ['#7C3AED', '#2563EB']; // Violet, Royal Blue
  const TIPO_COLORS = ['#EA580C', '#0891B2']; // Orange, Cyan

  if (loading) {
    return (
      <div className="p-8 space-y-8 bg-[#f5f5f5] min-h-screen">
        {/* Shimmer header */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-5">
          <div className="space-y-3">
            <div className="h-9 w-60 bg-gray-200/80 rounded-2xl animate-pulse" />
            <div className="h-4 w-96 bg-gray-200/50 rounded-xl animate-pulse" />
          </div>
          <div className="h-10 w-48 bg-gray-200/60 rounded-xl animate-pulse" />
        </header>

        {/* Shimmer Filter row */}
        <section className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-5 items-start lg:items-center justify-between">
          <div className="flex flex-row flex-wrap sm:flex-nowrap gap-4 items-end w-full lg:w-auto">
            <div className="space-y-2 flex-1 sm:flex-initial min-w-[140px]">
              <div className="h-3 w-16 bg-gray-200/50 rounded animate-pulse" />
              <div className="h-9 w-full bg-gray-100/70 rounded-xl animate-pulse" />
            </div>
            <div className="space-y-2 flex-1 sm:flex-initial min-w-[110px]">
              <div className="h-3 w-12 bg-gray-200/50 rounded animate-pulse" />
              <div className="h-9 w-full bg-gray-100/70 rounded-xl animate-pulse" />
            </div>
            <div className="space-y-2 flex-1 sm:flex-initial min-w-[140px]">
              <div className="h-3 w-14 bg-gray-200/50 rounded animate-pulse" />
              <div className="h-9 w-full bg-gray-100/70 rounded-xl animate-pulse" />
            </div>
          </div>
          <div className="h-8 w-72 bg-amber-50/50 rounded-xl border border-amber-100/30 animate-pulse" />
        </section>

        {/* Shimmer Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm h-44 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-gray-200/60 rounded-xl animate-pulse" />
                <div className="w-28 h-7 bg-gray-100/60 rounded-xl animate-pulse" />
              </div>
              <div className="space-y-2.5">
                <div className="w-20 h-3 bg-gray-100/50 rounded animate-pulse" />
                <div className="w-44 h-8 bg-gray-200/50 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Shimmer secondary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((n) => (
            <div key={n} className="p-6 rounded-2xl bg-white border border-gray-100 shadow-sm h-40 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-gray-200/60 rounded-xl animate-pulse" />
                <div className="w-28 h-7 bg-gray-100/60 rounded-xl animate-pulse" />
              </div>
              <div className="space-y-2.5">
                <div className="w-24 h-3 bg-gray-100/50 rounded animate-pulse" />
                <div className="w-56 h-8 bg-gray-200/50 rounded-xl animate-pulse" />
              </div>
            </div>
          ))}
        </div>

        {/* Shimmer Chart Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm h-[320px] flex flex-col justify-between">
            <div className="h-6 w-44 bg-gray-200/60 rounded-lg animate-pulse" />
            <div className="flex-1 flex items-center justify-center">
              <div className="w-36 h-36 rounded-full border-12 border-gray-100 animate-pulse" />
            </div>
          </div>
          <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm h-[320px] flex flex-col justify-between">
            <div className="h-6 w-44 bg-gray-200/60 rounded-lg animate-pulse" />
            <div className="flex-1 flex items-center justify-center">
              <div className="w-36 h-36 rounded-full border-12 border-gray-100 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 bg-[#f5f5f5] min-h-screen">
      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Visão Geral</h1>
          <p className="text-gray-500 text-sm mt-1">Status de controle de arrecadações e documentos de pagamento</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => {
              setSelectedMes('todos');
              setSelectedAno('todos');
            }}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-semibold transition-colors shadow-sm uppercase tracking-wider text-[11px] ${
              selectedMes === 'todos' && selectedAno === 'todos'
                ? 'bg-blue-600 text-white border-transparent hover:bg-blue-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" /> Visualizar Acumulado
          </button>
        </div>
      </header>

      {/* Filter Row */}
      <section className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-5 items-start lg:items-center justify-between">
        <div className="flex flex-row flex-wrap sm:flex-nowrap gap-4 items-end w-full lg:w-auto">
          <div className="flex flex-col gap-1.5 flex-1 sm:flex-initial min-w-[140px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mês de Ref.</span>
            <select 
              value={selectedMes} 
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMes(val === 'todos' ? 'todos' : Number(val));
              }}
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none transition-all cursor-pointer w-full"
            >
              <option value="todos">Todos os Meses</option>
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

          <div className="flex flex-col gap-1.5 flex-1 sm:flex-initial min-w-[110px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ano Fiscal</span>
            <select 
              value={selectedAno} 
              onChange={(e) => {
                const val = e.target.value;
                setSelectedAno(val === 'todos' ? 'todos' : Number(val));
              }}
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none transition-all cursor-pointer w-full"
            >
              <option value="todos">Todos os Anos</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 sm:flex-initial min-w-[140px]">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Regime</span>
            <select 
              value={selectedRegime} 
              onChange={(e) => {
                setSelectedRegime(e.target.value as any);
              }}
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none transition-all cursor-pointer w-full"
            >
              <option value="todos">Geral (Todos)</option>
              <option value="capitalizado">Capitalizado</option>
              <option value="financeiro">Financeiro</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-amber-600 font-bold bg-amber-50/50 border border-amber-100 py-1.5 px-3 rounded-lg flex items-center gap-1.5 self-stretch sm:self-auto text-center justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Filtros ativos determinam as métricas exibidas nos painéis
        </div>
      </section>

      {/* Discrepancy Alert Banner */}
      {temDivergencia && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setIsDiagnosticModalOpen(true)}
          className="bg-rose-50 border border-rose-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm cursor-pointer hover:bg-rose-100/70 hover:border-rose-200 transition-all group"
        >
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 bg-rose-600 text-white rounded-xl shadow-lg flex items-center justify-center animate-pulse group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-5.5 h-5.5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-rose-950 uppercase tracking-tight flex items-center gap-2">
                Atenção: Divergência Detectada entre Guias e Comprovantes!
                <span className="text-[10px] bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full font-bold group-hover:bg-rose-200 transition-colors">Clique para Analisar</span>
              </h4>
              <p className="text-rose-700 text-xs mt-1 leading-relaxed">
                Neste período, há <strong className="font-extrabold">{totalGuias} guia(s)</strong> cadastradas e somente <strong className="font-extrabold">{totalComprovantes} comprovante(s)</strong> anexados. Diferença de <strong className="font-extrabold">{difQuantidade} guia(s)</strong> pendente(s) de comprovação de depósito.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0 self-stretch sm:self-auto justify-between">
            {totalPendentes > 0 && (
              <div className="flex flex-col items-start sm:items-end gap-1">
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Valor Pendente Previsto</span>
                <span className="inline-block bg-rose-100 text-rose-800 text-xs font-black uppercase tracking-tight px-3 py-1.5 rounded-xl border border-rose-200">
                  {formatBRLValue(valorPendenteTotal)}
                </span>
              </div>
            )}
            <button className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-xl transition-all shadow-sm active:scale-[0.98]">
              Analisar
            </button>
          </div>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Total de Guias" 
          value={totalGuias} 
          icon={<FileText className="w-5.5 h-5.5" />} 
          gradient="bg-gradient-to-br from-[#1E40AF] via-[#2563EB] to-[#1D4ED8]"
          borderClass="border border-blue-400/20 shadow-lg shadow-blue-500/5 hover:shadow-blue-500/10"
          trend={selectedMes === 'todos' && selectedAno === 'todos' ? "Filtro: Todos os Períodos" : "Referente ao período filtrado"}
        />
        <StatCard 
          title="Total de Comprovantes" 
          value={totalComprovantes} 
          icon={<FileCheck className="w-5.5 h-5.5" />} 
          gradient="bg-gradient-to-br from-[#065F46] via-[#10B981] to-[#047857]"
          borderClass={temDivergencia 
            ? "border-2 border-rose-500/50 shadow-2xl shadow-rose-500/10" 
            : "border border-emerald-400/10 shadow-lg shadow-emerald-500/5 hover:shadow-emerald-500/10"
          }
          trend={`${totalGuias > 0 ? Math.round((totalComprovantes / totalGuias) * 100) : 0}% guias comprovadas`}
          alertLabel={temDivergencia ? `⚠️ DIVERGÊNCIA: -${difQuantidade} COMS` : undefined}
          isWarning={temDivergencia}
        />
        <StatCard 
          title="Valor Total Recebido" 
          value={formatBRLValue(valorTotalPago)} 
          icon={<DollarSign className="w-5.5 h-5.5" />} 
          gradient="bg-gradient-to-br from-[#5B21B6] via-[#7C3AED] to-[#6D28D9]"
          borderClass="border border-purple-400/20 shadow-lg shadow-purple-500/5 hover:shadow-purple-500/10"
          trend="Total comprovado em contas"
        />
      </div>

      {/* KPI Cards Secundários: Patronal e Segurado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard 
          title="Total Patronal Recebido" 
          value={formatBRLValue(valorPatronalPago)} 
          icon={<Shield className="w-5.5 h-5.5" />} 
          gradient="bg-gradient-to-br from-[#9A3412] via-[#EA580C] to-[#F97316]"
          borderClass="border border-orange-400/20 shadow-lg shadow-orange-500/5 hover:shadow-orange-500/10"
          trend={`Previsto: ${formatBRLValue(valorPatronalTotal)}`}
        />
        <StatCard 
          title="Total Segurado Recebido" 
          value={formatBRLValue(valorSeguradoPago)} 
          icon={<Users className="w-5.5 h-5.5" />} 
          gradient="bg-gradient-to-br from-[#0E7490] via-[#0891B2] to-[#06B6D4]"
          borderClass="border border-cyan-400/20 shadow-lg shadow-cyan-500/5 hover:shadow-cyan-500/10"
          trend={`Previsto: ${formatBRLValue(valorSeguradoTotal)}`}
        />
      </div>

      {/* Main Stats Chart */}
      <div className="grid grid-cols-1 gap-8">
        {/* 2 Gráficos de Pizza: Regime e Tipo (Patronal vs Segurado) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Regime: Financeiro e Capitalizado */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between"
          >
            <div>
              <h3 className="text-lg font-bold text-gray-900">Divisão por Regime Financeiro</h3>
              <p className="text-gray-400 text-xs mt-0.5">Distribuição do total de repasses pagos por regime de previdência</p>
            </div>
            
            {hasRegimeData ? (
              <div className="flex flex-col items-center justify-center mt-6">
                <div className="h-[240px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={regimePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="valor"
                      >
                        {regimePieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.name === 'Capitalizado' ? REGIME_COLORS[0] : REGIME_COLORS[1]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f1f2f4', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        formatter={(v: any) => [formatBRLValue(v), "Valor Pago"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Central Text inside donut */}
                  <div className="absolute inset-x-0 top-[50%] -translate-y-[50%] flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Regime</span>
                    <span className="text-[12px] font-black text-gray-800 tracking-tight">
                      {formatBRLValue(capitalizadoPago + financeiroPago)}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-wrap justify-center gap-6 mt-4 w-full">
                  {regimePieData.map((item) => {
                    const color = item.name === 'Capitalizado' ? REGIME_COLORS[0] : REGIME_COLORS[1];
                    const total = capitalizadoPago + financeiroPago;
                    const percentage = total > 0 ? Math.round((item.valor / total) * 100) : 0;
                    return (
                      <div key={item.name} className="flex flex-col items-center p-3 rounded-xl bg-gray-50 border border-gray-100 min-w-[120px] transition-all hover:bg-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs font-black text-gray-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-black text-gray-900 mt-1">{formatBRLValue(item.valor)}</span>
                        <span className="text-[10px] font-bold text-gray-400 mt-0.5">{percentage}% do total</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[280px] w-full flex flex-col items-center justify-center text-gray-400 text-sm font-semibold italic">
                <span>Nenhum pagamento registrado neste período</span>
              </div>
            )}
          </motion.div>

          {/* Patronal e Segurado */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between"
          >
            <div>
              <h3 className="text-lg font-bold text-gray-900">Divisão por Contribuição</h3>
              <p className="text-gray-400 text-xs mt-0.5">Proporção dos recursos recebidos entre cotas Patronais e Segurados</p>
            </div>
            
            {hasTipoData ? (
              <div className="flex flex-col items-center justify-center mt-6">
                <div className="h-[240px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tipoPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="valor"
                      >
                        {tipoPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.name === 'Patronal' ? TIPO_COLORS[0] : TIPO_COLORS[1]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f1f2f4', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        formatter={(v: any) => [formatBRLValue(v), "Valor Pago"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Central Text inside donut */}
                  <div className="absolute inset-x-0 top-[50%] -translate-y-[50%] flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Total Origem</span>
                    <span className="text-[12px] font-black text-gray-800 tracking-tight">
                      {formatBRLValue(patronalPago + seguradoPago)}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-wrap justify-center gap-6 mt-4 w-full">
                  {tipoPieData.map((item) => {
                    const color = item.name === 'Patronal' ? TIPO_COLORS[0] : TIPO_COLORS[1];
                    const total = patronalPago + seguradoPago;
                    const percentage = total > 0 ? Math.round((item.valor / total) * 100) : 0;
                    return (
                      <div key={item.name} className="flex flex-col items-center p-3 rounded-xl bg-gray-50 border border-gray-100 min-w-[120px] transition-all hover:bg-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs font-black text-gray-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-black text-gray-900 mt-1">{formatBRLValue(item.valor)}</span>
                        <span className="text-[10px] font-bold text-gray-400 mt-0.5">{percentage}% do total</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[280px] w-full flex flex-col items-center justify-center text-gray-400 text-sm font-semibold italic">
                <span>Nenhum pagamento registrado neste período</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* Chart 2: Monthly Evolution */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 w-full"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Evolução Mensal de Pagamentos</h3>
              <p className="text-gray-400 text-xs mt-0.5">Visão de arrecadação cumulativa de guias comprovadas p/ cada mês</p>
            </div>
            <div className="text-xs bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-xl font-medium text-gray-500">
              Ano exibido no gráfico: <strong className="text-gray-800">{selectedAno === 'todos' ? 'Acumulado (Todos os Anos)' : selectedAno}</strong>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedMonthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6c7281', fontWeight: 600 }} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  width={80}
                  tick={{ fontSize: 11, fill: '#8C94A6', fontWeight: 500 }} 
                  tickFormatter={(v) => formatYAxisTick(v)}
                />
                <Tooltip 
                  cursor={{ fill: '#fafafa' }}
                  contentStyle={{ borderRadius: '14px', border: '1px solid #f1f2f4', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
                  formatter={(v: any) => [formatBRLValue(v), "Valor Pago Benefícios"]}
                 />
                <Bar dataKey="valor" fill="#2563EB" radius={[6, 6, 0, 0]} barSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Diagnostic Discrepancy Modal */}
      <AnimatePresence>
        {isDiagnosticModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDiagnosticModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden z-10"
            >
              {/* Header */}
              <header className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                    <AlertTriangle className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight leading-none">
                      Diagnóstico de Divergências
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Período: <strong className="text-slate-800">{selectedMes === 'todos' ? 'Todos os Meses' : getNomeMes(selectedMes)}/{selectedAno === 'todos' ? 'Todos os Anos' : selectedAno}</strong> {selectedRegime !== 'todos' && `| Regime: ${selectedRegime}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDiagnosticModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </header>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                
                {/* Informational Explanation Box */}
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4.5 flex gap-3.5">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed text-blue-800">
                    <h5 className="font-extrabold text-blue-950 uppercase tracking-tight mb-1">Entenda as divergências do painel:</h5>
                    <p className="mb-2">
                      O painel alerta quando a contagem total de guias cadastradas é diferente da contagem de <strong>arquivos únicos</strong> de comprovantes.
                    </p>
                    <p>
                      Se você pagar mais de uma guia de uma vez e anexar o <strong>mesmo arquivo de comprovante</strong> para elas, o sistema conta esse arquivo apenas uma vez, gerando uma "divergência" matemática no painel, embora todas as guias estejam pagas e regulares!
                    </p>
                  </div>
                </div>

                {/* Summary Mini Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Guias no Período</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{totalGuias}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-100">
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Falta Comprovante</p>
                    <p className="text-2xl font-black text-rose-800 mt-1">
                      {filteredGuias.filter(g => g.status !== 'pago' || !g.urlComprovante).length}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Comprovantes Compartilhados</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">
                      {filteredGuias.filter(g => g.urlComprovante).length - uniqueComps.size}
                    </p>
                  </div>
                </div>

                {/* 1. SEÇÃO: GUIAS PENDENTES (SEM COMPROVANTE) */}
                <section className="space-y-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5 border-b pb-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                    1. Guias sem Comprovante de Pagamento ({filteredGuias.filter(g => g.status !== 'pago' || !g.urlComprovante).length})
                  </h4>
                  
                  {filteredGuias.filter(g => g.status !== 'pago' || !g.urlComprovante).length > 0 ? (
                    <div className="divide-y divide-gray-100 max-h-[250px] overflow-y-auto border border-gray-100 rounded-2xl bg-white shadow-sm">
                      {filteredGuias.filter(g => g.status !== 'pago' || !g.urlComprovante).map(g => {
                        const dept = departamentos.find(d => d.id === g.departamentoId);
                        const sec = dept ? secretarias.find(s => s.id === dept.secretariaId) : null;
                        return (
                          <div key={g.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {sec && (
                                  <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-extrabold text-[9px] uppercase tracking-wider">
                                    {sec.sigla || sec.nome}
                                  </span>
                                )}
                                <span className="font-extrabold text-slate-900 text-sm">
                                  {dept ? dept.nome : 'Depto Desconhecido'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-gray-500 font-medium">
                                <span className="uppercase tracking-widest font-bold">Ref: {g.mes < 10 ? '0' + g.mes : g.mes}/{g.ano}</span>
                                <span>•</span>
                                <span className="uppercase tracking-widest font-bold">Tipo: {g.tipo === 'patronal' ? 'Patronal' : 'Segurado'}</span>
                                <span>•</span>
                                <span className="uppercase tracking-widest font-bold">Regime: {g.regime || 'Capitalizado'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 self-stretch sm:self-auto justify-between">
                              <div className="text-right">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Valor da Guia</p>
                                <p className="font-extrabold text-slate-900">{formatBRLValue(g.valor)}</p>
                              </div>
                              <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                                g.status === 'atrasado' 
                                  ? 'bg-rose-100 text-rose-800 border-rose-200 animate-pulse'
                                  : g.status === 'pago' 
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border-amber-200'
                              }`}>
                                {g.status === 'pago' ? 'Pago (S/ Comprovante)' : g.status === 'atrasado' ? 'Em Atraso' : 'Pendente'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-5 text-center border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl text-gray-400 italic text-xs">
                      Excelente! Todas as guias possuem arquivo de comprovante vinculado ou estão comprovadas.
                    </div>
                  )}
                </section>

                {/* 2. SEÇÃO: COMPROVANTES COMPARTILHADOS */}
                <section className="space-y-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5 border-b pb-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    2. Guias Pagas em Lote / Comprovantes Compartilhados ({sharedGroupsList.length} grupo(s))
                  </h4>
                  
                  {sharedGroupsList.length > 0 ? (
                    <div className="space-y-4 max-h-[250px] overflow-y-auto pr-1">
                      {sharedGroupsList.map(({ url, list }, groupIdx) => {
                        const firstGuia = list[0];
                        // Extract filename from URL/path
                        let filename = 'comprovante_compartilhado.pdf';
                        try {
                          if (url.startsWith('http')) {
                            const decoded = decodeURIComponent(url);
                            filename = decoded.split('/').pop()?.split('?')[0] || filename;
                          }
                        } catch (e) {}

                        return (
                          <div key={url} className="border border-gray-100 rounded-2xl bg-slate-50/50 p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center text-[10px]">
                                  {groupIdx + 1}
                                </span>
                                <div>
                                  <p className="font-extrabold text-slate-900">Comprovante de Lote</p>
                                  <p className="text-[10px] text-gray-400 truncate max-w-[280px]" title={filename}>{filename}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg font-black text-[9px] uppercase tracking-wider">
                                  Vinculado a {list.length} guias
                                </span>
                                {url && url !== "manual" && (
                                  <button
                                    onClick={() => window.open(url, '_blank')}
                                    className="p-1.5 bg-white border border-gray-200 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Visualizar Comprovante"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                              {list.map(g => {
                                const dept = departamentos.find(d => d.id === g.departamentoId);
                                const sec = dept ? secretarias.find(s => s.id === dept.secretariaId) : null;
                                return (
                                  <div key={g.id} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1.5">
                                        {sec && (
                                          <span className="inline-block px-1 bg-slate-100 text-slate-600 rounded font-black text-[8px] uppercase">
                                            {sec.sigla || sec.nome}
                                          </span>
                                        )}
                                        <span className="font-extrabold text-slate-800">
                                          {dept ? dept.nome : 'Depto Desconhecido'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-[9px] text-gray-400">
                                        <span>Ref: {g.mes}/{g.ano}</span>
                                        <span>•</span>
                                        <span>{g.tipo === 'patronal' ? 'Patronal' : 'Segurado'}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-right">
                                      <div>
                                        <p className="text-[9px] text-gray-400">Pago</p>
                                        <p className="font-extrabold text-slate-800">{formatBRLValue(g.valorPago || g.valor)}</p>
                                      </div>
                                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 uppercase tracking-wide">
                                        Ok
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-5 text-center border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl text-gray-400 italic text-xs">
                      Nenhuma guia no período selecionado compartilha comprovantes.
                    </div>
                  )}
                </section>
              </div>

              {/* Footer */}
              <footer className="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50 gap-3">
                <button
                  onClick={() => setIsDiagnosticModalOpen(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-xl transition-all shadow-sm active:scale-[0.98]"
                >
                  Fechar Diagnóstico
                </button>
              </footer>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon, 
  gradient, 
  borderClass, 
  trend,
  alertLabel,
  isWarning
}: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode; 
  gradient: string; 
  borderClass: string; 
  trend: string;
  alertLabel?: string;
  isWarning?: boolean;
}) {
  return (
    <motion.div 
      whileHover={{ y: -3, scale: 1.01 }}
      className={`p-6 rounded-2xl transition-all flex flex-col justify-between ${gradient} ${borderClass}`}
    >
      <div className="flex justify-between items-start gap-4 mb-6">
        <div className="p-3 rounded-xl bg-white/10 text-white border border-white/20 backdrop-blur-md flex items-center justify-center">
          {icon}
        </div>
        <span className={`text-[10px] font-bold border px-3 py-1.5 rounded-xl uppercase tracking-wider backdrop-blur-md text-right leading-normal max-w-[240px] break-words transition-all duration-300 ${
          isWarning 
            ? 'bg-rose-500 text-white border-rose-400 font-extrabold animate-pulse' 
            : 'text-white/90 bg-white/10 border-white/15 hover:bg-white/15 border-white/15'
        }`}>
          {alertLabel || trend}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-black text-white/70 uppercase tracking-widest">{title}</p>
        <h4 className="text-3xl font-black mt-1.5 text-white tracking-tight">{value}</h4>
      </div>
    </motion.div>
  );
}
