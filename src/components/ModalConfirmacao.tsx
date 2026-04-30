import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle, X, HelpCircle } from 'lucide-react';

interface ModalConfirmacaoProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
}

export default function ModalConfirmacao({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'info'
}: ModalConfirmacaoProps) {
  const themes = {
    danger: {
      icon: <AlertCircle className="w-8 h-8 text-rose-500" />,
      button: 'bg-rose-500 hover:bg-rose-600 shadow-rose-200',
      bg: 'bg-rose-50',
      text: 'text-rose-900'
    },
    warning: {
      icon: <HelpCircle className="w-8 h-8 text-amber-500" />,
      button: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
      bg: 'bg-amber-50',
      text: 'text-amber-900'
    },
    success: {
      icon: <CheckCircle className="w-8 h-8 text-emerald-500" />,
      button: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200',
      bg: 'bg-emerald-50',
      text: 'text-emerald-900'
    },
    info: {
      icon: <HelpCircle className="w-8 h-8 text-blue-500" />,
      button: 'bg-black hover:bg-gray-800 shadow-gray-200',
      bg: 'bg-blue-50',
      text: 'text-blue-900'
    }
  };

  const theme = themes[type];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl relative z-10"
          >
            <div className={`p-8 ${theme.bg} flex flex-col items-center text-center`}>
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                {theme.icon}
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">{title}</h3>
              <p className="text-sm font-medium text-gray-600 leading-relaxed tabular-nums">
                {message}
              </p>
            </div>
            
            <div className="p-8 flex flex-col gap-3">
              <button 
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`w-full py-4 rounded-2xl text-white font-bold text-sm tracking-widest uppercase transition-all shadow-lg active:scale-95 ${theme.button}`}
              >
                {confirmText}
              </button>
              <button 
                onClick={onClose}
                className="w-full py-4 text-gray-400 font-bold text-[10px] uppercase tracking-widest hover:text-black transition-colors"
              >
                {cancelText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
