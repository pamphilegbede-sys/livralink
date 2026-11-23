import React, { useEffect, useState } from 'react';
import {
  MapsGroundingContext,
  MapsGroundingPlaceSource,
  MapsGroundingResult,
} from '../../types';
import { searchMapsGrounding } from '../../services/mapsGroundingService';

export interface MapsGroundingSuggestion {
  label: string;
  query: string;
  context?: MapsGroundingContext;
  commune?: string;
  coordinates?: { lat: number; lng: number } | null;
}

export interface GoogleMapsGroundingAssistantProps {
  title?: string;
  subtitle?: string;
  initialQuery?: string;
  commune?: string;
  coordinates?: { lat: number; lng: number } | null;
  context?: MapsGroundingContext;
  quickSuggestions?: MapsGroundingSuggestion[];
  onSelectPlace?: (place: MapsGroundingPlaceSource) => void;
  selectPlaceLabel?: string;
  defaultCollapsed?: boolean;
  compact?: boolean;
}

const isSafeExternalUrl = (raw?: string): boolean => {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const renderInlineBold = (text: string): React.ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
};

const SafeMarkdownLines: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split(/\r?\n/).filter((line, idx, arr) => line.trim() !== '' || (idx > 0 && arr[idx - 1].trim() !== ''));
  return (
    <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;
        if (/^#{1,4}\s+/.test(line)) {
          return (
            <h5 key={idx} className="text-xs font-extrabold text-slate-900 dark:text-white pt-1">
              {renderInlineBold(line.replace(/^#{1,4}\s+/, ''))}
            </h5>
          );
        }
        if (/^[-*•]\s+/.test(line)) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <p className="flex-1">{renderInlineBold(line.replace(/^[-*•]\s+/, ''))}</p>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(line)) {
          const match = line.match(/^(\d+\.)\s+(.*)$/);
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0">{match?.[1]}</span>
              <p className="flex-1">{renderInlineBold(match?.[2] || line)}</p>
            </div>
          );
        }
        return <p key={idx}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
};

export const GoogleMapsGroundingAssistant: React.FC<GoogleMapsGroundingAssistantProps> = ({
  title = 'Vérification lieu & repères (Google Maps IA)',
  subtitle = 'Vérifiez une adresse informelle, un carrefour ou les points d’accès réels via Google Maps.',
  initialQuery = '',
  commune,
  coordinates,
  context = 'general',
  quickSuggestions = [],
  onSelectPlace,
  selectPlaceLabel = 'Appliquer ce repère',
  defaultCollapsed = false,
  compact = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [activeContext, setActiveContext] = useState<MapsGroundingContext>(context);
  const [activeCommune, setActiveCommune] = useState<string | undefined>(commune);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [useDeviceGps, setUseDeviceGps] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<MapsGroundingResult | null>(null);

  useEffect(() => {
    setActiveContext(context);
  }, [context]);

  useEffect(() => {
    setActiveCommune(commune);
  }, [commune]);

  useEffect(() => {
    if (!queryInput && initialQuery) {
      setQueryInput(initialQuery);
    }
  }, [initialQuery, queryInput]);

  const effectiveCoords = useDeviceGps && gpsCoords ? gpsCoords : coordinates || null;

  const handleRequestDeviceGps = () => {
    if (useDeviceGps && gpsCoords) {
      setUseDeviceGps(false);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg('Géolocalisation navigateur indisponible sur cet appareil.');
      return;
    }
    setLocatingGps(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setUseDeviceGps(true);
        setLocatingGps(false);
      },
      () => {
        setLocatingGps(false);
        setErrorMsg('Autorisez l’accès GPS du navigateur ou utilisez les repères de la commune.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const runSearch = async (override?: {
    query?: string;
    context?: MapsGroundingContext;
    commune?: string;
    coordinates?: { lat: number; lng: number } | null;
  }) => {
    const q = (override?.query ?? queryInput).trim();
    if (!q) {
      setErrorMsg('Saisissez un lieu, un carrefour ou une adresse à vérifier.');
      return;
    }

    const chosenContext = override?.context ?? activeContext;
    const chosenCommune = override?.commune !== undefined ? override.commune : activeCommune;
    const chosenCoords =
      override?.coordinates !== undefined ? override.coordinates : effectiveCoords;

    setLoading(true);
    setErrorMsg(null);

    const response = await searchMapsGrounding({
      query: q,
      commune: chosenCommune,
      context: chosenContext,
      latitude: chosenCoords?.lat,
      longitude: chosenCoords?.lng,
    });

    setLoading(false);

    if (!response.success || !response.result) {
      setErrorMsg(response.error || 'Impossible de récupérer les informations Google Maps.');
      return;
    }

    setResult(response.result);
  };

  const handleSuggestionClick = (suggestion: MapsGroundingSuggestion) => {
    setQueryInput(suggestion.query);
    if (suggestion.context) setActiveContext(suggestion.context);
    if (suggestion.commune !== undefined) setActiveCommune(suggestion.commune);
    if (suggestion.query.trim()) {
      void runSearch({
        query: suggestion.query,
        context: suggestion.context,
        commune: suggestion.commune,
        coordinates: suggestion.coordinates ?? effectiveCoords,
      });
    }
  };

  const validPlaces = (result?.places || []).filter((p) => isSafeExternalUrl(p.uri));
  const validSnippets = (result?.reviewSnippets || []).filter((s) => isSafeExternalUrl(s.uri));

  return (
    <div
      className={`rounded-2xl border border-indigo-200 dark:border-indigo-900/70 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30 ${
        compact ? 'p-3' : 'p-4'
      } space-y-3 shadow-2xs`}
    >
      {/* Header collapsible */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
        >
          <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <span className="material-symbols-outlined text-base">travel_explore</span>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                {title}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 text-[10px] font-bold">
                Google Maps
              </span>
            </div>
            {!compact && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors shrink-0 cursor-pointer flex items-center gap-1"
        >
          <span>{isCollapsed ? 'Ouvrir' : 'Réduire'}</span>
          <span className="material-symbols-outlined text-sm">
            {isCollapsed ? 'expand_more' : 'expand_less'}
          </span>
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-3 pt-1">
          {/* Suggestions rapides */}
          {quickSuggestions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {quickSuggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={loading}
                  onClick={() => handleSuggestionClick(s)}
                  className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Barre de recherche + GPS */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined text-base text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
                maxLength={300}
                placeholder="Ex: Pharmacie Camp Guézo Cotonou, Carrefour Unafrica Akpakpa..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-950"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRequestDeviceGps}
                disabled={locatingGps}
                title="Utiliser votre position GPS actuelle comme repère de proximité"
                className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                  useDeviceGps && gpsCoords
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {locatingGps ? 'hourglass_top' : 'my_location'}
                </span>
                <span>{useDeviceGps && gpsCoords ? 'GPS Actif' : 'Mon GPS'}</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => void runSearch()}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Vérification...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">pin_drop</span>
                    <span>Vérifier sur Maps</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Info coordonnées de contexte */}
          {effectiveCoords && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span className="material-symbols-outlined text-xs text-indigo-500">location_searching</span>
              <span>
                Zone de recherche ancrée sur {useDeviceGps && gpsCoords ? 'votre GPS' : 'la carte'} (
                {effectiveCoords.lat.toFixed(4)}, {effectiveCoords.lng.toFixed(4)})
                {activeCommune ? ` • ${activeCommune}` : ''}
              </span>
            </div>
          )}

          {/* Erreur */}
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-[11px] font-semibold text-red-700 dark:text-red-300 flex items-start gap-2">
              <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Résultats Maps Grounding */}
          {result && (
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <SafeMarkdownLines text={result.answerText} />
              </div>

              {/* Sources Google Maps obligatoires */}
              {validPlaces.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-emerald-600">verified</span>
                      <span>Sources Google Maps ({validPlaces.length})</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {validPlaces.map((place, index) => (
                      <div
                        key={`${place.uri}-${index}`}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <a
                          href={place.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 min-w-0 flex-1 group"
                        >
                          <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-sm">place</span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-blue-700 dark:text-blue-400 group-hover:underline truncate">
                              {place.title}
                            </p>
                            {place.text && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {place.text}
                              </p>
                            )}
                          </div>
                          <span className="material-symbols-outlined text-xs text-slate-400 group-hover:text-blue-600 shrink-0">
                            open_in_new
                          </span>
                        </a>

                        {onSelectPlace && (
                          <button
                            type="button"
                            onClick={() => onSelectPlace(place)}
                            className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold shrink-0 cursor-pointer"
                          >
                            {selectPlaceLabel}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extraits d'avis Google Maps si retournés */}
              {validSnippets.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-amber-500">reviews</span>
                    <span>Repères &amp; Avis Google Maps ({validSnippets.length})</span>
                  </span>
                  <div className="space-y-1.5">
                    {validSnippets.map((snippet, index) => (
                      <a
                        key={`${snippet.uri}-${index}`}
                        href={snippet.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60 hover:border-amber-400 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-900 dark:text-amber-300">
                          <span className="truncate">{snippet.title || 'Extrait Google Maps'}</span>
                          <span className="material-symbols-outlined text-xs shrink-0">open_in_new</span>
                        </div>
                        {snippet.text && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                            « {snippet.text} »
                          </p>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
