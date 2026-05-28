export interface TimezoneEntry {
  iana: string;
  country: string;
  region: string;
  flag: string;
  offset: string;
  search: string;
}

export const TIMEZONES: TimezoneEntry[] = [
  // South Asia
  { iana: 'Asia/Dhaka',       country: 'Bangladesh',           region: 'Asia',          flag: '🇧🇩', offset: 'UTC+6:00',   search: 'bangladesh dhaka bd' },
  { iana: 'Asia/Kolkata',     country: 'India',                region: 'Asia',          flag: '🇮🇳', offset: 'UTC+5:30',   search: 'india kolkata calcutta new delhi mumbai indian ist' },
  { iana: 'Asia/Karachi',     country: 'Pakistan',             region: 'Asia',          flag: '🇵🇰', offset: 'UTC+5:00',   search: 'pakistan karachi islamabad pk' },
  { iana: 'Asia/Colombo',     country: 'Sri Lanka',            region: 'Asia',          flag: '🇱🇰', offset: 'UTC+5:30',   search: 'sri lanka colombo lk' },
  { iana: 'Asia/Kathmandu',   country: 'Nepal',                region: 'Asia',          flag: '🇳🇵', offset: 'UTC+5:45',   search: 'nepal kathmandu np' },
  { iana: 'Asia/Thimphu',     country: 'Bhutan',               region: 'Asia',          flag: '🇧🇹', offset: 'UTC+6:00',   search: 'bhutan thimphu bt' },
  { iana: 'Asia/Kabul',       country: 'Afghanistan',          region: 'Asia',          flag: '🇦🇫', offset: 'UTC+4:30',   search: 'afghanistan kabul af' },

  // Southeast Asia
  { iana: 'Asia/Rangoon',     country: 'Myanmar',              region: 'Asia',          flag: '🇲🇲', offset: 'UTC+6:30',   search: 'myanmar burma rangoon yangon mm' },
  { iana: 'Asia/Bangkok',     country: 'Thailand',             region: 'Asia',          flag: '🇹🇭', offset: 'UTC+7:00',   search: 'thailand bangkok th' },
  { iana: 'Asia/Jakarta',     country: 'Indonesia',            region: 'Asia',          flag: '🇮🇩', offset: 'UTC+7:00',   search: 'indonesia jakarta id' },
  { iana: 'Asia/Manila',      country: 'Philippines',          region: 'Asia',          flag: '🇵🇭', offset: 'UTC+8:00',   search: 'philippines manila ph' },
  { iana: 'Asia/Singapore',   country: 'Singapore',            region: 'Asia',          flag: '🇸🇬', offset: 'UTC+8:00',   search: 'singapore sg' },
  { iana: 'Asia/Kuala_Lumpur',country: 'Malaysia',             region: 'Asia',          flag: '🇲🇾', offset: 'UTC+8:00',   search: 'malaysia kuala lumpur my' },
  { iana: 'Asia/Ho_Chi_Minh', country: 'Vietnam',              region: 'Asia',          flag: '🇻🇳', offset: 'UTC+7:00',   search: 'vietnam ho chi minh saigon hanoi vn' },
  { iana: 'Asia/Phnom_Penh',  country: 'Cambodia',             region: 'Asia',          flag: '🇰🇭', offset: 'UTC+7:00',   search: 'cambodia phnom penh kh' },

  // East Asia
  { iana: 'Asia/Shanghai',    country: 'China',                region: 'Asia',          flag: '🇨🇳', offset: 'UTC+8:00',   search: 'china shanghai beijing cn' },
  { iana: 'Asia/Tokyo',       country: 'Japan',                region: 'Asia',          flag: '🇯🇵', offset: 'UTC+9:00',   search: 'japan tokyo jp' },
  { iana: 'Asia/Seoul',       country: 'South Korea',          region: 'Asia',          flag: '🇰🇷', offset: 'UTC+9:00',   search: 'south korea seoul kr' },
  { iana: 'Asia/Taipei',      country: 'Taiwan',               region: 'Asia',          flag: '🇹🇼', offset: 'UTC+8:00',   search: 'taiwan taipei tw' },
  { iana: 'Asia/Hong_Kong',   country: 'Hong Kong',            region: 'Asia',          flag: '🇭🇰', offset: 'UTC+8:00',   search: 'hong kong hk' },

  // Central Asia
  { iana: 'Asia/Tashkent',    country: 'Uzbekistan',           region: 'Asia',          flag: '🇺🇿', offset: 'UTC+5:00',   search: 'uzbekistan tashkent uz' },
  { iana: 'Asia/Almaty',      country: 'Kazakhstan',           region: 'Asia',          flag: '🇰🇿', offset: 'UTC+6:00',   search: 'kazakhstan almaty kz' },
  { iana: 'Asia/Bishkek',     country: 'Kyrgyzstan',           region: 'Asia',          flag: '🇰🇬', offset: 'UTC+6:00',   search: 'kyrgyzstan bishkek kg' },

  // Middle East
  { iana: 'Asia/Dubai',       country: 'UAE',                  region: 'Middle East',   flag: '🇦🇪', offset: 'UTC+4:00',   search: 'uae united arab emirates dubai abu dhabi ae' },
  { iana: 'Asia/Riyadh',      country: 'Saudi Arabia',         region: 'Middle East',   flag: '🇸🇦', offset: 'UTC+3:00',   search: 'saudi arabia riyadh sa' },
  { iana: 'Asia/Tehran',      country: 'Iran',                 region: 'Middle East',   flag: '🇮🇷', offset: 'UTC+3:30',   search: 'iran tehran ir' },
  { iana: 'Asia/Baghdad',     country: 'Iraq',                 region: 'Middle East',   flag: '🇮🇶', offset: 'UTC+3:00',   search: 'iraq baghdad iq' },
  { iana: 'Asia/Kuwait',      country: 'Kuwait',               region: 'Middle East',   flag: '🇰🇼', offset: 'UTC+3:00',   search: 'kuwait kw' },
  { iana: 'Asia/Beirut',      country: 'Lebanon',              region: 'Middle East',   flag: '🇱🇧', offset: 'UTC+2:00',   search: 'lebanon beirut lb' },
  { iana: 'Asia/Jerusalem',   country: 'Israel',               region: 'Middle East',   flag: '🇮🇱', offset: 'UTC+2:00',   search: 'israel jerusalem il' },
  { iana: 'Asia/Qatar',       country: 'Qatar',                region: 'Middle East',   flag: '🇶🇦', offset: 'UTC+3:00',   search: 'qatar doha qa' },

  // Europe
  { iana: 'Europe/London',    country: 'United Kingdom',       region: 'Europe',        flag: '🇬🇧', offset: 'UTC+0:00',   search: 'uk united kingdom britain london england gb' },
  { iana: 'Europe/Paris',     country: 'France',               region: 'Europe',        flag: '🇫🇷', offset: 'UTC+1:00',   search: 'france paris fr' },
  { iana: 'Europe/Berlin',    country: 'Germany',              region: 'Europe',        flag: '🇩🇪', offset: 'UTC+1:00',   search: 'germany berlin de' },
  { iana: 'Europe/Rome',      country: 'Italy',                region: 'Europe',        flag: '🇮🇹', offset: 'UTC+1:00',   search: 'italy rome milan it' },
  { iana: 'Europe/Madrid',    country: 'Spain',                region: 'Europe',        flag: '🇪🇸', offset: 'UTC+1:00',   search: 'spain madrid barcelona es' },
  { iana: 'Europe/Amsterdam', country: 'Netherlands',          region: 'Europe',        flag: '🇳🇱', offset: 'UTC+1:00',   search: 'netherlands holland amsterdam nl' },
  { iana: 'Europe/Brussels',  country: 'Belgium',              region: 'Europe',        flag: '🇧🇪', offset: 'UTC+1:00',   search: 'belgium brussels be' },
  { iana: 'Europe/Zurich',    country: 'Switzerland',          region: 'Europe',        flag: '🇨🇭', offset: 'UTC+1:00',   search: 'switzerland zurich ch' },
  { iana: 'Europe/Stockholm', country: 'Sweden',               region: 'Europe',        flag: '🇸🇪', offset: 'UTC+1:00',   search: 'sweden stockholm se' },
  { iana: 'Europe/Oslo',      country: 'Norway',               region: 'Europe',        flag: '🇳🇴', offset: 'UTC+1:00',   search: 'norway oslo no' },
  { iana: 'Europe/Copenhagen',country: 'Denmark',              region: 'Europe',        flag: '🇩🇰', offset: 'UTC+1:00',   search: 'denmark copenhagen dk' },
  { iana: 'Europe/Helsinki',  country: 'Finland',              region: 'Europe',        flag: '🇫🇮', offset: 'UTC+2:00',   search: 'finland helsinki fi' },
  { iana: 'Europe/Warsaw',    country: 'Poland',               region: 'Europe',        flag: '🇵🇱', offset: 'UTC+1:00',   search: 'poland warsaw pl' },
  { iana: 'Europe/Prague',    country: 'Czech Republic',       region: 'Europe',        flag: '🇨🇿', offset: 'UTC+1:00',   search: 'czech republic prague cz' },
  { iana: 'Europe/Vienna',    country: 'Austria',              region: 'Europe',        flag: '🇦🇹', offset: 'UTC+1:00',   search: 'austria vienna at' },
  { iana: 'Europe/Lisbon',    country: 'Portugal',             region: 'Europe',        flag: '🇵🇹', offset: 'UTC+0:00',   search: 'portugal lisbon pt' },
  { iana: 'Europe/Athens',    country: 'Greece',               region: 'Europe',        flag: '🇬🇷', offset: 'UTC+2:00',   search: 'greece athens gr' },
  { iana: 'Europe/Istanbul',  country: 'Turkey',               region: 'Europe',        flag: '🇹🇷', offset: 'UTC+3:00',   search: 'turkey istanbul ankara tr' },
  { iana: 'Europe/Moscow',    country: 'Russia (Moscow)',      region: 'Europe',        flag: '🇷🇺', offset: 'UTC+3:00',   search: 'russia moscow ru' },
  { iana: 'Europe/Kiev',      country: 'Ukraine',              region: 'Europe',        flag: '🇺🇦', offset: 'UTC+2:00',   search: 'ukraine kyiv kiev ua' },
  { iana: 'Europe/Bucharest', country: 'Romania',              region: 'Europe',        flag: '🇷🇴', offset: 'UTC+2:00',   search: 'romania bucharest ro' },

  // Africa
  { iana: 'Africa/Cairo',     country: 'Egypt',                region: 'Africa',        flag: '🇪🇬', offset: 'UTC+2:00',   search: 'egypt cairo eg' },
  { iana: 'Africa/Lagos',     country: 'Nigeria',              region: 'Africa',        flag: '🇳🇬', offset: 'UTC+1:00',   search: 'nigeria lagos abuja ng' },
  { iana: 'Africa/Nairobi',   country: 'Kenya',                region: 'Africa',        flag: '🇰🇪', offset: 'UTC+3:00',   search: 'kenya nairobi ke' },
  { iana: 'Africa/Johannesburg', country: 'South Africa',      region: 'Africa',        flag: '🇿🇦', offset: 'UTC+2:00',   search: 'south africa johannesburg za' },
  { iana: 'Africa/Casablanca',country: 'Morocco',              region: 'Africa',        flag: '🇲🇦', offset: 'UTC+1:00',   search: 'morocco casablanca ma' },
  { iana: 'Africa/Addis_Ababa', country: 'Ethiopia',           region: 'Africa',        flag: '🇪🇹', offset: 'UTC+3:00',   search: 'ethiopia addis ababa et' },

  // Americas — United States
  { iana: 'America/New_York',   country: 'USA — Eastern',      region: 'Americas',      flag: '🇺🇸', offset: 'UTC-5:00',   search: 'usa united states america new york eastern us' },
  { iana: 'America/Chicago',    country: 'USA — Central',      region: 'Americas',      flag: '🇺🇸', offset: 'UTC-6:00',   search: 'usa united states america chicago central us' },
  { iana: 'America/Denver',     country: 'USA — Mountain',     region: 'Americas',      flag: '🇺🇸', offset: 'UTC-7:00',   search: 'usa united states america denver mountain us' },
  { iana: 'America/Los_Angeles',country: 'USA — Pacific',      region: 'Americas',      flag: '🇺🇸', offset: 'UTC-8:00',   search: 'usa united states america los angeles pacific california us' },
  { iana: 'America/Anchorage',  country: 'USA — Alaska',       region: 'Americas',      flag: '🇺🇸', offset: 'UTC-9:00',   search: 'usa united states alaska us' },
  { iana: 'Pacific/Honolulu',   country: 'USA — Hawaii',       region: 'Americas',      flag: '🇺🇸', offset: 'UTC-10:00',  search: 'usa united states hawaii us' },

  // Americas — Other
  { iana: 'America/Toronto',    country: 'Canada — Eastern',   region: 'Americas',      flag: '🇨🇦', offset: 'UTC-5:00',   search: 'canada toronto ontario eastern ca' },
  { iana: 'America/Vancouver',  country: 'Canada — Pacific',   region: 'Americas',      flag: '🇨🇦', offset: 'UTC-8:00',   search: 'canada vancouver british columbia pacific ca' },
  { iana: 'America/Mexico_City',country: 'Mexico',             region: 'Americas',      flag: '🇲🇽', offset: 'UTC-6:00',   search: 'mexico city mx' },
  { iana: 'America/Sao_Paulo',  country: 'Brazil',             region: 'Americas',      flag: '🇧🇷', offset: 'UTC-3:00',   search: 'brazil sao paulo rio br' },
  { iana: 'America/Argentina/Buenos_Aires', country: 'Argentina', region: 'Americas',  flag: '🇦🇷', offset: 'UTC-3:00',   search: 'argentina buenos aires ar' },
  { iana: 'America/Bogota',     country: 'Colombia',           region: 'Americas',      flag: '🇨🇴', offset: 'UTC-5:00',   search: 'colombia bogota co' },
  { iana: 'America/Lima',       country: 'Peru',               region: 'Americas',      flag: '🇵🇪', offset: 'UTC-5:00',   search: 'peru lima pe' },
  { iana: 'America/Santiago',   country: 'Chile',              region: 'Americas',      flag: '🇨🇱', offset: 'UTC-4:00',   search: 'chile santiago cl' },

  // Oceania
  { iana: 'Australia/Sydney',   country: 'Australia — East',   region: 'Oceania',       flag: '🇦🇺', offset: 'UTC+11:00',  search: 'australia sydney melbourne eastern au' },
  { iana: 'Australia/Perth',    country: 'Australia — West',   region: 'Oceania',       flag: '🇦🇺', offset: 'UTC+8:00',   search: 'australia perth western au' },
  { iana: 'Pacific/Auckland',   country: 'New Zealand',        region: 'Oceania',       flag: '🇳🇿', offset: 'UTC+13:00',  search: 'new zealand auckland nz' },

  // UTC
  { iana: 'UTC',                country: 'UTC / GMT',          region: 'Global',        flag: '🌐', offset: 'UTC+0:00',   search: 'utc gmt universal global' },
];

export function filterTimezones(query: string): TimezoneEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return TIMEZONES;
  return TIMEZONES.filter(tz => tz.search.includes(q) || tz.country.toLowerCase().includes(q) || tz.iana.toLowerCase().includes(q));
}

export function getTimezoneEntry(iana: string): TimezoneEntry | undefined {
  return TIMEZONES.find(tz => tz.iana === iana);
}

export function getCurrentOffset(iana: string): string {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr  = now.toLocaleString('en-US', { timeZone: iana });
    const diffMins = Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000);
    const sign = diffMins >= 0 ? '+' : '-';
    const abs = Math.abs(diffMins);
    const h = Math.floor(abs / 60).toString().padStart(2, '0');
    const m = (abs % 60).toString().padStart(2, '0');
    return `UTC${sign}${h}:${m}`;
  } catch {
    return '';
  }
}
