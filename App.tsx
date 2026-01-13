
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GeoLocation, IPData, NeighborhoodInsight, HistoryPoint } from './types';
import { getNeighborhoodInsights } from './services/geminiService';
import Dashboard from './components/Dashboard';
import MapDisplay from './components/MapDisplay';

const App: React.FC = () => {
  const [gpsLocation, setGpsLocation] = useState<GeoLocation | null>(null);
  const [ipLocation, setIpLocation] = useState<GeoLocation | null>(null);
  const [ipInfo, setIpInfo] = useState<IPData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [insights, setInsights] = useState<NeighborhoodInsight | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const lastInsightLocRef = useRef<{lat: number, lng: number} | null>(null);

  const fetchIpLocation = async (customIp?: string) => {
    setError(null);
    
    // Define provider strategies
    const providers = [
      // Strategy 1: ipapi.co (Primary)
      async () => {
        const url = customIp ? `https://ipapi.co/${customIp}/json/` : 'https://ipapi.co/json/';
        const response = await fetch(url);
        if (!response.ok) throw new Error('Primary provider failed');
        const data = await response.json();
        if (data.error) throw new Error(data.reason || 'Invalid IP');
        return data as IPData;
      },
      // Strategy 2: ipwho.is (Secondary Fallback)
      async () => {
        const url = customIp ? `https://ipwho.is/${customIp}` : 'https://ipwho.is/';
        const response = await fetch(url);
        if (!response.ok) throw new Error('Secondary provider failed');
        const data = await response.json();
        if (data.success === false) throw new Error(data.message || 'Lookup failed');
        
        // Map to our IPData interface
        return {
          ip: data.ip,
          city: data.city,
          region: data.region,
          country_name: data.country,
          latitude: data.latitude,
          longitude: data.longitude,
          org: data.connection?.org || data.connection?.isp || 'Unknown ISP',
          asn: data.connection?.asn?.toString() || 'N/A',
          timezone: data.timezone?.id || 'UTC',
          currency: data.currency?.code || 'USD',
          country_calling_code: data.country_code || '',
          languages: ''
        } as IPData;
      }
    ];

    let lastError = '';
    for (const fetchStrategy of providers) {
      try {
        const data = await fetchStrategy();
        setIpInfo(data);
        const loc: GeoLocation = {
          lat: data.latitude,
          lng: data.longitude,
          accuracy: null,
          timestamp: Date.now(),
          source: 'ip'
        };
        setIpLocation(loc);
        
        // If we don't have GPS yet, get AI insights for the IP location
        if (!isTracking || !gpsLocation) {
          triggerInsights(loc);
        }
        return; // Success, exit the loop
      } catch (err: any) {
        console.warn(`Provider failed: ${err.message}`);
        lastError = err.message;
      }
    }

    // If all providers fail
    setError(`Telemetry Error: ${lastError}. This is often caused by ad-blockers or local network restrictions.`);
  };

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setIsTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc: GeoLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          altitude: position.coords.altitude,
          timestamp: position.timestamp,
          source: 'gps'
        };
        
        setGpsLocation(newLoc);
        setHistory(prev => {
          const newHistory = [...prev, { lat: newLoc.lat, lng: newLoc.lng, timestamp: newLoc.timestamp }];
          return newHistory.slice(-50);
        });
        setError(null);

        if (!lastInsightLocRef.current || calculateDistance(lastInsightLocRef.current, {lat: newLoc.lat, lng: newLoc.lng}) > 0.5) {
            triggerInsights(newLoc);
        }
      },
      (err) => {
        // More descriptive error for common GPS issues
        const msg = err.code === 1 ? "Location access denied. Please enable GPS permissions." : err.message;
        setError(msg);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
  }, [gpsLocation, isTracking]);

  const triggerInsights = async (loc: GeoLocation) => {
    setLoadingInsights(true);
    try {
      const result = await getNeighborhoodInsights(loc);
      setInsights(result);
      lastInsightLocRef.current = { lat: loc.lat, lng: loc.lng };
    } catch (e) {
      console.error("Gemini Insight error:", e);
    } finally {
      setLoadingInsights(false);
    }
  };

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    fetchIpLocation();
    startTracking();
    return () => stopTracking();
  }, []); // Run once on mount

  function calculateDistance(loc1: {lat: number, lng: number}, loc2: {lat: number, lng: number}) {
    const R = 6371;
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lng - loc1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  const drift = (gpsLocation && ipLocation) ? calculateDistance(gpsLocation, ipLocation) : 0;

  return (
    <div className="min-h-screen bg-[#05080f] text-slate-100 flex flex-col md:flex-row font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sidebar / Info */}
      <div className="flex-1 flex flex-col p-4 md:p-6 space-y-4 h-screen overflow-y-auto border-r border-slate-800/50 backdrop-blur-xl">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg blur opacity-40 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0012 21a10.003 10.003 0 008.384-4.51l.054.09m-4.289-8.325a5 5 0 00-7.605 9.499M15 7a5 5 0 011 1m-1 4a5 5 0 01-1 1m-3-4a5 5 0 01-1 1m-1 4a5 5 0 011 1" />
                </svg>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 uppercase">GEOPULSE OS</h1>
              <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Advanced Telemetry Core</p>
            </div>
          </div>
          <button 
              onClick={isTracking ? stopTracking : startTracking}
              className={`group relative inline-flex items-center justify-center p-0.5 overflow-hidden text-sm font-medium rounded-full ${isTracking ? 'bg-red-500/20' : 'bg-indigo-500/20'}`}
          >
            <span className={`relative px-5 py-2 transition-all ease-in duration-75 rounded-full ${isTracking ? 'text-red-400 hover:bg-red-500 hover:text-white' : 'text-indigo-400 hover:bg-indigo-500 hover:text-white'}`}>
              {isTracking ? 'DEACTIVATE FEED' : 'ACTIVATE TELEMETRY'}
            </span>
          </button>
        </header>

        <Dashboard 
            gps={gpsLocation} 
            ip={ipLocation} 
            ipInfo={ipInfo} 
            error={error} 
            drift={drift}
            onUpdateIp={fetchIpLocation}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[500px]">
          <div className="lg:col-span-2 relative group bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-[0_0_50px_-12px_rgba(79,70,229,0.2)]">
             <MapDisplay gps={gpsLocation} ip={ipLocation} history={history} />
             
             {/* Map Overlay HUD */}
             <div className="absolute top-6 left-6 z-[1000] flex flex-col space-y-2 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full animate-ping ${isTracking ? 'bg-indigo-500' : 'bg-slate-500'}`}></div>
                  <span className="text-[10px] font-bold tracking-widest text-slate-300">
                    {isTracking ? 'GEO_SYNC_ACTIVE' : 'IDLE_MODE'}
                  </span>
                </div>
                {drift > 0 && (
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center space-x-3">
                    <span className="text-[10px] font-bold tracking-widest text-amber-500">DRIFT: {drift.toFixed(2)} KM</span>
                  </div>
                )}
             </div>

             {/* Live Indicators Overlay */}
             {isTracking && (
                <div className="absolute bottom-6 right-6 z-[1000] flex flex-col items-end pointer-events-none">
                   <div className="text-[40px] font-black text-white/5 tracking-tighter leading-none select-none">
                     {gpsLocation?.lat.toFixed(4)}
                   </div>
                   <div className="text-[40px] font-black text-white/5 tracking-tighter leading-none select-none">
                     {gpsLocation?.lng.toFixed(4)}
                   </div>
                </div>
             )}
          </div>
          
          {/* Intelligence Panel */}
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 flex flex-col space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 flex items-center space-x-2">
                <div className="w-1.5 h-4 bg-indigo-500 rounded-full"></div>
                <span>Environmental Intel</span>
              </h2>
              {loadingInsights && (
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce"></div>
                </div>
              )}
            </div>

            {insights ? (
              <div className="space-y-6 animate-in fade-in duration-700 slide-in-from-bottom-2">
                <div className="relative p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 shadow-inner">
                  <p className="text-slate-300 text-sm leading-relaxed font-medium italic">
                    "{insights.description}"
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Points of Interest via Maps</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {insights.sources.length > 0 ? insights.sources.map((src, i) => (
                      <a 
                        key={i} 
                        href={src.uri} 
                        target="_blank" 
                        rel="noreferrer"
                        className="group flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-800 transition-all"
                      >
                        <span className="text-xs font-semibold text-slate-300 group-hover:text-indigo-400 truncate mr-4">{src.title}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 group-hover:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )) : (
                      <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest p-4 border border-dashed border-slate-800 rounded-xl text-center">
                        No localized anchor data found
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                   <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mb-2">
                      <span>INTELLIGENCE CONFIDENCE</span>
                      <span>{loadingInsights ? '...' : '92%'}</span>
                   </div>
                   <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full w-[92%] shadow-[0_0_10px_#6366f1] transition-all duration-1000"></div>
                   </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                <svg className="animate-pulse w-12 h-12 text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="text-xs font-bold tracking-widest uppercase">Awaiting Geospatial Link...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
