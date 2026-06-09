import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  FileText, CheckCircle2, TrendingUp, Download, Filter,
  DollarSign, FileCheck, Shield, Users, AlertTriangle
} from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Guia, Comprovante } from '../types';

const formatBRLValue = (val: number): string => {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const [loading, setLoading] = useState(true);

  // Filters state (defaults to current month and year)
  const [selectedMes, setSelectedMes] = useState<number | 'todos'>(new Date().getMonth() + 1);
  const [selectedAno, setSelectedAno] = useState<number | 'todos'>(new Date().getFullYear());
  const [selectedRegime, setSelectedRegime] = useState<'todos' | 'capitalizado' | 'financeiro'>('todos');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
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
          className="bg-rose-50 border border-rose-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 bg-rose-600 text-white rounded-xl shadow-lg flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-5.5 h-5.5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-rose-950 uppercase tracking-tight">
                Atenção: Divergência Detectada entre Guias e Comprovantes!
              </h4>
              <p className="text-rose-700 text-xs mt-1 leading-relaxed">
                Neste período, há <strong className="font-extrabold">{totalGuias} guia(s)</strong> cadastradas e somente <strong className="font-extrabold">{totalComprovantes} comprovante(s)</strong> anexados. Diferença de <strong className="font-extrabold">{difQuantidade} guia(s)</strong> pendente(s) de comprovação de depósito.
              </p>
            </div>
          </div>
          {totalPendentes > 0 && (
            <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Valor Pendente Previsto</span>
              <span className="inline-block bg-rose-100 text-rose-800 text-xs font-black uppercase tracking-tight px-3 py-1.5 rounded-xl border border-rose-200">
                {formatBRLValue(valorPendenteTotal)}
              </span>
            </div>
          )}
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
