import React, { useState, useEffect } from 'react';
import { onedriveService, DriveItem } from '../services/onedriveService';
import { Folder, File, ChevronRight, Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  initialFolderId?: string;
  onSelectFolder?: (folder: DriveItem) => void;
  onSelectFile?: (file: DriveItem) => void;
}

export default function OneDriveExplorer({ initialFolderId, onSelectFolder, onSelectFile }: Props) {
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentFolder, setCurrentFolder] = useState<{ id: string, name: string } | null>(() => {
    try {
      const saved = localStorage.getItem('onedrive_last_folder');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error parsing onedrive_last_folder:', e);
    }
    return initialFolderId ? { id: initialFolderId, name: 'Pasta Principal' } : null;
  });

  const [history, setHistory] = useState<{ id: string, name: string }[]>(() => {
    try {
      const saved = localStorage.getItem('onedrive_last_history');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error parsing onedrive_last_history:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      if (currentFolder) {
        localStorage.setItem('onedrive_last_folder', JSON.stringify(currentFolder));
      } else {
        localStorage.removeItem('onedrive_last_folder');
      }
    } catch (e) {
      console.error('Error saving onedrive_last_folder:', e);
    }
  }, [currentFolder]);

  useEffect(() => {
    try {
      localStorage.setItem('onedrive_last_history', JSON.stringify(history));
    } catch (e) {
      console.error('Error saving onedrive_last_history:', e);
    }
  }, [history]);

  useEffect(() => {
    fetchItems();
  }, [currentFolder]);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await onedriveService.listFiles(currentFolder?.id);
      setItems(data);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro para listar arquivos do OneDrive.");
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (folder: DriveItem) => {
    if (folder.folder) {
      if (currentFolder) {
        setHistory([...history, currentFolder]);
      }
      setCurrentFolder({ id: folder.id, name: folder.name });
    }
  };

  const goBack = () => {
    const newHistory = [...history];
    const prev = newHistory.pop();
    setHistory(newHistory);
    setCurrentFolder(prev || null);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {history.length > 0 || currentFolder ? (
            <button onClick={goBack} className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700 transition" title="Voltar">
              <ArrowLeft size={16} />
            </button>
          ) : null}
          <h4 className="text-sm font-bold text-gray-700 break-all pr-2">
            {currentFolder ? currentFolder.name : 'OneDrive / Root'}
          </h4>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {initialFolderId && currentFolder?.id !== initialFolderId && (
            <button 
              type="button"
              onClick={() => {
                setCurrentFolder({ id: initialFolderId, name: 'Pasta Principal' });
                setHistory([]);
              }}
              className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600 hover:text-blue-700 transition-all bg-blue-50 hover:bg-blue-100 border border-blue-200 py-1.5 px-3 rounded-xl active:scale-95"
              title="Ir para a pasta vinculada do departamento"
            >
              Pasta do Depto
            </button>
          )}
          {currentFolder && (
            <button 
              type="button"
              onClick={() => {
                setCurrentFolder(null);
                setHistory([]);
              }}
              className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500 hover:text-red-600 transition-all bg-white hover:bg-gray-100 border border-gray-200 py-1.5 px-3 rounded-xl active:scale-95"
              title="Ir para o diretório raiz"
            >
              Início / Root
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
            <Loader2 className="animate-spin" size={24} />
            <p className="text-xs">Carregando arquivos...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-500">
            <p className="text-sm font-bold">Falha de Autenticação / Conexão</p>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Não foi possível obter dados do OneDrive (Sua sessão expirou ou não está autorizada). Recomenda-se fechar esta janela e conectar novamente no painel principal do OneDrive.
            </p>
            <button
              type="button"
              onClick={fetchItems}
              className="mt-4 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold"
            >
              Tentar Novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-sm">Pasta vazia</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map((item) => (
              <div 
                key={item.id}
                onClick={() => item.folder ? navigateTo(item) : onSelectFile?.(item)}
                className="flex items-start md:items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group transition-colors gap-3"
              >
                <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                  {item.folder ? (
                    <Folder className="text-blue-500 fill-blue-50 shrink-0 mt-0.5 md:mt-0" size={20} />
                  ) : (
                    <File className="text-gray-400 shrink-0 mt-0.5 md:mt-0" size={20} />
                  )}
                  <span className="text-xs md:text-sm text-gray-700 font-semibold break-words pr-2 group-hover:text-blue-600 leading-snug">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                   {!item.folder && (
                     <a 
                      href={item.webUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-gray-400 hover:text-blue-500 rounded hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                      title="Abrir no OneDrive"
                     >
                       <ExternalLink size={14} />
                     </a>
                   )}
                   {item.folder && <ChevronRight size={14} className="text-gray-300" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
