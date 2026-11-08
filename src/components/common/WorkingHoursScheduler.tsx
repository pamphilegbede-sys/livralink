import React, { useState } from 'react';

interface WorkingHoursSchedulerProps {
  value: string;
  onChange: (newValue: string) => void;
  label?: string;
}

const DAYS = [
  { id: 'lun', short: 'Lun', full: 'Lundi' },
  { id: 'mar', short: 'Mar', full: 'Mardi' },
  { id: 'mer', short: 'Mer', full: 'Mercredi' },
  { id: 'jeu', short: 'Jeu', full: 'Jeudi' },
  { id: 'ven', short: 'Ven', full: 'Vendredi' },
  { id: 'sam', short: 'Sam', full: 'Samedi' },
  { id: 'dim', short: 'Dim', full: 'Dimanche' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i < 10 ? `0${i}` : `${i}`;
  return `${h}:00`;
});

export const WorkingHoursScheduler: React.FC<WorkingHoursSchedulerProps> = ({
  value,
  onChange,
  label = 'Horaires habituels',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam']);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('19:00');
  const [hasLunchBreak, setHasLunchBreak] = useState(false);
  const [lunchStart, setLunchStart] = useState('13:00');
  const [lunchEnd, setLunchEnd] = useState('14:00');

  const toggleDay = (dayId: string) => {
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length === 1) return; // Garder au moins 1 jour
      setSelectedDays(selectedDays.filter((d) => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  };

  const applyDayPreset = (preset: 'lun_sam' | 'lun_ven' | 'all' | 'weekend') => {
    switch (preset) {
      case 'lun_sam':
        setSelectedDays(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam']);
        break;
      case 'lun_ven':
        setSelectedDays(['lun', 'mar', 'mer', 'jeu', 'ven']);
        break;
      case 'all':
        setSelectedDays(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']);
        break;
      case 'weekend':
        setSelectedDays(['sam', 'dim']);
        break;
    }
  };

  const applyTimePreset = (start: string, end: string) => {
    setStartTime(start);
    setEndTime(end);
  };

  const handleConfirm = () => {
    let daysText = '';
    if (selectedDays.length === 7) {
      daysText = 'Tous les jours (7j/7)';
    } else if (
      selectedDays.length === 6 &&
      ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].every((d) => selectedDays.includes(d))
    ) {
      daysText = 'Lundi à Samedi';
    } else if (
      selectedDays.length === 5 &&
      ['lun', 'mar', 'mer', 'jeu', 'ven'].every((d) => selectedDays.includes(d))
    ) {
      daysText = 'Lundi au Vendredi';
    } else if (
      selectedDays.length === 2 &&
      selectedDays.includes('sam') &&
      selectedDays.includes('dim')
    ) {
      daysText = 'Week-end (Samedi & Dimanche)';
    } else {
      const fullNames = DAYS.filter((d) => selectedDays.includes(d.id)).map((d) => d.short);
      daysText = fullNames.join(', ');
    }

    let result = `${daysText} de ${startTime} à ${endTime}`;
    if (hasLunchBreak) {
      result += ` (Pause: ${lunchStart}-${lunchEnd})`;
    }

    onChange(result);
    setIsOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs">
        {label}
      </label>

      {/* Input Display Trigger */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-blue-600 dark:text-blue-400 text-lg">
            schedule
          </span>
          <input
            type="text"
            readOnly
            value={value || 'Lundi à Samedi de 08:00 à 19:00'}
            onClick={() => setIsOpen(true)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold cursor-pointer hover:border-blue-500 focus:outline-none transition-colors"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-base">calendar_month</span>
          <span>Choisir créneaux</span>
        </button>
      </div>

      {/* Modal Selection Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-5 shadow-2xl overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">calendar_month</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                    Planificateur d'Horaires Livreur
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Définissez précisément vos jours de travail et vos plages horaires
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: Select Active Days */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                  1. Choisir les jours de travail
                </span>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">
                  {selectedDays.length} jour(s) sélectionné(s)
                </span>
              </div>

              {/* Quick Preset Buttons for Days */}
              <div className="flex flex-wrap gap-1.5 py-1">
                <button
                  type="button"
                  onClick={() => applyDayPreset('lun_sam')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                >
                  Lun - Sam
                </button>
                <button
                  type="button"
                  onClick={() => applyDayPreset('lun_ven')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                >
                  Lun - Ven
                </button>
                <button
                  type="button"
                  onClick={() => applyDayPreset('all')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                >
                  7j / 7j
                </button>
                <button
                  type="button"
                  onClick={() => applyDayPreset('weekend')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                >
                  Week-end
                </button>
              </div>

              {/* Interactive Day Chips */}
              <div className="grid grid-cols-7 gap-1.5 pt-1">
                {DAYS.map((day) => {
                  const isSelected = selectedDays.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => toggleDay(day.id)}
                      className={`py-2 rounded-xl text-center font-bold text-xs transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <span className="text-[10px] opacity-80">{day.short}</span>
                      <span className="text-[11px]">{isSelected ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 2: Select Hours */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                  2. Choisir les heures de tournée
                </span>
              </div>

              {/* Quick Time Presets */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => applyTimePreset('08:00', '19:00')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold text-[11px]"
                >
                  ☀️ Standard (08:00 - 19:00)
                </button>
                <button
                  type="button"
                  onClick={() => applyTimePreset('07:00', '15:00')}
                  className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-semibold text-[11px]"
                >
                  🌅 Matin (07:00 - 15:00)
                </button>
                <button
                  type="button"
                  onClick={() => applyTimePreset('16:00', '23:00')}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold text-[11px]"
                >
                  🌙 Soir (16:00 - 23:00)
                </button>
                <button
                  type="button"
                  onClick={() => applyTimePreset('00:00', '23:59')}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                >
                  ⚡ 24h / 24h
                </button>
              </div>

              {/* Start & End Time Selectors */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="space-y-1">
                  <label className="block text-slate-500 dark:text-slate-400 font-bold text-[11px]">
                    Heure de début :
                  </label>
                  <select
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold text-sm focus:ring-2 focus:ring-blue-600"
                  >
                    {HOURS.map((h) => (
                      <option key={`start_${h}`} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-500 dark:text-slate-400 font-bold text-[11px]">
                    Heure de fin :
                  </label>
                  <select
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold text-sm focus:ring-2 focus:ring-blue-600"
                  >
                    {HOURS.map((h) => (
                      <option key={`end_${h}`} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Lunch Break Toggle */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasLunchBreak}
                    onChange={(e) => setHasLunchBreak(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                    Ajouter une pause méridienne / pause déjeuner
                  </span>
                </label>

                {hasLunchBreak && (
                  <div className="grid grid-cols-2 gap-3 p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block">Début pause</span>
                      <select
                        value={lunchStart}
                        onChange={(e) => setLunchStart(e.target.value)}
                        className="w-full p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                      >
                        {HOURS.slice(11, 16).map((h) => (
                          <option key={`ls_${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block">Fin pause</span>
                      <select
                        value={lunchEnd}
                        onChange={(e) => setLunchEnd(e.target.value)}
                        className="w-full p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                      >
                        {HOURS.slice(12, 17).map((h) => (
                          <option key={`le_${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Schedule Matrix Preview */}
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Aperçu de la disponibilité hebdomadaire</span>
                <span className="text-emerald-400 font-mono">
                  {startTime} ➔ {endTime}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1 pt-1">
                {DAYS.map((d) => {
                  const isActive = selectedDays.includes(d.id);
                  return (
                    <div
                      key={`preview_${d.id}`}
                      className={`p-1.5 rounded-lg text-center ${
                        isActive ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500 opacity-40'
                      }`}
                    >
                      <div className="text-[9px] font-bold uppercase">{d.short}</div>
                      <div className="text-[10px] font-mono mt-0.5">{isActive ? 'OUVERT' : 'OFF'}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold shadow-md active:scale-95 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>Appliquer ces horaires</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
