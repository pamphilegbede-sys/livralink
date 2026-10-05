import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const WhatsAppPreviewModal: React.FC = () => {
  const { isWhatsAppModalOpen, setIsWhatsAppModalOpen, whatsAppData, showToast } = useApp();
  const [copied, setCopied] = useState(false);

  if (!isWhatsAppModalOpen || !whatsAppData) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsAppData.message);
    setCopied(true);
    showToast('Message WhatsApp copié dans le presse-papiers !', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    const cleanPhone = whatsAppData.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsAppData.message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
              <span className="material-symbols-outlined text-lg" data-icon="chat">chat</span>
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Contact WhatsApp Direct</h3>
              <p className="text-xs text-slate-500">{whatsAppData.name} • {whatsAppData.phone}</p>
            </div>
          </div>
          <button
            onClick={() => setIsWhatsAppModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <span className="material-symbols-outlined text-lg" data-icon="close">close</span>
          </button>
        </div>

        {/* WhatsApp Chat Simulation Bubble */}
        <div className="bg-[#e5ddd5] p-4 rounded-2xl border border-[#d1d7db] space-y-2 relative overflow-hidden">
          <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm max-w-[90%] text-xs text-slate-800 leading-relaxed space-y-1.5 border border-slate-200">
            <p className="font-semibold text-emerald-800 flex items-center gap-1">
              <span>LivraLink Dispatch</span>
              <span className="text-[10px] text-slate-400 font-normal">Aujourd'hui, 14:32</span>
            </p>
            <p className="whitespace-pre-line">{whatsAppData.message}</p>
            <div className="flex justify-end items-center gap-1 text-[10px] text-slate-400 pt-1">
              <span>14:32</span>
              <span className="material-symbols-outlined text-xs text-blue-500">done_all</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">send</span>
            <span>Ouvrir dans WhatsApp (+225)</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
            <span>{copied ? 'Copié !' : 'Copier le texte du message'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
