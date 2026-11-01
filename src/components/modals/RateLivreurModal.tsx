import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DeliveryOrder } from '../../types';

interface RateLivreurModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: DeliveryOrder | null;
}

export const RateLivreurModal: React.FC<RateLivreurModalProps> = ({ isOpen, onClose, order }) => {
  const { rateCourier, showToast, merchantSettings } = useApp();

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([
    'Ponctualité & Rapidité',
    'Soin du colis',
    'Courtoisie & Politesse',
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order?.courierRating) {
      setRating(order.courierRating.rating || 5);
      setComment(order.courierRating.comment || '');
      if (order.courierRating.tags) setSelectedTags(order.courierRating.tags);
    } else {
      setRating(5);
      setComment('');
      setSelectedTags(['Ponctualité & Rapidité', 'Soin du colis', 'Courtoisie & Politesse']);
    }
  }, [order]);

  if (!isOpen || !order || !order.courier) return null;

  const courier = order.courier;

  const availableTags = [
    { id: 'rapidite', label: '⚡ Ponctualité & Rapidité' },
    { id: 'soin', label: '📦 Soin du colis' },
    { id: 'courtoisie', label: '😊 Courtoisie & Politesse' },
    { id: 'communication', label: '📞 Communication claire' },
    { id: 'consignes', label: '🛡️ Respect des consignes' },
    { id: 'recommande', label: '⭐ Recommandé aux marchands' },
  ];

  const toggleTag = (label: string) => {
    setSelectedTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  };

  const getRatingLabel = (stars: number) => {
    switch (stars) {
      case 1:
        return '1 / 5 - Insatisfaisant';
      case 2:
        return '2 / 5 - Moyen';
      case 3:
        return '3 / 5 - Bon travail';
      case 4:
        return '4 / 5 - Très satisfait';
      case 5:
        return '5 / 5 - Prestation exceptionnelle !';
      default:
        return `${stars} / 5`;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courier) return;

    setIsSubmitting(true);
    const storeName = merchantSettings.storeName || 'Commerçant LivraLink';

    rateCourier(order.id, courier.id, rating, comment.trim(), selectedTags, storeName);
    showToast(`⭐ Votre avis (${rating}/5) sur ${courier.name} a été enregistré avec succès !`, 'success');
    setIsSubmitting(false);
    onClose();
  };

  const activeStarCount = hoverRating || rating;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
              <span className="material-symbols-outlined text-2xl">reviews</span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Évaluer le livreur
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Course {order.id} • Destination {order.dropoffLocation.commune}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            title="Fermer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Courier Summary Card */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              {courier.avatarInitials || courier.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                {courier.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {courier.vehicle} {courier.vehiclePlate ? `• ${courier.vehiclePlate}` : ''} • {courier.phone}
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 text-xs">
          {/* Star Selection */}
          <div className="text-center space-y-2">
            <label className="block text-slate-700 dark:text-slate-300 font-extrabold text-xs uppercase tracking-wider">
              Votre note globale
            </label>

            <div className="flex items-center justify-center gap-2 py-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = star <= activeStarCount;
                return (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="p-1 text-3xl sm:text-4xl transition-transform hover:scale-125 active:scale-95 cursor-pointer focus:outline-none"
                    title={`Noter ${star} étoile${star > 1 ? 's' : ''}`}
                  >
                    <span
                      className={`material-symbols-outlined text-3xl sm:text-4xl transition-colors ${
                        isFilled
                          ? 'text-amber-400 drop-shadow-[0_2px_4px_rgba(251,191,36,0.4)]'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                    >
                      star
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {getRatingLabel(activeStarCount)}
            </div>
          </div>

          {/* Quick Compliment Tags */}
          <div className="space-y-2">
            <label className="block text-slate-700 dark:text-slate-300 font-bold">
              Points forts constatés
            </label>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag.label);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.label)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Review Textarea */}
          <div className="space-y-1.5">
            <label className="block text-slate-700 dark:text-slate-300 font-bold">
              Commentaire ou recommandation (optionnel)
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ex: Livreur très sérieux, poli et rapide. Mon client a salué la ponctualité."
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-amber-500 transition-all resize-none text-xs"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold shadow-md shadow-orange-500/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">star</span>
              <span>Enregistrer la note</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
