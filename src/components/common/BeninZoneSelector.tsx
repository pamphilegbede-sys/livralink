import React, { useState, useMemo } from 'react';
import {
  ALL_BENIN_DEPARTMENTS_ZONES,
  ALL_BENIN_ZONES_FLAT,
  POPULAR_ZONES_PRESETS
} from '../../data/beninLocations';

interface BeninZoneSelectorProps {
  selectedZones: string[];
  onChange: (zones: string[]) => void;
  label?: string;
  helperText?: string;
  role?: 'vendeur' | 'livreur';
}

export const BeninZoneSelector: React.FC<BeninZoneSelectorProps> = ({
  selectedZones,
  onChange,
  label = 'Zones de livraison fréquentes (Communes, Arrondissements & Quartiers du Bénin)',
  helperText = 'Sélectionnez vos zones d\'intervention habituelles pour accélérer l\'attribution des coursiers et l\'estimation des courses.',
  role = 'vendeur'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [quickAddSelected, setQuickAddSelected] = useState<string>('');

  // Filtrage des zones selon la recherche et le département
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return ALL_BENIN_DEPARTMENTS_ZONES.map((dept) => {
      if (selectedDeptFilter !== 'ALL' && dept.code !== selectedDeptFilter) {
        return null;
      }
      const matchedZones = dept.zones.filter((z) => {
        if (!q) return true;
        return (
          z.toLowerCase().includes(q) ||
          dept.department.toLowerCase().includes(q)
        );
      });
      if (matchedZones.length === 0) return null;
      return {
        ...dept,
        zones: matchedZones
      };
    }).filter(Boolean) as typeof ALL_BENIN_DEPARTMENTS_ZONES;
  }, [searchQuery, selectedDeptFilter]);

  const toggleZone = (zone: string) => {
    if (selectedZones.includes(zone)) {
      onChange(selectedZones.filter((z) => z !== zone));
    } else {
      onChange([...selectedZones, zone]);
    }
  };

  const addZone = (zone: string) => {
    if (!zone) return;
    if (!selectedZones.includes(zone)) {
      onChange([...selectedZones, zone]);
    }
    setQuickAddSelected('');
  };

  const removeZone = (zone: string) => {
    onChange(selectedZones.filter((z) => z !== zone));
  };

  const applyPreset = (presetZones: string[]) => {
    const merged = Array.from(new Set([...selectedZones, ...presetZones]));
    onChange(merged);
  };

  const selectCurrentDepartment = () => {
    if (selectedDeptFilter === 'ALL') {
      onChange(ALL_BENIN_ZONES_FLAT);
    } else {
      const dept = ALL_BENIN_DEPARTMENTS_ZONES.find((d) => d.code === selectedDeptFilter);
      if (dept) {
        const merged = Array.from(new Set([...selectedZones, ...dept.zones]));
        onChange(merged);
      }
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-3.5 bg-slate-50/70 p-4 sm:p-5 rounded-2xl border border-slate-200">
      {/* Header and Counters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600 text-lg">explore</span>
            <label className="text-xs sm:text-sm font-bold text-slate-900">{label}</label>
          </div>
          {helperText && <p className="text-[11px] text-slate-500 mt-0.5">{helperText}</p>}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            <span>{selectedZones.length} zone{selectedZones.length > 1 ? 's' : ''} active{selectedZones.length > 1 ? 's' : ''}</span>
          </span>
          {selectedZones.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-red-600 hover:text-red-700 font-bold hover:underline px-1 py-0.5"
            >
              Tout effacer
            </button>
          )}
        </div>
      </div>

      {/* Raccourcis / Presets Rapides */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Sélection rapide par pôles stratégiques :
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => applyPreset(POPULAR_ZONES_PRESETS.grand_cotonou_calavi)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1"
          >
            <span>⚡ Grand Cotonou + Calavi (10)</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset(POPULAR_ZONES_PRESETS.cotonou_intra_muros)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1"
          >
            <span>🏙️ Cotonou Intra-Muros (8)</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset(POPULAR_ZONES_PRESETS.axe_cotonou_portonovo)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1"
          >
            <span>🛣️ Axe Cotonou - Porto-Novo</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset(POPULAR_ZONES_PRESETS.axe_cotonou_ouidah)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1"
          >
            <span>🌊 Axe Cotonou - Ouidah</span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset(POPULAR_ZONES_PRESETS.poles_nord_parakou)}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 text-[11px] font-bold shadow-2xs transition-colors flex items-center gap-1"
          >
            <span>🌾 Pôle Grand Nord (Parakou)</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar + Interactive Dropdown Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
        {/* Liste Déroulante Interactive (Dropdown direct) */}
        <div className="sm:col-span-6">
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Ajouter une localité depuis la liste déroulante :
          </label>
          <div className="relative">
            <select
              value={quickAddSelected}
              onChange={(e) => addZone(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 bg-white rounded-xl border border-slate-300 hover:border-blue-500 focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-xs font-semibold text-slate-800 outline-none shadow-2xs cursor-pointer"
            >
              <option value="">-- Choisir une commune / arrondissement ({ALL_BENIN_ZONES_FLAT.length} localités) --</option>
              {ALL_BENIN_DEPARTMENTS_ZONES.map((dept) => (
                <optgroup key={dept.code} label={`📍 ${dept.department} (${dept.zones.length} zones)`}>
                  {dept.zones.map((zone) => {
                    const isAlreadySelected = selectedZones.includes(zone);
                    return (
                      <option key={zone} value={zone} disabled={isAlreadySelected}>
                        {isAlreadySelected ? `✓ ${zone} (déjà sélectionnée)` : zone}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {/* Filtre par Département */}
        <div className="sm:col-span-6">
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Filtrer les puces par département :
          </label>
          <div className="flex gap-1.5">
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="flex-1 min-h-[42px] px-3 py-2 bg-white rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 text-xs font-semibold text-slate-800 outline-none shadow-2xs cursor-pointer"
            >
              <option value="ALL">🌟 Tous les 12 Départements (Bénin Intégral)</option>
              {ALL_BENIN_DEPARTMENTS_ZONES.map((dept) => (
                <option key={dept.code} value={dept.code}>
                  📍 {dept.department} ({dept.zones.length})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={selectCurrentDepartment}
              className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold rounded-xl whitespace-nowrap active:scale-95 transition-all shadow-2xs"
              title="Sélectionner toutes les zones du département affiché"
            >
              + Tout cocher
            </button>
          </div>
        </div>
      </div>

      {/* Barre de Recherche Textuelle Instantanée */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-base pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher par mot-clé (ex: Haie Vive, Dantokpa, UAC, Tankpè, Porto-Novo, Parakou, Azovè...)"
          className="w-full pl-9 pr-8 py-2 text-xs bg-white rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-600 outline-none shadow-2xs placeholder:text-slate-400"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>

      {/* Puces des zones actuellement sélectionnées (Actives) */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-700">
            Zones sélectionnées ({selectedZones.length}) :
          </span>
          <span className="text-[10px] text-slate-400">Cliquez sur une puce pour la retirer</span>
        </div>

        {selectedZones.length === 0 ? (
          <div className="p-3 rounded-xl bg-white border border-dashed border-slate-300 text-center text-xs text-slate-500">
            Aucune zone fréquente sélectionnée pour le moment. Choisissez dans la liste déroulante ci-dessus ou cliquez sur un pôle stratégique.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1.5 bg-white rounded-xl border border-slate-200">
            {selectedZones.map((zone) => (
              <span
                key={zone}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-2xs animate-in fade-in"
              >
                <span>{zone}</span>
                <button
                  type="button"
                  onClick={() => removeZone(zone)}
                  className="w-4 h-4 rounded-full bg-blue-700 hover:bg-blue-800 text-white flex items-center justify-center transition-colors"
                  title="Retirer cette zone"
                >
                  <span className="material-symbols-outlined text-[11px]">close</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grille des localités disponibles par département (Puces sélectionnables) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-700">
            Catalogue des localités du Bénin ({filteredGroups.reduce((acc, g) => acc + g.zones.length, 0)} disponibles) :
          </span>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
          >
            <span>{isDropdownOpen ? 'Masquer le catalogue' : 'Afficher le catalogue complet'}</span>
            <span className="material-symbols-outlined text-xs">
              {isDropdownOpen ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>

        {isDropdownOpen && (
          <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar p-3 bg-white rounded-xl border border-slate-200">
            {filteredGroups.map((group) => (
              <div key={group.code} className="space-y-2 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-blue-600">{group.icon}</span>
                    <span>{group.department}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({group.zones.length} localités)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const allInGroup = group.zones.every((z) => selectedZones.includes(z));
                      if (allInGroup) {
                        onChange(selectedZones.filter((z) => !group.zones.includes(z)));
                      } else {
                        const merged = Array.from(new Set([...selectedZones, ...group.zones]));
                        onChange(merged);
                      }
                    }}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    {group.zones.every((z) => selectedZones.includes(z)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {group.zones.map((zone) => {
                    const isSelected = selectedZones.includes(zone);
                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => toggleZone(zone)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-2xs font-bold'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        <span>{zone}</span>
                        <span className="material-symbols-outlined text-[13px]">
                          {isSelected ? 'check' : 'add'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
