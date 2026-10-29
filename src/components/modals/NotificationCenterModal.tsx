import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AppNotification } from '../../types';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({ isOpen, onClose }) => {
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearAllNotifications,
    sendTestNotification,
    setSelectedDelivery,
    deliveries,
    setCurrentView,
    notificationPermission,
    requestBrowserNotificationPermission,
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'orders' | 'system'>('all');

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const filteredNotifications = notifications.filter((item) => {
    if (activeFilter === 'unread') return !item.isRead;
    if (activeFilter === 'orders') {
      return ['order_created', 'order_assigned', 'order_accepted', 'order_status', 'pod_validated'].includes(item.type);
    }
    if (activeFilter === 'system') {
      return ['system', 'dispute', 'kyc', 'priority_mission'].includes(item.type);
    }
    return true;
  });

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'order_created':
        return { icon: 'add_shopping_cart', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300' };
      case 'order_assigned':
        return { icon: 'two_wheeler', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' };
      case 'order_accepted':
        return { icon: 'handshake', bg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300' };
      case 'order_status':
        return { icon: 'local_shipping', bg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300' };
      case 'pod_validated':
        return { icon: 'verified', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' };
      case 'priority_mission':
        return { icon: 'bolt', bg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300' };
      case 'dispute':
        return { icon: 'warning', bg: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300' };
      case 'kyc':
        return { icon: 'badge', bg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300' };
      default:
        return { icon: 'notifications', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    markNotificationAsRead(notif.id);
    if (notif.orderId) {
      const match = deliveries.find((d) => d.id === notif.orderId);
      if (match) {
        setSelectedDelivery(match);
      }
    }
    if (notif.actionView) {
      setCurrentView(notif.actionView as any);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-['Plus_Jakarta_Sans'] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">notifications</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  Centre de Notifications
                </h3>
                {unreadCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                    {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 text-[10px] font-bold">
                    Toutes lues ✓
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mises à jour des courses, statut de livraison et alertes système
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fermer"
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Real Device Notification Permission Status Banner */}
        <div className="px-5 py-2.5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between gap-2 text-xs font-medium">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-lg text-amber-400 shrink-0">
              {notificationPermission === 'granted' ? 'volume_up' : 'volume_off'}
            </span>
            <span className="truncate text-slate-100">
              {notificationPermission === 'granted'
                ? '🔔 Notifications système, Son & Vibreur actifs en tâche de fond'
                : notificationPermission === 'denied'
                ? '⚠️ Notifications bloquées par le navigateur (Autoriser dans les réglages)'
                : 'Alerter en cas de création de livraison (Son & Vibreur)'}
            </span>
          </div>

          {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <button
              onClick={() => requestBrowserNotificationPermission()}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-[11px] shrink-0 transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">notifications_active</span>
              <span>Activer les alertes réelles</span>
            </button>
          )}
        </div>

        {/* Toolbar: Filter Pills & Action Buttons */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-slate-900">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl text-xs font-semibold overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Toutes ({notifications.length})
            </button>
            <button
              onClick={() => setActiveFilter('unread')}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                activeFilter === 'unread'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <span>Non lues</span>
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
              )}
            </button>
            <button
              onClick={() => setActiveFilter('orders')}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeFilter === 'orders'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Commandes
            </button>
            <button
              onClick={() => setActiveFilter('system')}
              className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeFilter === 'system'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Système
            </button>
          </div>

          {/* Actions: Mark read & Clear */}
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllNotificationsAsRead}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Tout marquer comme lu
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="text-[11px] font-bold text-slate-400 hover:text-red-500 cursor-pointer transition-colors"
                title="Supprimer toutes les notifications"
              >
                Effacer tout
              </button>
            )}
          </div>
        </div>

        {/* Test Trigger Button Bar */}
        <div className="px-5 py-2 bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between text-xs">
          <span className="text-blue-900 dark:text-blue-200 font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-blue-600">bolt</span>
            <span>Tester la réception en temps réel :</span>
          </span>
          <button
            onClick={() => sendTestNotification()}
            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-extrabold shadow-xs transition-all cursor-pointer active:scale-95"
          >
            + Simuler Notification
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">notifications_off</span>
              </div>
              <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                Aucune notification {activeFilter === 'unread' ? 'non lue' : ''}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Vous recevrez ici les alertes en temps réel lors des créations et mises à jour de livraisons.
              </p>
              <button
                onClick={() => sendTestNotification('🔔 Notification de test LivraLink', 'Ceci est une notification de test générée avec succès.')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Générer une alerte de démonstration
              </button>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const { icon, bg } = getNotificationIcon(notif.type);
              return (
                <article
                  key={notif.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 relative group cursor-pointer ${
                    !notif.isRead
                      ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border-slate-150 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  {/* Unread indicator dot */}
                  {!notif.isRead && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 absolute top-4 right-4 animate-pulse"></span>
                  )}

                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${bg}`}>
                    <span className="material-symbols-outlined text-lg">{icon}</span>
                  </div>

                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-xs sm:text-sm font-bold truncate ${!notif.isRead ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                        {notif.timestamp}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {notif.message}
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      {notif.orderId ? (
                        <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                          {notif.orderId}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          Information
                        </span>
                      )}

                      <div className="flex items-center gap-2">
                        {notif.actionView && (
                          <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                            <span>Voir</span>
                            <span className="material-symbols-outlined text-xs">chevron_right</span>
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notif.id);
                          }}
                          className="text-slate-400 hover:text-red-500 p-0.5 rounded-md transition-colors"
                          title="Supprimer la notification"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 flex items-center justify-between text-xs text-slate-500">
          <span>{notifications.length} notification{notifications.length > 1 ? 's' : ''} au total</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl transition-all cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
