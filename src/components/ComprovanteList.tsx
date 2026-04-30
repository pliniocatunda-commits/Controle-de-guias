import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { Comprovante, Guia } from '../types';
import { 
  FileCheck, Calendar, DollarSign, Search, 
  ArrowLeft, Download, Eye, Filter, FileText, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ComprovanteList() {
  const [comprovantes, setComprovantes] = useState<(Comprovante & { guia?: Guia })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const compSnapshot = await getDocs(query(collection(db, 'comprovantes'), orderBy('createdAt', 'desc')));
        const compData = compSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comprovante));

        // Fetch related guias for names
        const guiasSnapshot = await getDocs(collection(db, 'guias'));
        const guiasMap = new Map(guiasSnapshot.docs.map(d => [d.id, { id: d.id, ...d.data() } as Guia]));

        const enriched = compData.map(c => ({
          ...c,
          guia: c.guiaId ? guiasMap.get(c.guiaId) : undefined
        }));

        setComprovantes(enriched);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filtered = comprovantes.filter(c => 
    c.guia?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.observacoes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="text-4xl font-black tracking-tight text-gray-900">Arquivo de Comprovantes</h1>
        <p className="text-gray-500 font-medium mt-2">Histórico completo de pagamentos validados por IA.</p>
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
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-100 rounded-2xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all">
            <Filter className="w-4 h-4" /> Mês de Ref.
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="p-20 text-center flex flex-col items-center">
               <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin mb-4"></div>
               <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Carregando Arquivo...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-24 text-center">
              <FileCheck className="w-16 h-16 mx-auto text-gray-100 mb-4" />
              <p className="text-gray-400 font-bold">Nenhum comprovante encontrado.</p>
            </div>
          ) : (
            filtered.map((comp) => (
              <motion.div 
                key={comp.id}
                whileHover={{ backgroundColor: '#fafafa' }}
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
                      <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">VALIDADO</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-500" /> R$ {comp.valorPago.toLocaleString()}
                      </span>
                      <span className="text-sm font-medium text-gray-400 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" /> Pago em {format(new Date(comp.dataPagamento), 'dd/MM/yyyy')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                   <button className="p-3 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-all shadow-sm bg-white border border-gray-50">
                     <Eye className="w-5 h-5" />
                   </button>
                   <button className="p-3 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-all shadow-sm bg-white border border-gray-50">
                     <Download className="w-5 h-5" />
                   </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <footer className="mt-8 text-center">
         <p className="text-xs text-gray-400 font-medium italic">Exibindo {filtered.length} comprovantes processados.</p>
      </footer>
    </div>
  );
}
