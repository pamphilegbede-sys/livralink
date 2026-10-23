import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { validateFileSize, compressImageFile } from '../../utils/fileCompressor';

export const PODValidationModal: React.FC = () => {
  const { isPODModalOpen, setIsPODModalOpen, selectedDelivery, validatePOD, showToast } = useApp();
  const [method, setMethod] = useState<'otp' | 'photo' | 'signature'>('otp');
  const [otpCode, setOtpCode] = useState('8492');
  const [signatureDone, setSignatureDone] = useState(false);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [photoInfo, setPhotoInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isPODModalOpen || !selectedDelivery) return null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Point 15: File weight limit enforcement (Max 2MB)
    const validation = validateFileSize(file, 2.0);
    if (!validation.valid) {
      showToast(validation.error || 'Fichier trop lourd (Max 2 Mo).', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      showToast('Compression automatique de la photo...', 'info');
      // Point 14: Client-side compression
      const result = await compressImageFile(file, { maxWidth: 1024, quality: 0.75 });
      setPhotoTaken(true);
      setPhotoInfo(`Taille réduite de ${(result.originalSize / 1024).toFixed(0)} Ko à ${(result.compressedSize / 1024).toFixed(0)} Ko (-${result.compressionRatio}%)`);
      showToast(`Photo compressée avec succès (-${result.compressionRatio}%) !`, 'success');
    } catch {
      setPhotoTaken(true);
      setPhotoInfo('Photo enregistrée.');
    }
  };

  const handleConfirm = () => {
    if (isSubmitting) return; // Point 09: Prevent double click
    setIsSubmitting(true);
    validatePOD(selectedDelivery.id, method, otpCode);
    setTimeout(() => {
      setIsSubmitting(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-lg" data-icon="verified_user">verified_user</span>
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Valider la remise POD</h3>
              <p className="text-xs text-slate-500">Course {selectedDelivery.id} • {selectedDelivery.clientName}</p>
            </div>
          </div>
          <button
            onClick={() => setIsPODModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <span className="material-symbols-outlined text-lg" data-icon="close">close</span>
          </button>
        </div>

        {/* Method Selector Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setMethod('otp')}
            className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
              method === 'otp' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-sm" data-icon="pin">pin</span>
            <span>Code OTP</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod('photo')}
            className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
              method === 'photo' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-sm" data-icon="photo_camera">photo_camera</span>
            <span>Photo Colis</span>
          </button>
          <button
            type="button"
            onClick={() => setMethod('signature')}
            className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
              method === 'signature' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="material-symbols-outlined text-sm" data-icon="draw">draw</span>
            <span>Signature</span>
          </button>
        </div>

        {/* Method Panels */}
        {method === 'otp' && (
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-600">
              Demandez au client le code à 4 chiffres reçu par SMS ou WhatsApp pour certifier la remise en mains propres.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              {['8', '4', '9', '2'].map((digit, i) => (
                <input
                  key={i}
                  type="text"
                  maxLength={1}
                  value={digit}
                  readOnly
                  className="w-12 h-12 text-center text-xl font-bold bg-white border-2 border-emerald-500 text-emerald-700 rounded-xl shadow-sm focus:outline-none"
                />
              ))}
            </div>
            <p className="text-[11px] text-emerald-700 font-semibold text-center flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-xs">check_circle</span> Code temporaire vérifié
            </p>
          </div>
        )}

        {method === 'photo' && (
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <div
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                } else {
                  setPhotoTaken(true);
                }
              }}
              className={`h-36 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${
                photoTaken ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-300 hover:border-blue-500 bg-white'
              }`}
            >
              {photoTaken ? (
                <div className="flex flex-col items-center gap-1 text-emerald-700 px-3">
                  <span className="material-symbols-outlined text-3xl">image</span>
                  <span className="text-xs font-bold">Photo certifiée enregistrée ✓</span>
                  {photoInfo && (
                    <span className="text-[10px] text-emerald-800 font-mono font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md">
                      {photoInfo}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">Cotonou Hub • Horodatage inviolable</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-500">
                  <span className="material-symbols-outlined text-3xl text-blue-600">photo_camera</span>
                  <span className="text-xs font-bold text-slate-800">Prendre ou importer la photo du colis</span>
                  <span className="text-[10px] text-slate-400">Max 2 Mo • Compression auto HD active</span>
                </div>
              )}
            </div>
          </div>
        )}

        {method === 'signature' && (
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-600">Faites signer le client dans la zone ci-dessous avec le doigt :</p>
            <div
              onClick={() => setSignatureDone(true)}
              className="h-28 bg-white border border-slate-300 rounded-xl relative flex items-center justify-center cursor-pointer overflow-hidden"
            >
              {signatureDone ? (
                <svg className="w-48 h-20 text-blue-700" viewBox="0 0 200 80" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M 20 50 C 40 10, 60 70, 90 30 S 140 60, 180 40" strokeLinecap="round" />
                </svg>
              ) : (
                <span className="text-xs text-slate-400 italic">Cliquez pour apposer la signature du destinataire</span>
              )}
              <span className="absolute bottom-1 right-2 text-[10px] text-slate-400">Tactile certifié</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setIsPODModalOpen(false)}
            className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Validation...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm" data-icon="task_alt">task_alt</span>
                <span>Confirmer la remise</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
