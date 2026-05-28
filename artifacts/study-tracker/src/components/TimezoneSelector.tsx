import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Globe, Search, Check, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TIMEZONES, filterTimezones, getTimezoneEntry, getCurrentOffset } from '@/lib/timezones';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  value?: string;
  onChange: (iana: string) => void;
  lang?: 'en' | 'bn';
}

export function TimezoneSelector({ isOpen, onClose, value, onChange, lang = 'en' }: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isBn = lang === 'bn';

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const filtered = useMemo(() => filterTimezones(query), [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof TIMEZONES>();
    for (const tz of filtered) {
      const arr = map.get(tz.region) ?? [];
      arr.push(tz);
      map.set(tz.region, arr);
    }
    return map;
  }, [filtered]);

  const currentEntry = value ? getTimezoneEntry(value) : null;
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleSelect = (iana: string) => {
    onChange(iana);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-background rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '85dvh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Globe size={18} className="text-primary" />
                <h2 className="text-base font-bold text-foreground">
                  {isBn ? 'টাইম জোন বেছে নিন' : 'Select Timezone'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Current / Device info */}
            <div className="px-5 pb-3 shrink-0 space-y-2">
              {currentEntry && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/8 border border-primary/20 rounded-xl">
                  <span className="text-lg">{currentEntry.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{isBn ? 'বর্তমান' : 'Current'}</p>
                    <p className="text-sm font-semibold text-primary truncate">{currentEntry.country}</p>
                  </div>
                  <span className="text-xs font-mono text-primary/70 shrink-0">{getCurrentOffset(currentEntry.iana)}</span>
                </div>
              )}
              <button
                onClick={() => handleSelect(deviceTz)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/60 border border-border/40 rounded-xl hover:bg-secondary transition-colors text-left"
              >
                <span className="text-base">📱</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{isBn ? 'ডিভাইসের সময়' : 'Use device timezone'}</p>
                  <p className="text-xs font-mono text-foreground/70 truncate">{deviceTz}</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pb-3 shrink-0">
              <div className="flex items-center gap-2 bg-secondary border border-border/50 rounded-xl px-3 py-2.5">
                <Search size={15} className="text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={isBn ? 'দেশের নাম লিখুন... (যেমন: India, Bangladesh, USA)' : 'Search country... (e.g. India, Bangladesh, USA)'}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  {isBn ? 'কোনো ফলাফল পাওয়া যায়নি' : 'No results found'}
                </div>
              ) : (
                Array.from(grouped.entries()).map(([region, entries]) => (
                  <div key={region} className="mb-4">
                    <p className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2 px-1">
                      {region}
                    </p>
                    <div className="space-y-1">
                      {entries.map(tz => {
                        const isSelected = tz.iana === value;
                        return (
                          <button
                            key={tz.iana}
                            onClick={() => handleSelect(tz.iana)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                              isSelected
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-secondary/80 border border-transparent'
                            }`}
                          >
                            <span className="text-xl shrink-0">{tz.flag}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                {tz.country}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">{tz.iana}</p>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground shrink-0">{tz.offset}</span>
                            {isSelected && <Check size={15} className="text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
