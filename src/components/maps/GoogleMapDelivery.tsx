// Source: Google Maps Platform Code Assist
import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  GOOGLE_MAPS_API_KEY,
  calculateDistanceKm,
  calculateDeliveryPrice,
  RATE_PER_KM_FCFA,
} from '../../config/maps';

declare const google: any;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GoogleMapDeliveryProps {
  origin?: LatLng | null;
  destination?: LatLng | null;
  originLabel?: string;
  destinationLabel?: string;
  courierPosition?: LatLng;
  courierName?: string;
  interactive?: boolean;
  onDestinationChange?: (newPos: LatLng) => void;
  onOriginChange?: (newPos: LatLng) => void;
  activeTarget?: 'origin' | 'destination';
  onActiveTargetChange?: (target: 'origin' | 'destination') => void;
  heightClass?: string;
}

// Composant interne pour tracer la polyline et ajuster la vue de la carte
const MapRouteRenderer: React.FC<{
  origin?: LatLng | null;
  destination?: LatLng | null;
  courierPosition?: LatLng;
}> = ({ origin, destination, courierPosition }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    if (!origin && !destination) {
      // Centre par défaut sur le Grand Cotonou / Bénin
      map.setCenter({ lat: 6.3703, lng: 2.4312 });
      map.setZoom(12);
      return;
    }

    if (origin && !destination) {
      map.setCenter(origin);
      map.setZoom(14);
      return;
    }

    if (!origin && destination) {
      map.setCenter(destination);
      map.setZoom(14);
      return;
    }

    if (origin && destination) {
      // Recalibrer les limites pour inclure l'origine, la destination et le coursier
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      if (courierPosition) {
        bounds.extend(courierPosition);
      }

      // Si les deux points sont très proches
      if (
        Math.abs(origin.lat - destination.lat) < 0.0001 &&
        Math.abs(origin.lng - destination.lng) < 0.0001
      ) {
        map.setCenter(origin);
        map.setZoom(14);
      } else {
        map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }

      // Tracer la polyline de livraison reliant l'origine et la destination
      const routeCoordinates = [
        origin,
        {
          lat: (origin.lat * 2 + destination.lat) / 3,
          lng: (origin.lng * 2 + destination.lng) / 3,
        },
        {
          lat: (origin.lat + destination.lat * 2) / 3,
          lng: (origin.lng + destination.lng * 2) / 3,
        },
        destination,
      ];

      const polyline = new google.maps.Polyline({
        path: routeCoordinates,
        geodesic: true,
        strokeColor: '#2563eb',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map,
      });

      return () => {
        polyline.setMap(null);
      };
    }
  }, [map, origin?.lat, origin?.lng, destination?.lat, destination?.lng, courierPosition]);

  return null;
};

