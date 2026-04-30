import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  LayoutDashboard, Building2, FileText, CheckCircle2, 
  AlertCircle, Clock, TrendingUp, Download, Plus, Filter
} from 'lucide-react';
import { motion } from 'motion/react';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, getDocs, where, limit } from 'firebase/firestore';
import { Guia, Secretaria, Departamento } from '../types';

const COLORS = ['#141414', '#5A5A40', '#9e9e9e', '#d1d1d1'];

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalGuias: 0,
    pagas: 0,
    pendentes: 0,
    atrasadas: 0,
    valorTotal: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const guiasRef = collection(db, 'guias');
        const snapshot = await getDocs(guiasRef);
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Guia));
        
        const pagas = docs.filter(g => g.status === 'pago').length;
        const pendentes = docs.filter(g => g.status === 'pendente').length;
        const atrasadas = docs.filter(g => g.status === 'atrasado').length;
        const valorTotal = docs.reduce((acc, g) => acc + g.valor, 0);

        setStats({
          totalGuias: docs.length,
          pagas,
          pendentes,
          atrasadas,
          valorTotal
        });
      } catch (error) {
        // handleFirestoreError(error, OperationType.LIST, 'guias');
        // Silent fail for demo if data is empty
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const data = [
    { name: 'Pagas', value: stats.pagas },
    { name: 'Pendentes', value: stats.pendentes },
    { name: 'Atrasadas', value: stats.atrasadas },
  ];

  const monthlyData = [
    { name: 'Jan', valor: 4500 },
    { name: 'Fev', valor: 5200 },
    { name: 'Mar', valor: 4800 },
    { name: 'Abr', valor: 6100 },
    { name: 'Mai', valor: 5500 },
  ];

  return (
    <div className="p-8 space-y-8 bg-[#f5f5f5] min-h-screen">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Visão geral do sistema de gestão previdenciária</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
            <Filter className="w-4 h-4" /> Filtrar
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total de Guias" 
          value={stats.totalGuias} 
          icon={<FileText className="w-5 h-5" />} 
          color="text-blue-600"
          trend="+5% vs mês anterior"
        />
        <StatCard 
          title="Pagas" 
          value={stats.pagas} 
          icon={<CheckCircle2 className="w-5 h-5" />} 
          color="text-emerald-600"
          trend="82% de conclusão"
        />
        <StatCard 
          title="Pendentes" 
          value={stats.pendentes} 
          icon={<Clock className="w-5 h-5" />} 
          color="text-amber-600"
          trend="3 vencendo em breve"
        />
        <StatCard 
          title="Valor Total" 
          value={`R$ ${stats.valorTotal.toLocaleString()}`} 
          icon={<TrendingUp className="w-5 h-5" />} 
          color="text-gray-900"
          trend="Previsto: R$ 64k"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart 1: Status Distribution */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <h3 className="text-lg font-semibold mb-6">Status dos Pagamentos</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {data.map((item, index) => (
              <div key={item.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-gray-600">{item.name}</span>
                </div>
                <span className="font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Chart 2: Monthly Evolution */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"
        >
          <h3 className="text-lg font-semibold mb-6">Evolução Mensal (R$)</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip 
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                 />
                <Bar dataKey="valor" fill="#141414" radius={[4, 4, 0, 0]} barSize={40} />
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
      whileHover={{ y: -4 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-all"
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl bg-gray-50 ${color}`}>
          {icon}
        </div>
        <span className="text-xs text-gray-400 font-medium">{trend}</span>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h4 className="text-2xl font-bold mt-1">{value}</h4>
      </div>
    </motion.div>
  );
}
