import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { MobileBottomNav } from '../common/MobileBottomNav';
import { ChatMessage, UserRole } from '../../types';

export const ChatView: React.FC = () => {
  const {
    currentRole,
    userProfile,
    merchantSettings,
    courierSettings,
    deliveries,
    chatMessages,
    sendChatMessage,
    markChatAsRead,
    openWhatsAppModal,
    showToast,
    chatActiveTarget,
    setChatActiveTarget,
    setCurrentView
  } = useApp();

  const currentUserId = userProfile?.uid || (currentRole === 'vendeur' ? 'vendor-default' : 'courier-default');
  const currentUserName = currentRole === 'vendeur'
    ? (merchantSettings.storeName || userProfile?.fullName || 'Vendeur LivraLink')
    : (courierSettings.fullName || userProfile?.fullName || 'Livreur Partenaire');

  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [showMobileList, setShowMobileList] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Derive unique conversations list from chatMessages and active deliveries
  const conversations = useMemo(() => {
    const map = new Map<string, {
      key: string;
      orderId?: string;
      contactId: string;
      contactName: string;
      contactRole: UserRole;
      contactPhone?: string;
      contactSubtitle?: string;
      lastMessage: string;
      lastTimestamp: string;
      unreadCount: number;
    }>();

    // 1. Process existing messages (excluant tout chat de test pré-rempli)
    chatMessages.forEach((msg) => {
      // Ignorer les anciens messages de test pré-remplis
      if (
        msg.id?.startsWith('msg-seed') ||
        msg.senderName === 'Ibrahim Touré' ||
        msg.recipientName === 'Ibrahim Touré' ||
        msg.senderName === 'Sarah Kouamé' ||
        msg.recipientName === 'Sarah Kouamé' ||
        msg.orderId === '#LL-4192'
      ) {
        return;
      }

      const isMeSender =
        msg.senderId === currentUserId ||
        (userProfile?.fullName && msg.senderName.toLowerCase() === userProfile.fullName.toLowerCase()) ||
        (!userProfile && msg.senderRole === currentRole);

      const isMeRecipient =
        msg.recipientId === currentUserId ||
        (userProfile?.fullName && msg.recipientName.toLowerCase() === userProfile.fullName.toLowerCase()) ||
        (!userProfile && msg.recipientRole === currentRole);

      // Si l'utilisateur est authentifié, n'afficher que les messages le concernant directement
      if (userProfile && !isMeSender && !isMeRecipient) {
        return;
      }

      const contactId = isMeSender ? msg.recipientId : msg.senderId;
      const contactName = isMeSender ? msg.recipientName : msg.senderName;
      const contactRole = isMeSender ? msg.recipientRole : msg.senderRole;
      const key = msg.orderId ? `order_${msg.orderId}` : `direct_${contactId}`;

      const existing = map.get(key);
      const isUnread = !isMeSender && !msg.isRead;

      if (!existing || new Date(msg.timestamp) > new Date(existing.lastTimestamp)) {
        map.set(key, {
          key,
          orderId: msg.orderId,
          contactId,
          contactName,
          contactRole,
          lastMessage: msg.text,
          lastTimestamp: msg.timestamp,
          unreadCount: (existing?.unreadCount || 0) + (isUnread ? 1 : 0),
        });
      } else if (isUnread) {
        existing.unreadCount += 1;
      }
    });

    // 2. Populate conversations from active user deliveries if missing (uniquement les livraisons du compte actuel)
    deliveries.forEach((d) => {
      if (d.id === '#LL-4192') return;

      if (currentRole === 'vendeur') {
        const isMyDelivery = !userProfile ||
          d.merchantId === currentUserId ||
          (d.merchantEmail && userProfile.email && d.merchantEmail.toLowerCase() === userProfile.email.toLowerCase()) ||
          (d.merchantStoreName && userProfile.storeName && d.merchantStoreName.toLowerCase() === userProfile.storeName.toLowerCase());

        if (!isMyDelivery) return;

        const orderKey = `order_${d.id}`;
        if (!map.has(orderKey) && d.courier) {
          map.set(orderKey, {
            key: orderKey,
            orderId: d.id,
            contactId: d.courier.id,
            contactName: d.courier.name,
            contactRole: 'livreur',
            contactPhone: d.courier.phone,
            contactSubtitle: `Moto ${d.courier.vehicle || ''} · ★ ${d.courier.rating || 4.9}`,
            lastMessage: `Course ${d.id} en cours (${d.dropoffLocation.commune})`,
            lastTimestamp: d.createdAt || new Date().toISOString(),
            unreadCount: 0,
          });
        }
      } else if (currentRole === 'livreur') {
        const isMyDelivery = !userProfile ||
          d.courier?.id === currentUserId ||
          (d.courier?.email && userProfile.email && d.courier.email.toLowerCase() === userProfile.email.toLowerCase()) ||
          (d.courier?.name && userProfile.fullName && d.courier.name.toLowerCase() === userProfile.fullName.toLowerCase());

        if (!isMyDelivery) return;

        const orderKey = `order_${d.id}`;
        if (!map.has(orderKey)) {
          const storeName = d.merchantStoreName || d.pickupLocation.name || 'Boutique Partenaire';
          map.set(orderKey, {
            key: orderKey,
            orderId: d.id,
            contactId: d.merchantId || 'merchant-owner',
            contactName: storeName,
            contactRole: 'vendeur',
            contactSubtitle: `Pickup : ${d.pickupLocation.commune}`,
            lastMessage: `Commande ${d.id} (${d.itemDescription})`,
            lastTimestamp: d.createdAt || new Date().toISOString(),
            unreadCount: 0,
          });
        }
      }
    });

    // Sort by last timestamp descending
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
    );
  }, [chatMessages, deliveries, currentUserId, currentRole, userProfile]);

  // Set initial selected conversation or react to chatActiveTarget prop
  useEffect(() => {
    if (chatActiveTarget?.orderId) {
      const key = `order_${chatActiveTarget.orderId}`;
      setSelectedConversationKey(key);
      setShowMobileList(false);
    } else if (conversations.length > 0) {
      if (!selectedConversationKey || !conversations.some((c) => c.key === selectedConversationKey)) {
        setSelectedConversationKey(conversations[0].key);
      }
    } else {
      setSelectedConversationKey(null);
    }
  }, [chatActiveTarget, conversations, selectedConversationKey]);

  // Auto-scroll chat window to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, selectedConversationKey]);

  // Active conversation object
  const activeConversation = useMemo(() => {
    if (conversations.length === 0) return null;
    return conversations.find((c) => c.key === selectedConversationKey) || conversations[0] || null;
  }, [conversations, selectedConversationKey]);

  // Filter messages for active conversation
  const activeMessages = useMemo(() => {
    if (!activeConversation) return [];
    if (activeConversation.orderId) {
      return chatMessages.filter((m) => m.orderId === activeConversation.orderId);
    }
    return chatMessages.filter(
      (m) =>
        (m.senderId === activeConversation.contactId && m.recipientId === currentUserId) ||
        (m.senderId === currentUserId && m.recipientId === activeConversation.contactId)
    );
  }, [chatMessages, activeConversation, currentUserId]);

  // Mark active messages as read
  useEffect(() => {
    if (activeConversation) {
      markChatAsRead(activeConversation.key);
    }
  }, [activeConversation, activeMessages.length, markChatAsRead]);

  // Filter conversation list by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contactName.toLowerCase().includes(q) ||
        (c.orderId && c.orderId.toLowerCase().includes(q)) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  // Associated delivery order for context header
  const activeDelivery = useMemo(() => {
    if (!activeConversation?.orderId) return null;
    return deliveries.find((d) => d.id === activeConversation.orderId) || null;
  }, [deliveries, activeConversation]);

  const handleSendMessage = (e?: React.FormEvent, presetText?: string, quickTag?: ChatMessage['quickTag']) => {
    if (e) e.preventDefault();
    const textToSend = presetText || inputText.trim();
    if (!textToSend || !activeConversation) return;

    sendChatMessage({
      orderId: activeConversation.orderId,
      recipientId: activeConversation.contactId,
      recipientName: activeConversation.contactName,
      recipientRole: activeConversation.contactRole,
      text: textToSend,
      quickTag,
    });

    if (!presetText) {
      setInputText('');
    }
  };

  const handlePresetClick = (preset: { label: string; text: string; tag: ChatMessage['quickTag'] }) => {
    handleSendMessage(undefined, preset.text, preset.tag);
  };

  // Quick preset chips for rapid delivery coordination
  const presets = currentRole === 'vendeur'
    ? [
        { label: '📍 Point de collecte', text: `Le colis est prêt à notre boutique pour l'enlèvement.`, tag: 'pickup_ready' as const },
        { label: '🔑 Code OTP Client', text: `Le code secret OTP pour la validation POD a été généré.`, tag: 'otp' as const },
        { label: '📞 Contact Client', text: `Pouvez-vous contacter le destinataire à l'approche ?`, tag: 'client_unreachable' as const },
        { label: '⚠️ Consigne Spéciale', text: `Colis fragile. Merci de manipuler avec précaution.`, tag: 'delay' as const },
      ]
    : [
        { label: '📍 Arrivé sur place', text: `Je suis arrivé devant la boutique pour récupérer le colis.`, tag: 'location' as const },
        { label: '📦 Colis récupéré', text: `Colis en main. Je démarre le trajet vers le client.`, tag: 'pickup_ready' as const },
        { label: '⏳ Légère attente', text: `Ralentissement trafic. Arrivée estimée dans 10 minutes.`, tag: 'delay' as const },
        { label: '❓ Client Injoignable', text: `Je suis sur le lieu de livraison mais le client ne répond pas.`, tag: 'client_unreachable' as const },
      ];

  return (
    <div className="flex h-full min-h-[100dvh] md:h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Plus_Jakarta_Sans'] transition-colors duration-200">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
        <Header
          title="Messagerie Directe &amp; Coordination"
          subtitle={currentRole === 'vendeur' ? 'Discussions en direct avec vos livreurs partenaires' : 'Discussions en direct avec les boutiques et vendeurs'}
        />

        <main className="flex-1 overflow-hidden p-2 sm:p-4 md:p-6 pb-20 md:pb-6 max-w-7xl w-full mx-auto flex flex-col">
          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl md:rounded-3xl shadow-sm overflow-hidden flex flex-col md:flex-row">
            
            {/* Left Conversations Sidebar */}
            <div
              className={`w-full md:w-80 lg:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/60 ${
                !showMobileList && 'hidden md:flex'
              }`}
            >
              {/* Sidebar Header & Search */}
              <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-xl">forum</span>
                    <h2 className="font-extrabold text-sm text-slate-900 dark:text-white">Conversations</h2>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {conversations.length} actives
                  </span>
                </div>

                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher course, livreur, boutique..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredConversations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                    <span className="material-symbols-outlined text-3xl text-slate-300">chat_bubble_outline</span>
                    <p>Aucune conversation trouvée.</p>
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isSelected = c.key === activeConversation?.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => {
                          setSelectedConversationKey(c.key);
                          setShowMobileList(false);
                        }}
                        className={`w-full p-3.5 text-left flex items-start gap-3 transition-colors cursor-pointer select-none ${
                          isSelected
                            ? 'bg-blue-50/80 dark:bg-blue-950/60 border-l-4 border-blue-600'
                            : 'hover:bg-white dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs ${
                            c.contactRole === 'vendeur'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
                          }`}>
                            {c.contactRole === 'vendeur' ? '🛍️' : '🛵'}
                          </div>
                          {c.unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                              {c.contactName}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                              {new Date(c.lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {c.orderId && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                {c.orderId}
                              </span>
                              {c.contactSubtitle && (
                                <span className="text-[10px] text-slate-400 truncate">
                                  · {c.contactSubtitle}
                                </span>
                              )}
                            </div>
                          )}

                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-1">
                            {c.lastMessage}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Main Active Chat Area */}
            <div
              className={`flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 ${
                showMobileList ? 'hidden md:flex' : 'flex'
              }`}
            >
              {activeConversation ? (
                <>
                  {/* Chat Top Header */}
                  <div className="p-3.5 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => setShowMobileList(true)}
                        className="md:hidden p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                        title="Retour aux conversations"
                      >
                        <span className="material-symbols-outlined text-xl">arrow_back</span>
                      </button>

                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        activeConversation.contactRole === 'vendeur'
                          ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {activeConversation.contactRole === 'vendeur' ? '🛍️' : '🛵'}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                            {activeConversation.contactName}
                          </h3>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                            activeConversation.contactRole === 'vendeur'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200'
                          }`}>
                            {activeConversation.contactRole === 'vendeur' ? 'Boutique' : 'Livreur'}
                          </span>
                        </div>

                        {activeDelivery ? (
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                              {activeDelivery.id}
                            </span>
                            <span>·</span>
                            <span>{activeDelivery.dropoffLocation.commune}</span>
                            <span>·</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {activeDelivery.status === 'en_cours' ? 'En transit' : activeDelivery.status === 'livree' ? 'Livrée (POD)' : 'En attente'}
                            </span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            Messagerie directe securisée LivraLink
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Quick Call & WhatsApp Header Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {activeDelivery?.clientPhone && (
                        <button
                          type="button"
                          onClick={() => {
                            openWhatsAppModal(
                              activeDelivery.clientPhone,
                              activeConversation.contactName,
                              `Bonjour, échange concernant la course ${activeDelivery.id} sur LivraLink.`
                            );
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold text-xs hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                          title="Ouvrir WhatsApp"
                        >
                          <span className="material-symbols-outlined text-sm">chat</span>
                          <span className="hidden sm:inline">WhatsApp</span>
                        </button>
                      )}

                      {activeDelivery && (
                        <button
                          type="button"
                          onClick={() => {
                            if (currentRole === 'vendeur') {
                              setCurrentView('vendeur_tracking');
                            } else {
                              setCurrentView('livreur_missions');
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Voir les détails de la course"
                        >
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          <span className="hidden sm:inline">Course</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-50/30 dark:bg-slate-950/30">
                    {/* Welcome Context Banner */}
                    <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2.5 max-w-lg mx-auto">
                      <span className="material-symbols-outlined text-base text-blue-600 shrink-0">verified_user</span>
                      <span>
                        Canal direct sécurisé pour coordonner la collecte et la livraison du colis.
                      </span>
                    </div>

                    {activeMessages.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                        <span className="material-symbols-outlined text-3xl text-slate-300">forum</span>
                        <p>Aucun message échangé pour l'instant.</p>
                        <p className="text-[11px] text-slate-400">
                          Utilisez les réponses rapides ci-dessous pour démarrer la discussion !
                        </p>
                      </div>
                    ) : (
                      activeMessages.map((msg) => {
                        const isMe = msg.senderId === currentUserId || msg.senderRole === currentRole;
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1 animate-in fade-in duration-150`}
                          >
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
                              <span className="font-bold">{isMe ? 'Vous' : msg.senderName}</span>
                              <span>·</span>
                              <span className="font-mono">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div
                              className={`max-w-md p-3.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                                isMe
                                  ? 'bg-blue-600 text-white rounded-br-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-xs'
                              }`}
                            >
                              {msg.quickTag && (
                                <div className="mb-1.5 pb-1 border-b border-white/20 dark:border-slate-700 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider">
                                  {msg.quickTag === 'location' && <span>📍 Information de localisation</span>}
                                  {msg.quickTag === 'otp' && <span>🔑 Validation OTP</span>}
                                  {msg.quickTag === 'delay' && <span>⏳ Signalement Retard</span>}
                                  {msg.quickTag === 'pickup_ready' && <span>📦 Prêt pour Enlèvement</span>}
                                  {msg.quickTag === 'client_unreachable' && <span>❓ Client Injoignable</span>}
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

                  {/* Preset Quick Chips Drawer */}
                  <div className="p-2 px-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900 overflow-x-auto no-scrollbar flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 shrink-0">
                      Messages rapides :
                    </span>
                    {presets.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePresetClick(p)}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-semibold hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400 transition-all shrink-0 cursor-pointer shadow-2xs active:scale-95"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Message Input Form */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-3 sm:p-4 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Écrivez votre message..."
                      className="flex-1 min-h-[44px] px-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                    />

                    <button
                      type="submit"
                      disabled={!inputText.trim()}
                      className={`min-h-[44px] px-4 py-2.5 rounded-2xl font-bold text-xs text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 ${
                        inputText.trim()
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <span>Envoyer</span>
                      <span className="material-symbols-outlined text-base">send</span>
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                  <span className="material-symbols-outlined text-5xl text-slate-300">chat</span>
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
                    Sélectionnez une conversation
                  </p>
                  <p className="text-xs max-w-sm">
                    Choisissez une livraison ou un contact dans la liste à gauche pour lancer la discussion en direct.
                  </p>
                </div>
              )}
            </div>

          </div>
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
};
