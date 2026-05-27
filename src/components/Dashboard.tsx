import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { 
  FileText, CheckCircle2, TrendingUp, Download, Filter,
  DollarSign, FileCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Guia, Comprovante } from '../types';

const formatBRLValue = (val: number): string => {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const normalizeValue = (val: number | string | undefined | null): number => {
  if (val === undefined || val === null) return 0;
  let num = typeof val === 'string' ? parseFloat(val.replace(/\./g, "").replace(",", ".")) : val;
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

  // Filter lists based on selected criteria
  const filteredGuias = allGuias.filter(g => {
    const matchMes = selectedMes === 'todos' || g.mes === selectedMes;
    const matchAno = selectedAno === 'todos' || g.ano === selectedAno;
    return matchMes && matchAno;
  });

  const filteredComprovantes = allComprovantes.filter(c => {
    const matchMes = selectedMes === 'todos' || c.mes === selectedMes;
    const matchAno = selectedAno === 'todos' || c.ano === selectedAno;
    return matchMes && matchAno;
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

  const valorTotalPago = filteredGuias
    .filter(g => g.status === 'pago')
    .reduce((acc, g) => acc + (g.valorPago || g.valor || 0), 0);

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

  // Populate monthly trends from ALL guides matching the active year filter
  allGuias.forEach(g => {
    if (selectedAno !== 'todos' && g.ano !== selectedAno) {
      return;
    }
    if (g.mes >= 1 && g.mes <= 12 && g.status === 'pago') {
      const val = g.valorPago || g.valor || 0;
      monthlyData[g.mes - 1].valor += val;
    }
  });

  const formattedMonthlyData = monthlyData.map(m => ({
    name: m.name,
    valor: parseFloat(m.valor.toFixed(2))
  }));

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
                ? 'bg-[#141414] text-white border-transparent'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" /> Visualizar Acumulado
          </button>
        </div>
      </header>

      {/* Filter Row */}
      <section className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest text-[10px]">Mês de Ref.</span>
            <select 
              value={selectedMes} 
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMes(val === 'todos' ? 'todos' : Number(val));
              }}
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none transition-all cursor-pointer min-w-[150px]"
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

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest text-[10px]">Ano Fiscal</span>
            <select 
              value={selectedAno} 
              onChange={(e) => {
                const val = e.target.value;
                setSelectedAno(val === 'todos' ? 'todos' : Number(val));
              }}
              className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none transition-all cursor-pointer min-w-[120px]"
            >
              <option value="todos">Todos os Anos</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-amber-600 font-bold bg-amber-50/50 border border-amber-100 py-1.5 px-3 rounded-lg flex items-center gap-1.5 self-stretch sm:self-auto text-center justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Filtros ativos determinam as métricas exibidas nos painéis
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Total de Guias" 
          value={totalGuias} 
          icon={<FileText className="w-5 h-5" />} 
          color="text-blue-600 bg-blue-50/40 border border-blue-100"
          trend={selectedMes === 'todos' && selectedAno === 'todos' ? "Filtro: Todos os Períodos" : "Referente ao período filtrado"}
        />
        <StatCard 
          title="Total de Comprovantes" 
          value={totalComprovantes} 
          icon={<FileCheck className="w-5 h-5" />} 
          color="text-emerald-600 bg-emerald-50/40 border border-emerald-100"
          trend={`${totalGuias > 0 ? Math.round((totalComprovantes / totalGuias) * 100) : 0}% guias comprovadas`}
        />
        <StatCard 
          title="Valor Total Recebido" 
          value={formatBRLValue(valorTotalPago)} 
          icon={<DollarSign className="w-5 h-5" />} 
          color="text-zinc-900 bg-zinc-50 border border-zinc-200/50"
          trend="Total comprovado em contas"
        />
      </div>

      {/* Main Stats Chart */}
      <div className="grid grid-cols-1 gap-8">
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
                  width={95}
                  tick={{ fontSize: 11, fill: '#8C94A6' }} 
                  tickFormatter={(v) => formatBRLValue(v)}
                />
                <Tooltip 
                  cursor={{ fill: '#fafafa' }}
                  contentStyle={{ borderRadius: '14px', border: '1px solid #f1f2f4', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
                  formatter={(v: any) => [formatBRLValue(v), "Valor Pago Benefícios"]}
                 />
                <Bar dataKey="valor" fill="#141414" radius={[6, 6, 0, 0]} barSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, trend }: { title: string, value: string | number, icon: React.ReactNode, color: string, trend: string }) {
  return (
    <motion.div 
      whileHover={{ y: -3 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:border-gray-200 transition-all flex flex-col justify-between"
    >
      <div className="flex justify-between items-center mb-5">
        <div className={`p-3 rounded-xl ${color}`}>
          {icon}
        </div>
        <span className="text-[11px] text-gray-400 font-bold bg-gray-50/70 border border-gray-100 py-1 px-2.5 rounded-full uppercase tracking-wider">{trend}</span>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-[10px]">{title}</p>
        <h4 className="text-3xl font-black mt-1.5 text-gray-905">{value}</h4>
      </div>
    </motion.div>
  );
}
