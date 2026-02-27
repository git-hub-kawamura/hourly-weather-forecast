import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sun, Cloud, CloudRain, Droplets, Thermometer, Clock, MapPin, 
  AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Plane, Navigation,
  Plus, Search, X, Trash2
} from 'lucide-react';
import { format, addHours, isSameHour, parseISO, differenceInHours } from 'date-fns';
import { ja } from 'date-fns/locale';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { WeatherData, ForecastPoint, Location } from './types/weather';
import { getWeatherIcon, getWeatherDescription } from './utils/weatherUtils';

const STORAGE_KEY = 'travel_weather_locations';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [savedLocations, setSavedLocations] = useState<Location[]>([]);
  const [selectedHourOffset, setSelectedHourOffset] = useState(3);
  
  // Search states
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  // Load saved locations from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSavedLocations(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved locations', e);
      }
    }
  }, []);

  // Save locations to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLocations));
  }, [savedLocations]);

  const fetchWeather = async (loc: Location) => {
    try {
      setLoading(true);
      const days = loc.isCurrent ? 3 : 7;
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,precipitation_probability,weather_code&current_weather=true&timezone=auto&forecast_days=${days}`
      );
      if (!response.ok) throw new Error('天気データの取得に失敗しました');
      const data = await response.json();
      setWeatherData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc: Location = {
            id: 'current',
            name: '現在地',
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            isCurrent: true
          };
          setCurrentLocation(loc);
          setSelectedLocation(loc);
          fetchWeather(loc);
        },
        () => {
          // If geolocation fails, try to select the first saved location or show error
          if (savedLocations.length > 0) {
            handleLocationChange(savedLocations[0]);
          } else {
            const defaultLoc = { id: 'tokyo', name: '東京', lat: 35.6895, lon: 139.6917 };
            setSelectedLocation(defaultLoc);
            fetchWeather(defaultLoc);
          }
          setError('位置情報の取得に失敗しました。');
        }
      );
    }
  }, []);

  const handleLocationChange = (loc: Location) => {
    setSelectedLocation(loc);
    setSelectedHourOffset(3);
    fetchWeather(loc);
    setIsSearching(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setIsSearchingApi(true);
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5&language=ja&format=json`
      );
      const data = await response.json();
      if (data.results) {
        const results: Location[] = data.results.map((r: any) => ({
          id: r.id.toString(),
          name: r.name,
          lat: r.latitude,
          lon: r.longitude
        }));
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearchingApi(false);
    }
  };

  const addLocation = (loc: Location) => {
    if (!savedLocations.find(l => l.id === loc.id)) {
      setSavedLocations(prev => [...prev, loc]);
    }
    handleLocationChange(loc);
  };

  const removeLocation = (id: string) => {
    setSavedLocations(prev => prev.filter(l => l.id !== id));
    if (selectedLocation?.id === id) {
      if (currentLocation) handleLocationChange(currentLocation);
      else if (savedLocations.length > 1) handleLocationChange(savedLocations[0]);
    }
  };

  const maxOffset = selectedLocation?.isCurrent ? 24 : 168;

  const forecastPoints = useMemo(() => {
    if (!weatherData) return [];
    const now = new Date();
    const offsets = [1, 2, 6, selectedHourOffset];
    return offsets.map(offset => {
      const targetTime = addHours(now, offset);
      const index = weatherData.hourly.time.findIndex(t => isSameHour(parseISO(t), targetTime));
      if (index === -1) return null;
      return {
        time: targetTime,
        temp: weatherData.hourly.temperature_2m[index],
        precip: weatherData.hourly.precipitation_probability[index],
        code: weatherData.hourly.weather_code[index],
        label: offset === selectedHourOffset ? `${offset}時間後` : `${offset}時間後`
      } as ForecastPoint;
    }).filter(Boolean) as ForecastPoint[];
  }, [weatherData, selectedHourOffset]);

  const chartData = useMemo(() => {
    if (!weatherData) return [];
    const now = new Date();
    const limit = selectedLocation?.isCurrent ? 24 : 72;
    return weatherData.hourly.time
      .map((time, i) => ({
        time: parseISO(time),
        displayTime: format(parseISO(time), 'HH:mm'),
        temp: weatherData.hourly.temperature_2m[i],
        precip: weatherData.hourly.precipitation_probability[i],
      }))
      .filter(d => d.time >= now && differenceInHours(d.time, now) <= limit);
  }, [weatherData, selectedLocation]);

  const adjustOffset = (amount: number) => {
    setSelectedHourOffset(prev => {
      const next = prev + amount;
      if (next < 1) return 1;
      if (next > maxOffset) return maxOffset;
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-30 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 p-1.5 rounded-lg shadow-sm">
              <Sun className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">TravelWeather</span>
          </div>
          <button 
            onClick={() => setIsSearching(true)}
            className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-blue-500 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 space-y-6">
        {/* Location Selector */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">拠点を選択</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
            {currentLocation && (
              <button
                onClick={() => handleLocationChange(currentLocation)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border flex items-center gap-2 ${
                  selectedLocation?.id === 'current' 
                    ? 'bg-blue-500 text-white border-blue-400 shadow-md shadow-blue-100' 
                    : 'bg-white text-slate-600 border-slate-100'
                }`}
              >
                <Navigation className="w-3 h-3" />
                現在地
              </button>
            )}
            {savedLocations.map(loc => (
              <div key={loc.id} className="relative group flex-shrink-0">
                <button
                  onClick={() => handleLocationChange(loc)}
                  className={`px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border flex items-center gap-2 ${
                    selectedLocation?.id === loc.id 
                      ? 'bg-blue-500 text-white border-blue-400 shadow-md shadow-blue-100' 
                      : 'bg-white text-slate-600 border-slate-100'
                  }`}
                >
                  <Plane className="w-3 h-3" />
                  {loc.name}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); removeLocation(loc.id); }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setIsSearching(true)}
              className="flex-shrink-0 px-4 py-2.5 rounded-2xl text-sm font-bold bg-slate-100 text-slate-400 border border-dashed border-slate-200 flex items-center gap-2"
            >
              <Plus className="w-3 h-3" />
              追加
            </button>
          </div>
        </section>

        {loading && !weatherData ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
            <p className="text-sm text-slate-400 font-bold">データを読み込み中...</p>
          </div>
        ) : (
          <>
            {/* Current Status Card */}
            {weatherData?.current_weather && (
              <motion.div 
                key={selectedLocation?.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 relative overflow-hidden"
              >
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-bold text-blue-500 uppercase">
                        {selectedLocation?.name}
                      </p>
                      {selectedLocation?.isCurrent && <Navigation className="w-3 h-3 text-blue-400" />}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-6xl font-light tracking-tighter">
                        {Math.round(weatherData.current_weather.temperature)}°
                      </span>
                      <span className="text-xl text-slate-300 font-light">C</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {getWeatherIcon(weatherData.current_weather.weathercode)}
                      <span className="font-bold text-slate-700">
                        {getWeatherDescription(weatherData.current_weather.weathercode)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">更新</p>
                    <p className="text-sm font-bold text-slate-600">{format(new Date(), 'HH:mm')}</p>
                  </div>
                </div>
                <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-blue-50 rounded-full blur-3xl opacity-50" />
              </motion.div>
            )}

            {/* Hourly Forecast */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">ピンポイント予報</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
                {forecastPoints.map((point, idx) => (
                  <div 
                    key={idx}
                    className={`flex-shrink-0 w-32 p-4 rounded-3xl border transition-all ${
                      idx === 3 ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-100'
                    }`}
                  >
                    <p className={`text-[10px] font-bold uppercase mb-3 ${idx === 3 ? 'text-blue-200' : 'text-slate-400'}`}>
                      {point.label}
                    </p>
                    <div className="flex items-center justify-between mb-2">
                      {getWeatherIcon(point.code)}
                      <span className="text-xl font-bold">{Math.round(point.temp)}°</span>
                    </div>
                    <p className={`text-xs font-bold mb-3 truncate ${idx === 3 ? 'text-blue-50' : 'text-slate-600'}`}>
                      {getWeatherDescription(point.code)}
                    </p>
                    <div className={`flex items-center gap-1 text-[10px] font-bold ${idx === 3 ? 'text-blue-100' : 'text-blue-500'}`}>
                      <Droplets className="w-3 h-3" />
                      {point.precip}%
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Arbitrary Hour Selector */}
            <section className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <h2 className="text-sm font-bold">時刻をチェック</h2>
                </div>
                <div className="bg-slate-50 px-3 py-1 rounded-full text-[10px] font-bold text-slate-400">
                  {selectedLocation?.isCurrent ? '24h' : '7days'}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 bg-slate-50 p-2 rounded-2xl">
                <button 
                  onClick={() => adjustOffset(-1)}
                  className="w-12 h-12 flex items-center justify-center bg-white rounded-xl border border-slate-100 active:scale-95 transition-transform shadow-sm"
                >
                  <ChevronLeft className="w-6 h-6 text-slate-600" />
                </button>
                
                <div className="flex-1 text-center">
                  <p className="text-2xl font-black text-blue-600 tracking-tighter">
                    {selectedHourOffset}
                    <span className="text-xs font-bold text-slate-400 ml-1">時間後</span>
                  </p>
                  <p className="text-[10px] font-bold text-slate-400">
                    {format(addHours(new Date(), selectedHourOffset), 'MM/dd HH:00', { locale: ja })}
                  </p>
                </div>

                <button 
                  onClick={() => adjustOffset(1)}
                  className="w-12 h-12 flex items-center justify-center bg-white rounded-xl border border-slate-100 active:scale-95 transition-transform shadow-sm"
                >
                  <ChevronRight className="w-6 h-6 text-slate-600" />
                </button>
              </div>

              <input 
                type="range" 
                min="1" 
                max={maxOffset} 
                value={selectedHourOffset} 
                onChange={(e) => setSelectedHourOffset(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </section>

            {/* Trend Chart */}
            <section className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-bold">気温の推移</h2>
              </div>
              <div className="h-48 w-full -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="displayTime" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                      interval={6}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="temp" 
                      stroke="#f97316" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorTemp)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearching && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">拠点を追加</h3>
                <button 
                  onClick={() => setIsSearching(false)}
                  className="p-2 bg-slate-100 rounded-full text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSearch} className="relative">
                <input 
                  autoFocus
                  type="text" 
                  placeholder="都市名を入力 (例: 札幌, London)" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-12 py-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <button 
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-blue-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold"
                >
                  検索
                </button>
              </form>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {isSearchingApi ? (
                  <div className="py-8 text-center">
                    <RefreshCw className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-bold">検索中...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(res => (
                    <button 
                      key={res.id}
                      onClick={() => addLocation(res)}
                      className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-xl shadow-sm group-hover:bg-blue-500 group-hover:text-white transition-colors">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-sm">{res.name}</span>
                      </div>
                      <Plus className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
                    </button>
                  ))
                ) : searchQuery && !isSearchingApi ? (
                  <p className="py-8 text-center text-xs text-slate-400 font-bold">結果が見つかりませんでした</p>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 font-bold">
                    旅行先の都市名を探してみましょう
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 px-6 py-4 z-40">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button 
            onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setIsSearching(false); }}
            className="flex flex-col items-center gap-1 text-blue-500"
          >
            <Sun className="w-6 h-6" />
            <span className="text-[10px] font-bold">予報</span>
          </button>
          <button 
            onClick={() => setIsSearching(true)}
            className="flex flex-col items-center gap-1 text-slate-400"
          >
            <Plus className="w-6 h-6" />
            <span className="text-[10px] font-bold">追加</span>
          </button>
          <button 
            onClick={() => fetchWeather(selectedLocation!)}
            className="flex flex-col items-center gap-1 text-slate-400"
          >
            <RefreshCw className="w-6 h-6" />
            <span className="text-[10px] font-bold">更新</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
