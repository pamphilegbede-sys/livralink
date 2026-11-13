/// <reference types="google.maps" />
// Source: Google Maps Platform Code Assist
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  GOOGLE_MAPS_API_KEY,
  calculateDistanceKm,
  calculateDeliveryPrice,
  RATE_PER_KM_FCFA,
  DeliveryTravelMode,
  RouteEstimationResult,
  estimateFallbackDurationMinutes,
  formatTravelDuration,
} from '../../config/maps';

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
  travelMode?: DeliveryTravelMode;
  showTravelModeSelector?: boolean;
  onRouteCalculated?: (result: RouteEstimationResult) => void;
}

interface InternalRouteState extends RouteEstimationResult {
  isComputing: boolean;
}

// Composant interne utilisant la librairie moderne Routes (Route.computeRoutes)
// pour tracer l'itinéraire routier réel et estimer le temps de trajet
const MapRouteRenderer: React.FC<{
  origin?: LatLng | null;
  destination?: LatLng | null;
  courierPosition?: LatLng;
  travelMode: DeliveryTravelMode;
  onRouteStateChange: (state: InternalRouteState | null) => void;
}> = ({ origin, destination, courierPosition, travelMode, onRouteStateChange }) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const onRouteStateChangeRef = useRef(onRouteStateChange);
  onRouteStateChangeRef.current = onRouteStateChange;

  useEffect(() => {
    const clearPolylines = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    if (!map || typeof google === 'undefined' || !google.maps) {
      return;
    }

    clearPolylines();

    if (!origin && !destination) {
      map.setCenter({ lat: 6.3703, lng: 2.4312 });
      map.setZoom(12);
      onRouteStateChangeRef.current(null);
      return;
    }

    if (origin && !destination) {
      map.setCenter(origin);
      map.setZoom(14);
      onRouteStateChangeRef.current(null);
      return;
    }

    if (!origin && destination) {
      map.setCenter(destination);
      map.setZoom(14);
      onRouteStateChangeRef.current(null);
      return;
    }

    if (!origin || !destination) return;

    const isSamePoint =
      Math.abs(origin.lat - destination.lat) < 0.0001 &&
      Math.abs(origin.lng - destination.lng) < 0.0001;

    const fallbackKm = calculateDistanceKm(origin, destination);
    const fallbackDurationMins = estimateFallbackDurationMinutes(fallbackKm, travelMode);
    const fallbackState: RouteEstimationResult = {
      distanceKm: fallbackKm,
      durationMinutes: fallbackDurationMins,
      durationText: formatTravelDuration(fallbackDurationMins),
      source: 'fallback',
      travelMode,
    };

    const renderFallbackRoute = () => {
      clearPolylines();
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      if (courierPosition) {
        bounds.extend(courierPosition);
      }

      if (isSamePoint) {
        map.setCenter(origin);
        map.setZoom(14);
      } else {
        map.fitBounds(bounds, { top: 55, right: 45, bottom: 55, left: 45 });
      }

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

      const fallbackLine = new google.maps.Polyline({
        path: routeCoordinates,
        geodesic: true,
        strokeColor: '#2563eb',
        strokeOpacity: 0.78,
        strokeWeight: 4,
        map,
      });
      polylinesRef.current = [fallbackLine];
      onRouteStateChangeRef.current({ ...fallbackState, isComputing: false });
    };

    if (isSamePoint) {
      map.setCenter(origin);
      map.setZoom(15);
      onRouteStateChangeRef.current({
        distanceKm: 1.0,
        durationMinutes: 5,
        durationText: formatTravelDuration(5),
        source: 'fallback',
        travelMode,
        isComputing: false,
      });
      return;
    }

    // Si la librairie routes n'est pas encore chargée, afficher l'estimation de secours en attendant
    if (!routesLib || !routesLib.Route) {
      renderFallbackRoute();
      return clearPolylines;
    }

    let cancelled = false;
    onRouteStateChangeRef.current({ ...fallbackState, isComputing: true });

    const computeWithMode = async (mode: DeliveryTravelMode) => {
      const request: google.maps.routes.ComputeRoutesRequest = {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: mode as google.maps.TravelModeString,
        routingPreference: 'TRAFFIC_AWARE',
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'localizedValues'],
        internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
      };
      return routesLib.Route.computeRoutes(request);
    };

    const runCompute = async () => {
      try {
        let effectiveMode: DeliveryTravelMode = travelMode;
        let response: { routes: google.maps.routes.Route[] | undefined } | null = null;

        try {
          response = await computeWithMode(travelMode);
        } catch (firstErr) {
          if (travelMode === 'TWO_WHEELER') {
            effectiveMode = 'DRIVING';
            response = await computeWithMode('DRIVING');
          } else {
            throw firstErr;
          }
        }

        if (cancelled) return;

        if ((!response?.routes || response.routes.length === 0) && effectiveMode === 'TWO_WHEELER') {
          effectiveMode = 'DRIVING';
          response = await computeWithMode('DRIVING');
          if (cancelled) return;
        }

        const primaryRoute = response?.routes?.[0];
        if (!primaryRoute) {
          renderFallbackRoute();
          return;
        }

        clearPolylines();
        let createdPolylines: google.maps.Polyline[] = [];
        if (typeof primaryRoute.createPolylines === 'function') {
          createdPolylines = primaryRoute.createPolylines();
        } else if (primaryRoute.path && primaryRoute.path.length > 0) {
          createdPolylines = [
            new google.maps.Polyline({
              path: primaryRoute.path,
              geodesic: true,
            }),
          ];
        }

        createdPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: '#2563eb',
            strokeOpacity: 0.92,
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = createdPolylines;

        if (primaryRoute.viewport) {
          const bounds = new google.maps.LatLngBounds(
            primaryRoute.viewport.getSouthWest(),
            primaryRoute.viewport.getNorthEast()
          );
          if (courierPosition) {
            bounds.extend(courierPosition);
          }
          map.fitBounds(bounds, { top: 55, right: 45, bottom: 55, left: 45 });
        } else {
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(origin);
          bounds.extend(destination);
          if (courierPosition) bounds.extend(courierPosition);
          map.fitBounds(bounds, { top: 55, right: 45, bottom: 55, left: 45 });
        }

        const meters = primaryRoute.distanceMeters;
        const routeKm =
          typeof meters === 'number' && Number.isFinite(meters) && meters > 0
            ? Math.max(0.5, Math.round((meters / 1000) * 10) / 10)
            : fallbackKm;

        const durationMs = primaryRoute.durationMillis;
        const durationMinutes =
          typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
            ? Math.max(1, Math.round(durationMs / 60000))
            : estimateFallbackDurationMinutes(routeKm, effectiveMode);

        const durationText =
          primaryRoute.localizedValues?.duration || formatTravelDuration(durationMinutes);

        onRouteStateChangeRef.current({
          distanceKm: routeKm,
          durationMinutes,
          durationText,
          source: 'google_routes',
          travelMode: effectiveMode,
          isComputing: false,
        });
      } catch (err) {
        if (cancelled) return;
        console.warn('Calcul itinéraire Google Routes indisponible, repli sur estimation distance:', err);
        renderFallbackRoute();
      }
    };

    runCompute();

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [map, routesLib, origin?.lat, origin?.lng, destination?.lat, destination?.lng, courierPosition?.lat, courierPosition?.lng, travelMode]);

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
  travelMode = 'DRIVING',
  showTravelModeSelector = true,
  onRouteCalculated,
}) => {
  const [, setMapLoaded] = useState(false);
  const [internalActiveTarget, setInternalActiveTarget] = useState<'origin' | 'destination'>(activeTarget);
  const [selectedTravelMode, setSelectedTravelMode] = useState<DeliveryTravelMode>(travelMode);
  const [routeState, setRouteState] = useState<InternalRouteState | null>(null);

  useEffect(() => {
    setSelectedTravelMode(travelMode);
  }, [travelMode]);

  const onRouteCalculatedRef = useRef(onRouteCalculated);
  onRouteCalculatedRef.current = onRouteCalculated;

  const currentTarget = onActiveTargetChange ? activeTarget : internalActiveTarget;
  const setTarget = (t: 'origin' | 'destination') => {
    if (onActiveTargetChange) {
      onActiveTargetChange(t);
    } else {
      setInternalActiveTarget(t);
    }
  };

  // Calcul de base de distance / durée immédiatement disponible en attendant ou en secours de Routes API
  const hasBothPoints = Boolean(origin && destination);
  const fallbackDistanceKm = useMemo(() => {
    if (origin && destination) {
      return calculateDistanceKm(origin, destination);
    }
    return 0;
  }, [origin, destination]);

  const fallbackDurationMinutes = useMemo(() => {
    if (origin && destination) {
      return estimateFallbackDurationMinutes(fallbackDistanceKm, selectedTravelMode);
    }
    return 0;
  }, [origin, destination, fallbackDistanceKm, selectedTravelMode]);

  const effectiveDistanceKm = hasBothPoints
    ? (routeState?.distanceKm ?? fallbackDistanceKm)
    : 0;
  const effectiveDurationMinutes = hasBothPoints
    ? (routeState?.durationMinutes ?? fallbackDurationMinutes)
    : 0;
  const effectiveDurationText = hasBothPoints
    ? (routeState?.durationText || formatTravelDuration(effectiveDurationMinutes))
    : '--';
  const effectiveSource = routeState?.source ?? 'fallback';
  const isComputingRoute = Boolean(hasBothPoints && routeState?.isComputing);

  const deliveryFee = useMemo(() => {
    if (hasBothPoints) {
      return calculateDeliveryPrice(effectiveDistanceKm);
    }
    return 0;
  }, [hasBothPoints, effectiveDistanceKm]);

  const handleRouteStateChange = (nextState: InternalRouteState | null) => {
    setRouteState(nextState);
    if (nextState && onRouteCalculatedRef.current) {
      onRouteCalculatedRef.current({
        distanceKm: nextState.distanceKm,
        durationMinutes: nextState.durationMinutes,
        durationText: nextState.durationText,
        source: nextState.source,
        travelMode: nextState.travelMode,
      });
    }
  };

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
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=${selectedTravelMode === 'TWO_WHEELER' ? 'two_wheeler' : 'driving'}`
    : `https://www.google.com/maps/@${center.lat},${center.lng},13z`;

  return (
    <div
      className={`w-full ${heightClass} rounded-2xl overflow-hidden relative border border-slate-200 shadow-sm bg-slate-100 flex flex-col`}
      style={{ minHeight: '300px' }}
    >
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        libraries={['routes']}
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
              travelMode={selectedTravelMode}
              onRouteStateChange={handleRouteStateChange}
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
          <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-md border border-slate-200 text-xs flex items-center gap-2 max-w-[92%] flex-wrap">
            <div className="flex items-center gap-1 text-blue-600 font-extrabold">
              <span className="material-symbols-outlined text-base">map</span>
              <span>Google Maps</span>
            </div>
            <div className="h-3.5 w-px bg-slate-300"></div>

            {hasBothPoints ? (
              <>
                <div className="flex items-center gap-1 font-bold text-slate-800" title="Distance du trajet">
                  <span className="material-symbols-outlined text-sm text-slate-500">straighten</span>
                  <span>{effectiveDistanceKm} km</span>
                </div>
                <div className="h-3.5 w-px bg-slate-300"></div>
                <div
                  className="flex items-center gap-1 font-extrabold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200"
                  title={
                    effectiveSource === 'google_routes'
                      ? 'Temps de trajet calculé par Google Maps Routes (trafic en temps réel)'
                      : 'Temps de trajet estimé selon la distance'
                  }
                >
                  {isComputingRoute ? (
                    <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <span className="material-symbols-outlined text-sm text-indigo-600">schedule</span>
                  )}
                  <span>~{effectiveDurationText}</span>
                  <span className="text-[10px] font-semibold text-indigo-600">
                    {effectiveSource === 'google_routes' ? '• Trafic réel' : '• Estimé'}
                  </span>
                </div>
                <div className="h-3.5 w-px bg-slate-300"></div>
                <div className="flex items-center gap-1 font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                  <span>{deliveryFee.toLocaleString('fr-FR')} FCFA</span>
                  <span className="text-[10px] font-normal text-emerald-600 hidden sm:inline">({RATE_PER_KM_FCFA} F/km)</span>
                </div>

                {showTravelModeSelector && (
                  <>
                    <div className="h-3.5 w-px bg-slate-300 hidden sm:block"></div>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setSelectedTravelMode('TWO_WHEELER')}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer ${
                          selectedTravelMode === 'TWO_WHEELER'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Estimer pour deux-roues / moto"
                      >
                        <span className="material-symbols-outlined text-xs">two_wheeler</span>
                        <span>Moto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTravelMode('DRIVING')}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer ${
                          selectedTravelMode === 'DRIVING'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Estimer pour voiture / utilitaire"
                      >
                        <span className="material-symbols-outlined text-xs">directions_car</span>
                        <span>Voiture</span>
                      </button>
                    </div>
                  </>
                )}
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
              title="Ouvrir l'itinéraire dans Google Maps"
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