export const GoogleMapDelivery: React.FC<GoogleMapDeliveryProps> = ({
  origin,
  destination,
  originLabel = 'Point de Ramassage (Boutique)',
  destinationLabel = 'Point de Livraison (Client)',
  courierPosition,
  courierName = 'Coursier LivraLink',
  interactive = false,
  onDestinationChange,
  onOriginChange,
  activeTarget = 'destination',
  onActiveTargetChange,
  heightClass = 'h-[340px]',
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [internalActiveTarget, setInternalActiveTarget] = useState<'origin' | 'destination'>(activeTarget);

  const currentTarget = onActiveTargetChange ? activeTarget : internalActiveTarget;
  const setTarget = (t: 'origin' | 'destination') => {
    if (onActiveTargetChange) {
      onActiveTargetChange(t);
    } else {
      setInternalActiveTarget(t);
    }
  };

  // Calcul dynamique de la distance et du tarif si les deux points sont présents
  const hasBothPoints = Boolean(origin && destination);
  const distanceKm = useMemo(() => {
    if (origin && destination) {
      return calculateDistanceKm(origin, destination);
    }
    return 0;
  }, [origin, destination]);

  const deliveryFee = useMemo(() => {
    if (origin && destination) {
      return calculateDeliveryPrice(distanceKm);
    }
    return 0;
  }, [origin, destination, distanceKm]);

  const center = useMemo(() => {
    if (origin && destination) {
      return {
        lat: (origin.lat + destination.lat) / 2,
        lng: (origin.lng + destination.lng) / 2,
      };
    }
    if (origin) return origin;
    if (destination) return destination;
    return { lat: 6.3703, lng: 2.4312 }; // Cotonou par défaut
  }, [origin, destination]);

  const handleMapClick = (e: any) => {
    if (!interactive) return;
    const latLng = e.detail?.latLng || (e.latLng ? { lat: e.latLng.lat(), lng: e.latLng.lng() } : null);
    if (!latLng) return;

    const clickedPos = { lat: latLng.lat, lng: latLng.lng };

    if (currentTarget === 'origin' && onOriginChange) {
      onOriginChange(clickedPos);
    } else if (currentTarget === 'destination' && onDestinationChange) {
      onDestinationChange(clickedPos);
    } else if (onDestinationChange) {
      onDestinationChange(clickedPos);
    }
  };

  const googleMapsUrl = origin && destination
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`
    : `https://www.google.com/maps/@${center.lat},${center.lng},13z`;

  return (
    <div
      className={`w-full ${heightClass} rounded-2xl overflow-hidden relative border border-slate-200 shadow-sm bg-slate-100 flex flex-col`}
      style={{ minHeight: '300px' }}
    >
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        language="fr"
        region="BJ"
        onLoad={() => setMapLoaded(true)}
      >
        <div className="w-full h-full relative" style={{ minHeight: '300px', height: '100%' }}>
          <Map
            defaultCenter={center}
            defaultZoom={origin || destination ? 13 : 12}
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            gestureHandling={interactive ? 'greedy' : 'cooperative'}
            disableDefaultUI={false}
            zoomControl={true}
            mapTypeControl={true}
            fullscreenControl={true}
            streetViewControl={false}
            onClick={handleMapClick}
            className="w-full h-full"
            style={{ width: '100%', height: '100%', minHeight: '300px' }}
          >
            <MapRouteRenderer
              origin={origin}
              destination={destination}
              courierPosition={courierPosition}
            />

            {/* Pin Ramassage Boutique (Bleu) */}
            {origin && (
              <AdvancedMarker position={origin} title={originLabel}>
                <div className="relative group cursor-pointer flex flex-col items-center">
                  <div className="bg-blue-600 text-white p-2 rounded-xl shadow-lg border-2 border-white flex items-center justify-center transform hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-lg">store</span>
                  </div>
                  <span className="bg-slate-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md mt-1 whitespace-nowrap">
                    {originLabel}
                  </span>
                </div>
              </AdvancedMarker>
            )}

            {/* Pin Destination Client (Émeraude) */}
            {destination && (
              <AdvancedMarker position={destination} title={destinationLabel}>
                <div className="relative group cursor-pointer flex flex-col items-center">
                  <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-lg border-2 border-white flex items-center justify-center transform hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-lg">home_pin</span>
                  </div>
                  <span className="bg-emerald-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-md mt-1 whitespace-nowrap">
                    {destinationLabel}
                  </span>
                </div>
              </AdvancedMarker>
            )}

            {/* Pin Coursier si assigné (Orange / Moto) */}
            {courierPosition && (
              <AdvancedMarker position={courierPosition} title={courierName}>
                <div className="relative group cursor-pointer flex flex-col items-center animate-bounce">
                  <div className="bg-amber-500 text-slate-950 p-2 rounded-xl shadow-xl border-2 border-white flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">two_wheeler</span>
                  </div>
                  <span className="bg-amber-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-md mt-1 whitespace-nowrap">
                    {courierName}
                  </span>
                </div>
              </AdvancedMarker>
            )}
          </Map>

          {/* Overlay d'information Google Maps en haut à gauche */}
          <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-md border border-slate-200 text-xs flex items-center gap-2.5 max-w-[90%] flex-wrap">
            <div className="flex items-center gap-1 text-blue-600 font-extrabold">
              <span className="material-symbols-outlined text-base">map</span>
              <span>Google Maps Bénin</span>
            </div>
            <div className="h-3.5 w-px bg-slate-300"></div>

            {hasBothPoints ? (
              <>
                <div className="flex items-center gap-1 font-bold text-slate-800">
                  <span className="material-symbols-outlined text-sm text-slate-500">straighten</span>
                  <span>{distanceKm} km</span>
                </div>
                <div className="h-3.5 w-px bg-slate-300"></div>
                <div className="flex items-center gap-1 font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  <span>{deliveryFee.toLocaleString('fr-FR')} FCFA</span>
                  <span className="text-[10px] font-normal text-emerald-600">({RATE_PER_KM_FCFA} F/km)</span>
                </div>
              </>
            ) : origin ? (
              <span className="text-[11px] text-blue-700 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                Collecte définie • Choisissez la destination
              </span>
            ) : destination ? (
              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                Destination définie • Choisissez la collecte
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-xs text-amber-500">info</span>
                Positionnez vos points de collecte et livraison
              </span>
            )}

            <div className="h-3.5 w-px bg-slate-300"></div>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-0.5 ml-auto"
              title="Ouvrir dans Google Maps"
            >
              <span>GPS</span>
              <span className="material-symbols-outlined text-xs">open_in_new</span>
            </a>
          </div>

          {/* Interactive Target Switcher & Hint si interactif */}
          {interactive && (
            <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-2 flex-wrap">
              <div className="bg-slate-900/90 backdrop-blur-md p-1 rounded-xl shadow-lg border border-slate-700/50 flex items-center gap-1 text-[11px]">
                <span className="text-slate-400 font-semibold px-2 hidden sm:inline">Placer au clic :</span>
                <button
                  type="button"
                  onClick={() => setTarget('origin')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    currentTarget === 'origin'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-xs">store</span>
                  <span>Point Collecte (Boutique)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('destination')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    currentTarget === 'destination'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-xs">home_pin</span>
                  <span>Point Livraison (Client)</span>
                </button>
              </div>

              <div className="bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-medium px-2.5 py-1.5 rounded-xl shadow-md flex items-center gap-1 pointer-events-none ml-auto">
                <span className="material-symbols-outlined text-xs text-amber-300">touch_app</span>
                <span>Cliquez sur la carte pour définir la position</span>
              </div>
            </div>
          )}
        </div>
      </APIProvider>
    </div>
  );
};
