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
  const [history, setHistory] = useState<{ id: string, name: string }[]>([]);
  const [currentFolder, setCurrentFolder] = useState<{ id: string, name: string } | null>(
    initialFolderId ? { id: initialFolderId, name: 'Pasta Principal' } : null
  );

  useEffect(() => {
    fetchItems();
  }, [currentFolder]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await onedriveService.listFiles(currentFolder?.id);
      setItems(data);
    } catch (err) {
      console.error(err);
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
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {history.length > 0 || currentFolder ? (
            <button onClick={goBack} className="p-1 hover:bg-gray-200 rounded">
              <ArrowLeft size={16} />
            </button>
          ) : null}
          <h4 className="text-sm font-bold text-gray-700">
            {currentFolder ? currentFolder.name : 'OneDrive / Root'}
          </h4>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
            <Loader2 className="animate-spin" size={24} />
            <p className="text-xs">Carregando arquivos...</p>
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
                className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-3">
                  {item.folder ? (
                    <Folder className="text-blue-500 fill-blue-50" size={20} />
                  ) : (
                    <File className="text-gray-400" size={20} />
                  )}
                  <span className="text-sm text-gray-700 truncate max-w-[200px] group-hover:text-blue-600">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                   {!item.folder && (
                     <a 
                      href={item.webUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-gray-400 hover:text-blue-500 rounded hover:bg-white transition-all opacity-0 group-hover:opacity-100"
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
