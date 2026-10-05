import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const DisputeResolutionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
}> = ({ isOpen, onClose, orderId }) => {
  const { resolveDispute, deliveries } = useApp();
  const [resolution, setResolution] = useState('Numéro secondaire contacté via WhatsApp, client présent à l\'adresse voisine. Livraison en cours.');

  if (!isOpen) return null;

  const order = deliveries.find((d) => d.id === orderId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolveDispute(orderId, resolution);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-red-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg" data-icon="support_agent">support_agent</span>
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Intervention Superviseur Dispatch</h3>
              <p className="text-xs text-red-600 font-semibold">Litige Course {orderId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <span className="material-symbols-outlined text-lg" data-icon="close">close</span>
          </button>
        </div>

        <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200 text-xs space-y-1.5 text-slate-800">
          <div className="flex justify-between">
            <span className="text-slate-500">Expéditeur :</span>
            <span className="font-bold">{order?.pickupLocation.name || 'Kréa Fashion'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Coursier sur place :</span>
            <span className="font-bold">{order?.courier?.name || 'Paul M.'} ({order?.courier?.phone})</span>
          </div>
          <div className="flex justify-between text-red-700 font-semibold">
            <span>Motif du blocage :</span>
            <span>Numéro destinataire injoignable (22 min)</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Décision de régulation / Action Superviseur
            </label>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={3}
              className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none text-slate-900"
              placeholder="Décrivez l'intervention effectuée pour débloquer le coursier..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md active:scale-95"
            >
              Débloquer &amp; Reprendre course
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
