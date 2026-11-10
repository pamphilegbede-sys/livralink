import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { ChatMessage, DeliveryOrder } from '../../types';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: DeliveryOrder | null;
}

export const ChatModal: React.FC<ChatModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const {
    currentRole,
    userProfile,
    merchantSettings,
    courierSettings,
    chatMessages,
    sendChatMessage,
    markChatAsRead,
    openWhatsAppModal,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const currentUserId = userProfile?.uid || (currentRole === 'vendeur' ? 'vendor-default' : 'courier-default');

  const contactRole = currentRole === 'vendeur' ? 'livreur' : 'vendeur';
  const contactName = currentRole === 'vendeur'
    ? (order?.courier?.name || 'Livreur Partenaire')
    : (order?.merchantStoreName || order?.pickupLocation?.name || 'Boutique Vendeur');

  const contactId = currentRole === 'vendeur'
    ? (order?.courier?.id || 'courier-target')
    : (order?.merchantId || 'merchant-target');

  const orderId = order?.id;
  const conversationKey = orderId ? `order_${orderId}` : `direct_${contactId}`;

  // Messages for this modal's order or contact (sans messages de test pré-remplis)
  const modalMessages = chatMessages.filter((m) => {
    if (
      m.id?.startsWith('msg-seed') ||
      m.senderName === 'Ibrahim Touré' ||
      m.recipientName === 'Ibrahim Touré' ||
      m.senderName === 'Sarah Kouamé' ||
      m.recipientName === 'Sarah Kouamé'
    ) {
      return false;
    }
    if (orderId && m.orderId === orderId) return true;
    return (
      (m.senderId === contactId && m.recipientId === currentUserId) ||
      (m.senderId === currentUserId && m.recipientId === contactId)
    );
  });

  useEffect(() => {
    if (isOpen) {
      markChatAsRead(conversationKey);
    }
  }, [isOpen, conversationKey, markChatAsRead, modalMessages.length]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, modalMessages]);

  if (!isOpen) return null;

  const handleSend = (e?: React.FormEvent, textPreset?: string, tagPreset?: ChatMessage['quickTag']) => {
    if (e) e.preventDefault();
    const textToSend = textPreset || inputText.trim();
    if (!textToSend) return;

    sendChatMessage({
      orderId,
      recipientId: contactId,
      recipientName: contactName,
      recipientRole: contactRole,
      text: textToSend,
      quickTag: tagPreset,
    });

    if (!textPreset) {
      setInputText('');
    }
  };

  const presets = currentRole === 'vendeur'
    ? [
        { label: '📍 Colis prêt', text: `Bonjour ! Le colis pour la course ${orderId || ''} est prêt à la boutique.`, tag: 'pickup_ready' as const },
        { label: '🔑 Code OTP', text: `Le code secret OTP pour la remise du colis a été généré.`, tag: 'otp' as const },
        { label: '📞 Info Client', text: `Pouvez-vous contacter le client dès votre arrivée ?`, tag: 'client_unreachable' as const },
      ]
    : [
        { label: '📍 Arrivé sur place', text: `Bonjour ! Je suis devant la boutique pour l'enlèvement du colis.`, tag: 'location' as const },
        { label: '📦 Colis récupéré', text: `Colis en main ! Je fais route vers la destination.`, tag: 'pickup_ready' as const },
        { label: '⏳ Retard 10 min', text: `Léger ralentissement sur le trajet. Arrivée estimée dans 10 min.`, tag: 'delay' as const },
      ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 font-['Plus_Jakarta_Sans'] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg h-[82vh] max-h-[680px] flex flex-col overflow-hidden transition-all text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 ${
              contactRole === 'vendeur'
                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200'
                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
            }`}>
              {contactRole === 'vendeur' ? '🛍️' : '🛵'}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-sm truncate">
                  {contactName}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200">
                  {contactRole === 'vendeur' ? 'Vendeur' : 'Livreur'}
                </span>
              </div>
              {orderId && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  Course <span className="font-bold text-blue-600 dark:text-blue-400">{orderId}</span>
                  {order?.dropoffLocation?.commune && ` · ${order.dropoffLocation.commune}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {order?.clientPhone && (
              <button
                type="button"
                onClick={() => {
                  openWhatsAppModal(
                    order.clientPhone,
                    contactName,
                    `Échange concernant la course ${order.id} sur LivraLink.`
                  );
                }}
                className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors"
                title="WhatsApp Direct"
              >
                <span className="material-symbols-outlined text-lg">chat</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Message List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-50/30 dark:bg-slate-950/30">
          {modalMessages.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <span className="material-symbols-outlined text-3xl text-slate-300">chat_bubble_outline</span>
              <p>Démarrez la conversation pour coordonner cette livraison.</p>
            </div>
          ) : (
            modalMessages.map((msg) => {
              const isMe = msg.senderId === currentUserId || msg.senderRole === currentRole;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                    <span className="font-bold">{isMe ? 'Vous' : msg.senderName}</span>
                    <span>·</span>
                    <span className="font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div
                    className={`max-w-xs sm:max-w-md p-3 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                      isMe
                        ? 'bg-blue-600 text-white rounded-br-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-xs'
                    }`}
                  >
                    {msg.quickTag && (
                      <div className="mb-1 text-[10px] font-bold uppercase opacity-90 border-b border-white/20 dark:border-slate-700 pb-0.5">
                        {msg.quickTag === 'location' && '📍 Localisation'}
                        {msg.quickTag === 'otp' && '🔑 OTP'}
                        {msg.quickTag === 'delay' && '⏳ Retard'}
                        {msg.quickTag === 'pickup_ready' && '📦 Enlèvement'}
                        {msg.quickTag === 'client_unreachable' && '❓ Client'}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Presets Drawer */}
        <div className="p-2 px-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold text-slate-400 shrink-0">Rapide :</span>
          {presets.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(undefined, p.text, p.tag)}
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold hover:bg-blue-50 dark:hover:bg-blue-950 transition-all shrink-0 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-3 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Écrivez votre message..."
            className="flex-1 min-h-[40px] px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-600"
          />

          <button
            type="submit"
            disabled={!inputText.trim()}
            className={`min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs text-white transition-all flex items-center gap-1 cursor-pointer ${
              inputText.trim()
                ? 'bg-blue-600 hover:bg-blue-700 shadow-2xs'
                : 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span>Envoyer</span>
            <span className="material-symbols-outlined text-sm">send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
