import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';

export const PODValidationModal: React.FC = () => {
  const { isPODModalOpen, setIsPODModalOpen, selectedDelivery, validatePOD, showToast, featureFlags } = useApp();

  const requireOtp = featureFlags?.requireOtpPOD ?? true;
  const requirePhoto = featureFlags?.requireLivePhotoPOD ?? true;
  const requireSignature = featureFlags?.requireTactileSignaturePOD ?? true;

  // Wizard state: 1 = OTP, 2 = Photo Directe, 3 = Signature Client & Nom
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // --- Step 1: Code OTP state ---
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '']);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // --- Step 2: Live Camera Direct Photo state ---
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  // --- Step 3: Tactile Signature & Recipient Name state ---
  const [signerName, setSignerName] = useState(selectedDelivery?.clientName || '');
  const [hasSignaturePoints, setHasSignaturePoints] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset or initialize state when modal opens
  useEffect(() => {
    if (isPODModalOpen && selectedDelivery) {
      setCurrentStep(1);
      setOtpDigits(['', '', '', '']);
      setIsOtpVerified(false);
      setOtpError(null);
      setPhotoDataUrl(null);
      setCameraError(null);
      setSignerName(selectedDelivery.clientName || '');
      setHasSignaturePoints(false);
      setSignatureDataUrl(null);
      setIsSubmitting(false);
    } else {
      stopCameraStream();
    }
  }, [isPODModalOpen, selectedDelivery]);

  // Clean camera stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Initialize camera when reaching Step 2
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      console.warn('getUserMedia camera stream failed, falling back to capture input:', err);
      setIsCameraActive(false);
      setCameraError('Caméra directe intégrée indisponible ou permission refusée.');
    }
  }, []);

  useEffect(() => {
    if (currentStep === 2 && !photoDataUrl) {
      startCamera();
    } else {
      stopCameraStream();
    }
  }, [currentStep, photoDataUrl, startCamera, stopCameraStream]);

  // Handle direct snapshot capture from live video
  const takeDirectSnapshot = () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Watermark: Timestamp + Live certification mark
        const now = new Date().toLocaleString('fr-FR');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, canvas.height - 38, canvas.width, 38);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`LIVRALINK POD • ${selectedDelivery?.id} • ${now} • SANS VISAGE`, 14, canvas.height - 14);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPhotoDataUrl(dataUrl);
        stopCameraStream();
        showToast('Photo du colis capturée en direct avec succès !', 'success');
      }
    } catch (err) {
      console.error('Snapshot failed', err);
      showToast('Erreur lors de la capture photo directe.', 'error');
    } finally {
      setIsCapturing(false);
    }
  };

  // Fallback for native devices: direct camera capture only
  const handleDirectCaptureFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setPhotoDataUrl(dataUrl);
        setCameraError(null);
        showToast('Photo directe enregistrée ✓', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  // --- OTP Verification Logic ---
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);
    setOtpError(null);

    // Auto focus next input
    if (value && index < 3) {
      otpInputRefs[index + 1].current?.focus();
    }

    const fullCode = newDigits.join('');
    if (fullCode.length === 4) {
      verifyOtpCode(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    }
  };

  const verifyOtpCode = (enteredCode: string) => {
    const expectedOtp = selectedDelivery?.otpCode || '8492';
    if (enteredCode === expectedOtp) {
      setIsOtpVerified(true);
      setOtpError(null);
      showToast('Code secret OTP client certifié avec succès !', 'success');
    } else {
      setIsOtpVerified(false);
      setOtpError(`Code OTP incorrect (#${enteredCode}). Demandez au client le code 4 chiffres transmis par le vendeur.`);
    }
  };

  // --- High-Sensitivity Tactile Canvas Drawing ---
  useEffect(() => {
    if (currentStep === 3) {
      // Setup canvas with high DPI for retina sharp handwriting
      const timer = setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#1e3a8a'; // Deep indigo ink
          ctx.lineWidth = 2.6;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getCanvasCoords(e);
    pointsRef.current = [pt];

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
      ctx.stroke();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const pt = getCanvasCoords(e);
    pointsRef.current.push(pt);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = pointsRef.current;
    if (points.length >= 3) {
      // Quadratic Bezier midpoint smoothing for natural pen fluidity
      const p1 = points[points.length - 2];
      const p2 = points[points.length - 1];
      const midPoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
      ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
      ctx.stroke();
    }

    if (points.length > 8) {
      setHasSignaturePoints(true);
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && pointsRef.current.length > 8) {
      setHasSignaturePoints(true);
      setSignatureDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearSignatureCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    pointsRef.current = [];
    setHasSignaturePoints(false);
    setSignatureDataUrl(null);
  };

  // Final validation submission (respecting master feature flags)
  const handleFinalCertification = () => {
    if (isSubmitting || !selectedDelivery) return;

    if (requireOtp && !isOtpVerified) {
      showToast('Le code OTP doit être vérifié avant validation.', 'error');
      setCurrentStep(1);
      return;
    }

    if (requirePhoto && !photoDataUrl) {
      showToast('La photo du colis prise en direct est obligatoire.', 'error');
      setCurrentStep(2);
      return;
    }

    const trimmedSigner = signerName.trim();
    if (requireSignature && !trimmedSigner) {
      showToast('Veuillez renseigner le nom et prénom du signataire.', 'error');
      setCurrentStep(3);
      return;
    }

    if (requireSignature && (!hasSignaturePoints || !signatureDataUrl)) {
      showToast('La signature tactile du destinataire est obligatoire.', 'error');
      setCurrentStep(3);
      return;
    }

    setIsSubmitting(true);
    stopCameraStream();

    const fullCode = otpDigits.join('') || selectedDelivery.otpCode || '0000';
    validatePOD(selectedDelivery.id, {
      otpCode: fullCode,
      photoUrl: photoDataUrl || 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500&auto=format&fit=crop&q=60',
      signatureDataUrl: signatureDataUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text x="10" y="40" font-family="sans-serif" font-size="20" fill="navy">Validé par Admin</text></svg>',
      signedByName: trimmedSigner || selectedDelivery.clientName || 'Destinataire Validé',
    });

    setTimeout(() => {
      setIsSubmitting(false);
    }, 1200);
  };

  if (!isPODModalOpen || !selectedDelivery) return null;

  const isAllComplete =
    (!requireOtp || isOtpVerified) &&
    (!requirePhoto || Boolean(photoDataUrl)) &&
    (!requireSignature || (hasSignaturePoints && Boolean(signerName.trim())));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5 my-auto max-h-[95vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl" data-icon="verified_user">verified_user</span>
            </span>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base leading-snug">
                Certification de Livraison (POD)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Course <strong className="text-blue-700 font-mono">{selectedDelivery.id}</strong> • Destinataire : {selectedDelivery.clientName}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCameraStream();
              setIsPODModalOpen(false);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Fermer la fenêtre"
          >
            <span className="material-symbols-outlined text-xl" data-icon="close">close</span>
          </button>
        </div>

        {/* 3 Mandatory Steps Navigation Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>3 Preuves Obligatoires de Remise</span>
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {Number(isOtpVerified) + Number(Boolean(photoDataUrl)) + Number(hasSignaturePoints && Boolean(signerName.trim()))}/3 validées
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Step 1 Tab Button */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border ${
                currentStep === 1
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-200'
                  : isOtpVerified
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">
                  {isOtpVerified ? 'check_circle' : 'pin'}
                </span>
                <span>1. Code OTP</span>
              </div>
              <span className="text-[10px] font-medium opacity-90">
                {isOtpVerified ? 'Vérifié ✓' : 'Obligatoire'}
              </span>
            </button>

            {/* Step 2 Tab Button */}
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border ${
                currentStep === 2
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-200'
                  : photoDataUrl
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">
                  {photoDataUrl ? 'check_circle' : 'photo_camera'}
                </span>
                <span>2. Photo Directe</span>
              </div>
              <span className="text-[10px] font-medium opacity-90">
                {photoDataUrl ? 'Capturée ✓' : 'Sans visage'}
              </span>
            </button>

            {/* Step 3 Tab Button */}
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className={`py-2 px-2.5 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border ${
                currentStep === 3
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-200'
                  : hasSignaturePoints && signerName.trim()
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">
                  {hasSignaturePoints && signerName.trim() ? 'check_circle' : 'draw'}
                </span>
                <span>3. Signature</span>
              </div>
              <span className="text-[10px] font-medium opacity-90">
                {hasSignaturePoints ? 'Signé ✓' : 'Tactile & Nom'}
              </span>
            </button>
          </div>
        </div>

        {/* STEP 1: Code OTP Panel */}
        {currentStep === 1 && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-blue-50/50 to-slate-50 border border-blue-200 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-lg">pin</span>
              </span>
              <div className="space-y-1">
                <h4 className="font-extrabold text-slate-900 text-sm">
                  Étape 1 : Saisie du Code Secret par le Client
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Le client doit taper ici le code à 4 chiffres généré par le vendeur et reçu par SMS ou WhatsApp.
                </p>
              </div>
            </div>

            {/* 4 Digit Inputs */}
            <div className="flex justify-center gap-3 py-2">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={otpInputRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className={`w-14 h-14 text-center text-2xl font-black rounded-2xl border-2 transition-all shadow-sm focus:outline-none ${
                    isOtpVerified
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : otpError
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-slate-300 focus:border-blue-600 bg-white text-slate-900'
                  }`}
                  placeholder="•"
                />
              ))}
            </div>

            {/* OTP Status Messages */}
            {isOtpVerified && (
              <div className="p-3 bg-emerald-100/80 rounded-xl text-emerald-800 text-xs font-bold flex items-center justify-center gap-2 border border-emerald-300">
                <span className="material-symbols-outlined text-base">verified</span>
                <span>Code OTP #{otpDigits.join('')} validé et conforme au vendeur !</span>
              </div>
            )}

            {otpError && (
              <div className="p-3 bg-red-50 rounded-xl text-red-700 text-xs font-bold flex items-center gap-2 border border-red-200">
                <span className="material-symbols-outlined text-base shrink-0">error</span>
                <span>{otpError}</span>
              </div>
            )}

            {/* Helper for Seller / Courier testing */}
            <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="text-[11px]">Code secret vendeur pour ce colis :</span>
              <button
                type="button"
                onClick={() => {
                  const expected = selectedDelivery.otpCode || '8492';
                  setOtpDigits(expected.split(''));
                  verifyOtpCode(expected);
                }}
                className="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-slate-300 hover:bg-blue-50 cursor-pointer"
                title="Remplir automatiquement le code secret du vendeur"
              >
                Remplir #{selectedDelivery.otpCode || '8492'}
              </button>
            </div>

            {/* Forward Button */}
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                disabled={!isOtpVerified}
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <span>Continuer vers Étape 2 (Photo Directe)</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Live Direct Camera Photo Panel */}
        {currentStep === 2 && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 text-white space-y-4 shadow-inner">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                  <h4 className="font-extrabold text-white text-sm">
                    Étape 2 : Photo Directe du Colis (Sans Visage)
                  </h4>
                </div>
                <p className="text-xs text-slate-300">
                  Prenez la photo directement en cadrant le colis avec le client, <strong>sans son visage</strong>.
                </p>
              </div>

              {photoDataUrl && (
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 rounded-full text-[10px] font-bold shrink-0">
                  Photo validée ✓
                </span>
              )}
            </div>

            {/* Camera Viewport or Captured Preview */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-[260px] flex items-center justify-center border-2 border-slate-700">
              {photoDataUrl ? (
                // Captured Photo View
                <div className="relative w-full h-full">
                  <img
                    src={photoDataUrl}
                    alt="Photo directe du colis certifié"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 bg-emerald-600/90 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-md">
                    <span className="material-symbols-outlined text-xs">verified</span>
                    <span>Photo certifiée horodatée</span>
                  </div>
                </div>
              ) : isCameraActive ? (
                // Live Stream Video
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Viewfinder Overlay Guide */}
                  <div className="absolute inset-4 border-2 border-dashed border-white/60 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                    <div className="text-center bg-black/60 text-amber-300 font-bold text-[10px] py-1 px-2 rounded-md self-center backdrop-blur-xs">
                      ✋ Cadrez le colis entre les mains du client • PAS DE VISAGE
                    </div>
                    <div className="text-center bg-black/60 text-white/80 text-[9px] py-0.5 px-2 rounded-md self-center">
                      Capture directe live obligatoire (Aucun import galerie permis)
                    </div>
                  </div>
                </div>
              ) : (
                // Camera Inactive / Error Fallback
                <div className="p-6 text-center space-y-3">
                  <span className="material-symbols-outlined text-4xl text-amber-400">videocam_off</span>
                  <p className="text-xs text-slate-300">
                    {cameraError || 'La caméra directe n\'est pas encore active.'}
                  </p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    Réactiver la caméra directe
                  </button>
                </div>
              )}
            </div>

            {/* Direct Camera Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              {photoDataUrl ? (
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoDataUrl(null);
                      startCamera();
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-slate-700"
                  >
                    <span className="material-symbols-outlined text-sm">replay</span>
                    <span>Reprendre la photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
                  >
                    <span>Valider &amp; Passer à l'Étape 3</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="py-2 px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1 hover:text-white"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Étape 1</span>
                  </button>

                  {/* Main Shutter Button */}
                  <button
                    type="button"
                    disabled={isCapturing || !isCameraActive}
                    onClick={takeDirectSnapshot}
                    className="py-2.5 px-5 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-red-600/40 transition-all disabled:opacity-50"
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-white animate-pulse"></span>
                    <span>Prendre la photo en direct</span>
                  </button>

                  {/* Fallback Native Direct Camera Trigger */}
                  <input
                    ref={directFileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleDirectCaptureFallback}
                  />
                  <button
                    type="button"
                    onClick={() => directFileInputRef.current?.click()}
                    className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold flex items-center gap-1"
                    title="Déclencher directement l'appareil photo du smartphone"
                  >
                    <span className="material-symbols-outlined text-sm">photo_camera</span>
                    <span>Caméra mobile</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Tactile Sensitive Signature & Recipient Name */}
        {currentStep === 3 && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-indigo-50/50 to-slate-50 border border-indigo-200 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">draw</span>
              </span>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    Étape 3 : Signature Tactile &amp; Nom du Destinataire
                  </h4>
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">
                    📱 Donnez le smartphone au client
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Le client renseigne son nom et signe directement avec son doigt sur l'écran tactile.
                </p>
              </div>
            </div>

            {/* Recipient Full Name Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Nom complet du signataire / destinataire <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Ex : Sarah Kouamé"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-600 bg-white text-slate-900 text-xs font-bold focus:outline-none shadow-xs"
              />
            </div>

            {/* High Sensitivity Retina Canvas */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Zone de signature tactile <span className="text-red-500">*</span></span>
                <button
                  type="button"
                  onClick={clearSignatureCanvas}
                  className="text-slate-500 hover:text-red-600 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-xs">delete</span>
                  <span>Effacer</span>
                </button>
              </div>

              <div className="relative border-2 border-indigo-200 rounded-2xl bg-white overflow-hidden shadow-inner touch-none">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="w-full h-36 cursor-crosshair block"
                  style={{ touchAction: 'none' }}
                />
                {!hasSignaturePoints && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 gap-1">
                    <span className="material-symbols-outlined text-2xl text-indigo-400/80">edit</span>
                    <span className="text-xs italic font-medium">
                      Apposez votre signature ici avec votre doigt
                    </span>
                  </div>
                )}
                <div className="absolute bottom-1 right-2 text-[10px] text-slate-400 font-mono pointer-events-none">
                  Tactile haute sensibilité LivraLink
                </div>
              </div>
            </div>

            {hasSignaturePoints && (
              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>Signature tactile enregistrée ✓</span>
              </div>
            )}
          </div>
        )}

        {/* Global Summary Badge of the 3 Options */}
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1.5">
          <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
            Statut des 3 composantes obligatoires :
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className={`p-2 rounded-xl flex items-center gap-1.5 font-bold ${
              isOtpVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
            }`}>
              <span className="material-symbols-outlined text-sm">
                {isOtpVerified ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>1. Code OTP</span>
            </div>

            <div className={`p-2 rounded-xl flex items-center gap-1.5 font-bold ${
              photoDataUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
            }`}>
              <span className="material-symbols-outlined text-sm">
                {photoDataUrl ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>2. Photo directe</span>
            </div>

            <div className={`p-2 rounded-xl flex items-center gap-1.5 font-bold ${
              hasSignaturePoints && signerName.trim() ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
            }`}>
              <span className="material-symbols-outlined text-sm">
                {hasSignaturePoints && signerName.trim() ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>3. Signature</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              stopCameraStream();
              setIsPODModalOpen(false);
            }}
            className="py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            Fermer
          </button>

          <button
            type="button"
            disabled={!isAllComplete || isSubmitting}
            onClick={handleFinalCertification}
            className={`py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${
              isAllComplete
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-emerald-600/30'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Certification en cours...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">task_alt</span>
                <span>Certifier la livraison (3/3)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
