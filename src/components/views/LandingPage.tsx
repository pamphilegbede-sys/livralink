import React from 'react';
import { useApp } from '../../context/AppContext';

export const LandingPage: React.FC = () => {
  const { setCurrentView, setCurrentRole } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans'] selection:bg-blue-600 selection:text-white">
      {/* 1. Top Navigation Bar */}
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-2xl text-blue-400">local_shipping</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">
                Livra<span className="text-blue-600">Link</span>
              </span>
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mt-0.5">
                CONNECT &amp; DELIVER
              </span>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#comment-ca-marche" className="hover:text-blue-600 transition-colors">
              Comment ça marche
            </a>
            <a href="#vendeurs" className="hover:text-blue-600 transition-colors">
              Vendeurs
            </a>
            <a href="#livreurs" className="hover:text-blue-600 transition-colors">
              Livreurs
            </a>
            <a href="#avantages" className="hover:text-blue-600 transition-colors">
              Avantages
            </a>
            <a href="#statuts" className="hover:text-blue-600 transition-colors">
              Statuts
            </a>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Direct Admin Access Button */}
            <button
              onClick={() => {
                setCurrentRole('admin');
                setCurrentView('admin_console');
              }}
              className="px-3.5 py-2 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 hover:from-purple-800 hover:to-blue-800 text-amber-200 border border-amber-400/40 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
              title="Accéder au panneau d'administration"
            >
              <span>👑</span>
              <span>Console Admin</span>
            </button>

            <button
              onClick={() => {
                setCurrentRole('vendeur');
                setCurrentView('login_vendeur');
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all active:scale-95"
            >
              Se connecter
            </button>
            <button
              onClick={() => {
                setCurrentRole('vendeur');
                setCurrentView('register');
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span>Créer un compte</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="py-12 md:py-20 px-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-full shadow-xs">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                🚀 La révolution de la livraison pour le commerce social &amp; e-commerce
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Fini le chaos des livraisons sur <span className="text-blue-600">WhatsApp</span> et les réseaux sociaux.
            </h1>

            <p className="text-lg sm:text-xl text-blue-700 font-bold">
              La livraison connectée, suivie et sécurisée.
            </p>

            <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
              Connectez vos ventes WhatsApp, Instagram, TikTok et boutique en ligne directement aux livreurs disponibles.
              Fini les appels interminables, suivez chaque colis de la prise en charge à la preuve de livraison irréfutable.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              <button
                onClick={() => {
                  setCurrentRole('vendeur');
                  setCurrentView('vendeur_dashboard');
                }}
                className="py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">storefront</span>
                <span>Espace Vendeur</span>
              </button>
              <button
                onClick={() => {
                  setCurrentRole('livreur');
                  setCurrentView('livreur_dashboard');
                }}
                className="py-3.5 px-6 bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-300 rounded-xl font-bold text-sm shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg text-emerald-600">two_wheeler</span>
                <span>Espace Livreur</span>
              </button>
              <button
                onClick={() => {
                  setCurrentRole('admin');
                  setCurrentView('admin_console');
                }}
                className="py-3.5 px-5 bg-gradient-to-r from-slate-900 to-indigo-950 hover:from-slate-800 hover:to-indigo-900 text-amber-300 border border-amber-400/40 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span>👑</span>
                <span>Superviseur Admin</span>
              </button>
            </div>

            {/* Trust Markers */}
            <div className="pt-3 flex flex-wrap items-center gap-5 text-xs text-slate-500 font-medium">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="material-symbols-outlined text-base">verified</span>
                <span>Sans engagement</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="material-symbols-outlined text-base">bolt</span>
                <span>Démarrage en 2 minutes</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="material-symbols-outlined text-base">security</span>
                <span>Traçabilité 100% garantie</span>
              </div>
            </div>

            {/* Social channels strip */}
            <div className="pt-5 border-t border-slate-200 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="font-bold text-slate-700">Connecté à vos canaux de vente directs :</span>
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 shadow-2xs">
                💬 WhatsApp Business
              </span>
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 shadow-2xs">
                📸 Instagram DM
              </span>
              <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 shadow-2xs">
                🎵 TikTok Shop
              </span>
            </div>
          </div>

          {/* Right Hero Live Tracking Preview Card */}
          <div className="lg:col-span-5 relative">
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 space-y-5 relative">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-base">#LL-2048</span>
                  <span className="text-[10px] uppercase font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">Express</span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                  🚚 En cours de livraison
                </span>
              </div>

              {/* Itinerary */}
              <div className="space-y-3 pl-6 border-l-2 border-dashed border-slate-200 ml-2 relative text-xs">
                <div className="relative">
                  <span className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-blue-100"></span>
                  <p className="text-[10px] uppercase font-bold text-slate-400">EXPÉDITEUR (INSTAGRAM DM)</p>
                  <p className="font-bold text-slate-900">Boutique Glamour Chic • Plateau</p>
                </div>
                <div className="relative pt-1">
                  <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-600 ring-4 ring-emerald-100"></span>
                  <p className="text-[10px] uppercase font-bold text-slate-400">DESTINATION CLIENT</p>
                  <p className="font-bold text-slate-900">Amina K. • Cocody Angré 8e Tranche</p>
                </div>
              </div>

              {/* Courier badge */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-xs">
                    MD
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900">Mamadou D.</span>
                      <span className="text-amber-500 font-bold text-xs">★ 4.9</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Yamaha Scooter • ID #CO-449</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setCurrentRole('vendeur');
                      setCurrentView('vendeur_tracking');
                    }}
                    className="p-2 bg-white border border-slate-200 rounded-xl text-blue-600 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-base">call</span>
                  </button>
                  <button
                    onClick={() => {
                      setCurrentRole('vendeur');
                      setCurrentView('vendeur_tracking');
                    }}
                    className="p-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100"
                  >
                    <span className="material-symbols-outlined text-base">chat</span>
                  </button>
                </div>
              </div>

              {/* POD Badge */}
              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600">verified_user</span>
                  <span className="font-bold text-slate-800">Preuve de Livraison (POD)</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 font-bold text-[10px]">
                  Activée
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600 font-medium">
                  <span>Estimation d'arrivée</span>
                  <span className="font-bold text-blue-700">14 min (Arrivée 15:42)</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full w-3/4"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Section « Comment ça marche ? » */}
      <section className="py-16 bg-white border-y border-slate-200" id="comment-ca-marche">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
              Flux opérationnel sans friction
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900">Comment ça marche ?</h2>
            <p className="text-slate-600 text-sm">
              Un processus fluide conçu pour passer d'une commande chat à une remise sécurisée en quelques minutes sans appel superflu.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 hover:border-blue-500 transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                1
              </div>
              <h3 className="font-bold text-slate-900 text-base">Créez en 30 secondes</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Importez les infos client depuis WhatsApp ou saisissez l'adresse en un clin d'œil grâce aux suggestions intelligentes.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 hover:border-blue-500 transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                2
              </div>
              <h3 className="font-bold text-slate-900 text-base">Attribution instantanée</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Notification envoyée au coursier disponible le plus proche avec un calcul kilométrique et tarifaire transparent.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 hover:border-blue-500 transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                3
              </div>
              <h3 className="font-bold text-slate-900 text-base">Suivi dynamique en direct</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Chaque étape est actualisée en direct : de l'acceptation jusqu'à l'acheminement avec lien de tracking partageable.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-emerald-300 bg-emerald-50/40 space-y-3 hover:border-emerald-500 transition-colors">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                4
              </div>
              <h3 className="font-bold text-slate-900 text-base">Preuve sécurisée (POD)</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Validation finale par photo du colis remis, code secret ou signature client numérisée. Zéro contestation possible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Section « Les 7 statuts normalisés LivraLink » */}
      <section className="py-16 max-w-7xl mx-auto px-6 space-y-10" id="statuts">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
            Traçabilité sans équivoque
          </span>
          <h2 className="text-3xl font-extrabold text-slate-900">Les 7 statuts normalisés LivraLink</h2>
          <p className="text-slate-600 text-sm">
            Chaque protagoniste (vendeur, livreur, client final) parle le même langage opérationnel en temps réel.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400"></span>
              <h4 className="font-bold text-slate-900 text-sm">1. En attente</h4>
            </div>
            <p className="text-xs text-slate-500">Course générée, en cours de diffusion dans le rayon de collecte.</p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              <h4 className="font-bold text-slate-900 text-sm">2. Assignée</h4>
            </div>
            <p className="text-xs text-slate-500">Attribuée à un coursier précis dont le positionnement est idéal.</p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-600"></span>
              <h4 className="font-bold text-slate-900 text-sm">3. Acceptée</h4>
            </div>
            <p className="text-xs text-slate-500">Le coursier a validé la prise en charge et converge vers le point de retrait.</p>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-600"></span>
              <h4 className="font-bold text-slate-900 text-sm">4. Colis récupéré</h4>
            </div>
            <p className="text-xs text-slate-500">Colis scanné au point d'enlèvement du vendeur ou hub logistique.</p>
          </div>

          <div className="p-4 bg-blue-50/60 border-2 border-blue-300 rounded-2xl space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600 animate-pulse"></span>
              <h4 className="font-bold text-blue-900 text-sm">5. En cours de livraison</h4>
            </div>
            <p className="text-xs text-blue-800">Le coursier est sur la route de destination avec tracking actif.</p>
          </div>

          <div className="p-4 bg-emerald-50/60 border-2 border-emerald-300 rounded-2xl space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
              <h4 className="font-bold text-emerald-900 text-sm">6. Livrée (POD validée)</h4>
            </div>
            <p className="text-xs text-emerald-800">Remise effectuée et clôturée avec preuve de photo ou signature.</p>
          </div>

          <div className="p-4 bg-red-50/60 border border-red-200 rounded-2xl space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600"></span>
              <h4 className="font-bold text-red-900 text-sm">7. Échec documenté</h4>
            </div>
            <p className="text-xs text-red-700">Motif précis obligatoirement renseigné (destinataire absent, numéro erroné).</p>
          </div>

          <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col justify-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-emerald-400">100% Vérifiable</span>
            <p className="font-bold text-sm">Horodaté &amp; Géolocalisé</p>
          </div>
        </div>
      </section>

      {/* 5. Split Comparison: Vendeurs vs Livreurs */}
      <section className="py-16 bg-slate-100/70 border-t border-slate-200" id="vendeurs">
        <div className="max-w-7xl mx-auto px-6 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Vendeurs Card */}
            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                  Espace Vendeurs
                </span>
                <span className="material-symbols-outlined text-3xl text-blue-600">storefront</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Dédié aux commerçants</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Convertissez vos interactions sociales en livraisons régulières et sans stress.
                </p>
              </div>
              <ul className="space-y-3 text-xs text-slate-700">
                <li className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span><strong>Zéro appel perdu :</strong> Vos clients suivent leur coursier sans vous harceler au téléphone.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span><strong>Preuve irréfutable (POD) :</strong> Photo du client avec colis et géolocalisation certifiée.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span><strong>Dashboard centralisé :</strong> Suivez 10 ou 50 courses simultanément sur un seul écran.</span>
                </li>
              </ul>
              <button
                onClick={() => {
                  setCurrentRole('vendeur');
                  setCurrentView('vendeur_dashboard');
                }}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-95"
              >
                Démarrer en tant que Vendeur
              </button>
            </div>

            {/* Livreurs Card */}
            <div className="bg-slate-900 text-white rounded-3xl p-8 border border-slate-800 shadow-sm space-y-6" id="livreurs">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Espace Livreurs
                </span>
                <span className="material-symbols-outlined text-3xl text-emerald-400">two_wheeler</span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Développé pour les livreurs</h3>
                <p className="text-sm text-slate-300 mt-1">
                  Maximisez vos courses urbaines avec des informations précises sans perte de temps.
                </p>
              </div>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                  <span><strong>Infos complètes d'un coup :</strong> Adresses exactes, nom du contact et consignes dès l'acceptation.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                  <span><strong>Offre MVP 0% commission :</strong> 100% du prix de la livraison vous revient directement.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
                  <span><strong>Fini les litiges non payés :</strong> La preuve photo vous protège immédiatement en cas de contestation.</span>
                </li>
              </ul>
              <button
                onClick={() => {
                  setCurrentRole('livreur');
                  setCurrentView('livreur_dashboard');
                }}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
              >
                Rejoindre la flotte LivraLink
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Section Avantages & Métriques d'impact */}
      <section className="py-16 max-w-7xl mx-auto px-6" id="avantages">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 lg:p-12 shadow-sm">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">L'impact LivraLink en chiffres</span>
            <h2 className="text-3xl font-extrabold text-slate-900">Une efficacité opérationnelle mesurable</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-slate-200">
            <div className="space-y-2 pt-4 md:pt-0 px-4">
              <div className="text-5xl font-extrabold text-blue-600 tracking-tight">-85%</div>
              <h4 className="font-bold text-slate-900 text-base">De temps passé au téléphone</h4>
              <p className="text-xs text-slate-500">Plus besoin d'appeler les coursiers : tout est visible en direct.</p>
            </div>
            <div className="space-y-2 pt-4 md:pt-0 px-4">
              <div className="text-5xl font-extrabold text-emerald-600 tracking-tight">99.2%</div>
              <h4 className="font-bold text-slate-900 text-base">De litiges résolus sur-le-champ</h4>
              <p className="text-xs text-slate-500">Grâce à l'historique d'audit horodaté et la photo de preuve POD.</p>
            </div>
            <div className="space-y-2 pt-4 md:pt-0 px-4">
              <div className="text-5xl font-extrabold text-blue-700 tracking-tight">+40%</div>
              <h4 className="font-bold text-slate-900 text-base">De livraisons réussies au 1er passage</h4>
              <p className="text-xs text-slate-500">Les coordonnées WhatsApp et les repères éliminent les adresses introuvables.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Section Témoignages */}
      <section className="py-16 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="text-center max-w-3xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Témoignages vérifiés</span>
            <h2 className="text-3xl font-extrabold text-slate-900">Ils font confiance à LivraLink</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex text-amber-500 text-sm">★★★★★</div>
              <p className="text-sm text-slate-700 italic leading-relaxed">
                « Avant LivraLink, je passais mes journées à répondre "Le livreur arrive" sur WhatsApp. Maintenant le lien fait tout le travail, et les clientes sont rassurées ! Mon business a doublé ! »
              </p>
              <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                  SK
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Sarah Kouamé</h4>
                  <p className="text-[11px] text-slate-500">Fondatrice de @KouameFashion (35k abonnés)</p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex text-amber-500 text-sm">★★★★★</div>
              <p className="text-sm text-slate-700 italic leading-relaxed">
                « Avec la preuve photo et le code secret, aucun client ne peut dire qu'il n'a pas reçu son colis. Les adresses sont claires, je fais plus de livraisons par jour sans stress. »
              </p>
              <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                  IT
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">Ibrahim Touré</h4>
                  <p className="text-[11px] text-slate-500">Coursier urbain indépendant (450+ courses)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Grand CTA Final */}
      <section className="py-16 max-w-7xl mx-auto px-6 w-full">
        <div className="bg-gradient-to-r from-blue-700 to-blue-600 rounded-3xl p-8 md:p-14 text-center text-white shadow-xl space-y-6">
          <span className="inline-block bg-white/10 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
            Passez à la vitesse supérieure
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Prêt à professionnaliser vos livraisons dès aujourd'hui ?
          </h2>
          <p className="text-blue-100 text-sm max-w-2xl mx-auto">
            Rejoignez la communauté LivraLink et dites adieu aux pertes de colis et aux malentendus.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setCurrentRole('vendeur');
                setCurrentView('vendeur_dashboard');
              }}
              className="py-3.5 px-6 bg-white hover:bg-slate-50 text-blue-700 font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
            >
              Créer un compte gratuitement
            </button>
            <button
              onClick={() => {
                setCurrentRole('vendeur');
                setCurrentView('login_vendeur');
              }}
              className="py-3.5 px-6 border border-white/40 hover:bg-white/10 text-white font-bold text-xs rounded-xl transition-all active:scale-95"
            >
              Se connecter
            </button>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">LivraLink</span>
            <span>•</span>
            <span>© 2025 LivraLink Technologies Inc. Tous droits réservés. Données sécurisées et cryptées bout-en-bout.</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => {
                setCurrentRole('admin');
                setCurrentView('admin_console');
              }}
              className="text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"
            >
              <span>👑 Console Admin</span>
            </button>
            <a href="#confidentialite" className="hover:text-blue-600">Politique de confidentialité</a>
            <a href="#cgu" className="hover:text-blue-600">Conditions d'utilisation</a>
            <a href="#support" className="hover:text-blue-600">Support technique</a>
            <a href="#mentions" className="hover:text-blue-600">Mentions légales</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
