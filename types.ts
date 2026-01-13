
export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
  source: 'gps' | 'ip';
  speed?: number | null;
  altitude?: number | null;
}

export interface IPData {
  ip: string;
  city: string;
  region: string;
  country_name: string;
  latitude: number;
  longitude: number;
  org: string;
  asn: string;
  timezone: string;
  currency: string;
  country_calling_code: string;
  languages: string;
  // Optional fields for error handling
  error?: boolean;
  reason?: string;
}

export interface NeighborhoodInsight {
  title: string;
  description: string;
  sources: Array<{ title: string; uri: string }>;
}

export interface HistoryPoint {
  lat: number;
  lng: number;
  timestamp: number;
}
