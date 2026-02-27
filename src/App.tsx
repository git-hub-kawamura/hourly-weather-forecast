import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Sun, Droplets, Thermometer, MapPin,
  RefreshCw, Plane, Navigation,
  Plus, Search, X, Calendar, Bell, BellOff, Umbrella
} from 'lucide-react';
import { format, addDays, isSameDay, parseISO, startOfDay, isToday, isTomorrow } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  AreaChart, Area, XAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { WeatherData, Location } from './types/weather';
import { getWeatherIcon, getWeatherDescription } from './utils/weatherUtils';

const STORAGE_KEY = 'travel_weather_locations';
const NOTIFIED_KEY = 'notified_cache';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [savedLocations, setSavedLocations] = useState<Location[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));

  // Notification states
  const notifSupported = 'Notification' in window;
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    localStorage.getItem('notifications_enabled') === 'true'
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const notifiedCache = useRef<Set<string>>(new Set(
    JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')
  ));

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Search states
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearchingApi, setIsSearchingApi] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setSavedLocations(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLocations));
  }, [savedLocations]);

  const fetchWeather = async (loc: Location) => {
    try {
      setLoading(true);
      const days = 7;
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
            id: 'current', name: '現在地',
            lat: position.coords.latitude, lon: position.coords.longitude,
            isCurrent: true
          };
          setCurrentLocation(loc);
          setSelectedLocation(loc);
          fetchWeather(loc);
        },
        () => {
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

  // Notification toggle
  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      if (!notifSupported) {
        showToast('このブラウザは通知に対応していません');
        return;
      }
      if (Notification.permission === 'denied') {
        showToast('通知がブロックされています。ブラウザの設定から許可してください');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        localStorage.setItem('notifications_enabled', 'true');
        showToast('通知をオンにしました ☂️');
      } else {
        showToast('通知の許可が得られませんでした');
      }
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem('notifications_enabled', 'false');
      showToast('通知をオフにしました');
    }
  };

  // Check for rain and send browser notification
  const checkAndNotify = useCallback((data: WeatherData, loc: Location, date: Date) => {
    if (!notificationsEnabled || !notifSupported || Notification.permission !== 'granted') return;

    const cacheKey = `${loc.id}_${format(date, 'yyyy-MM-dd')}`;
    if (notifiedCache.current.has(cacheKey)) return;

    const dayForecast = data.hourly.time
      .map((time, i) => ({
        time: parseISO(time),
        precip: data.hourly.precipitation_probability[i],
        code: data.hourly.weather_code[i],
      }))
      .filter(d => isSameDay(d.time, date));

    const maxPrecip = Math.max(...dayForecast.map(d => d.precip));
    const hasRain = dayForecast.some(d => d.code >= 51 || d.code >= 61);

    if (maxPrecip >= 50 || hasRain) {
      const dateLabel = isToday(date) ? '今日' : isTomorrow(date) ? '明日' : format(date, 'M月d日(E)', { locale: ja });
      new Notification(`☂️ ${loc.name} — 傘をお忘れなく！`, {
        body: `${dateLabel}は雨の予報があります（最大降水確率 ${maxPrecip}%）`,
        icon: '/hourly-weather-forecast/favicon.ico',
      });
      notifiedCache.current.add(cacheKey);
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notifiedCache.current]));
    }
  }, [notificationsEnabled]);

  // Trigger notification check when data/date/location changes
  useEffect(() => {
    if (weatherData && selectedLocation) {
      checkAndNotify(weatherData, selectedLocation, selectedDate);
    }
  }, [weatherData, selectedDate, selectedLocation, checkAndNotify]);

  const handleLocationChange = (loc: Location) => {
    setSelectedLocation(loc);
    setSelectedDate(startOfDay(new Date()));
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
        setSearchResults(data.results.map((r: any) => ({
          id: r.id.toString(), name: r.name,
          lat: r.latitude, lon: r.longitude
        })));
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

  const availableDays = useMemo(() => {
    const days = 7;
    return Array.from({ length: days }, (_, i) => startOfDay(addDays(new Date(), i)));
  }, [selectedLocation]);

  const formatDateLabel = (date: Date) => {
    if (isToday(date)) return '今日';
    if (isTomorrow(date)) return '明日';
    return format(date, 'M/d(E)', { locale: ja });
  };

  const dayHourlyForecast = useMemo(() => {
    if (!weatherData) return [];
    return weatherData.hourly.time
      .map((time, i) => ({
        time: parseISO(time),
        temp: weatherData.hourly.temperature_2m[i],
        precip: weatherData.hourly.precipitation_probability[i],
        code: weatherData.hourly.weather_code[i],
      }))
      .filter(d => isSameDay(d.time, selectedDate));
  }, [weatherData, selectedDate]);

  const chartData = useMemo(() => {
    return dayHourlyForecast.map(d => ({
      displayTime: format(d.time, 'H時'),
      temp: d.temp,
      precip: d.precip,
    }));
  }, [dayHourlyForecast]);

  const daySummary = useMemo(() => {
    if (dayHourlyForecast.length === 0) return null;
    const temps = dayHourlyForecast.map(d => d.temp);
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const maxPrecip = Math.max(...dayHourlyForecast.map(d => d.precip));
    const daytimeHours = dayHourlyForecast.filter(d => {
      const h = d.time.getHours();
      return h >= 6 && h <= 18;
    });
    const dominantCode = daytimeHours.length > 0
      ? daytimeHours[Math.floor(daytimeHours.length / 2)].code
      : dayHourlyForecast[0]?.code;
    const hasRain = maxPrecip >= 50 || dayHourlyForecast.some(d => d.code >= 51);
    return { maxTemp, minTemp, maxPrecip, dominantCode, hasRain };
  }, [dayHourlyForecast]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-xl whitespace-nowrap"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-30 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 p-1.5 rounded-lg shadow-sm">
              <Sun className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">TravelWeather</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Notification Toggle */}
            <button
              onClick={toggleNotifications}
              title={notificationsEnabled ? '通知オン' : '通知オフ'}
              className={`p-2 rounded-full transition-colors ${
                notificationsEnabled
                  ? 'bg-blue-50 text-blue-500'
                  : 'bg-slate-50 text-slate-400'
              }`}
            >
              {notificationsEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsSearching(true)}
              className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-blue-500 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 space-y-6">
        {/* Location Selector */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">拠点を選択</h2>
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

            {/* Date Selector */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Calendar className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">日付を選択</h2>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
                {availableDays.map((date) => {
                  const isSelected = isSameDay(date, selectedDate);
                  // Check if this day has rain for the dot indicator
                  const dayData = weatherData?.hourly.time
                    .map((time, i) => ({
                      time: parseISO(time),
                      precip: weatherData.hourly.precipitation_probability[i],
                    }))
                    .filter(d => isSameDay(d.time, date)) ?? [];
                  const dayMaxPrecip = dayData.length > 0 ? Math.max(...dayData.map(d => d.precip)) : 0;
                  const dayHasRain = dayMaxPrecip >= 50;

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(date)}
                      className={`flex-shrink-0 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border relative ${
                        isSelected
                          ? 'bg-blue-500 text-white border-blue-400 shadow-md shadow-blue-100'
                          : 'bg-white text-slate-600 border-slate-100'
                      }`}
                    >
                      {formatDateLabel(date)}
                      {dayHasRain && (
                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center text-[6px] ${
                          isSelected ? 'bg-white text-blue-500' : 'bg-blue-400 text-white'
                        }`}>☂</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Rain Alert Banner */}
            <AnimatePresence>
              {daySummary?.hasRain && (
                <motion.div
                  key={`rain-alert-${selectedDate.toISOString()}`}
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  className="bg-blue-500 rounded-[24px] p-4 flex items-center gap-4 shadow-lg shadow-blue-100"
                >
                  <div className="bg-white/20 p-3 rounded-2xl flex-shrink-0">
                    <Umbrella className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-white text-sm">☂️ 傘をお忘れなく！</p>
                    <p className="text-blue-100 text-xs font-bold mt-0.5">
                      {format(selectedDate, 'M月d日(E)', { locale: ja })}は雨の予報があります
                      （最大 {daySummary.maxPrecip}%）
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Day Summary */}
            {daySummary && (
              <motion.div
                key={selectedDate.toISOString()}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[32px] p-5 border border-slate-100 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getWeatherIcon(daySummary.dominantCode)}
                    <div>
                      <p className="font-bold text-slate-700">{getWeatherDescription(daySummary.dominantCode)}</p>
                      <p className="text-xs text-slate-400 font-bold">{format(selectedDate, 'M月d日(E)', { locale: ja })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black">
                      <span className="text-red-400">{Math.round(daySummary.maxTemp)}°</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className="text-blue-400">{Math.round(daySummary.minTemp)}°</span>
                    </p>
                    <div className="flex items-center gap-1 justify-end mt-1">
                      <Droplets className="w-3 h-3 text-blue-400" />
                      <span className="text-xs font-bold text-blue-500">{daySummary.maxPrecip}%</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Hourly Forecast for Selected Day */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">時間帯の予報</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4">
                {dayHourlyForecast.map((point, idx) => (
                  <div
                    key={idx}
                    className={`flex-shrink-0 w-20 p-3 rounded-3xl border flex flex-col items-center gap-2 ${
                      point.precip >= 50
                        ? 'bg-blue-50 border-blue-100'
                        : 'bg-white border-slate-100'
                    }`}
                  >
                    <p className="text-[10px] font-bold text-slate-400">
                      {format(point.time, 'H時')}
                    </p>
                    {getWeatherIcon(point.code)}
                    <span className="text-base font-bold">{Math.round(point.temp)}°</span>
                    <div className={`flex items-center gap-0.5 text-[10px] font-bold ${
                      point.precip >= 50 ? 'text-blue-600' : 'text-blue-400'
                    }`}>
                      <Droplets className="w-2.5 h-2.5" />
                      {point.precip}%
                    </div>
                  </div>
                ))}
              </div>
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
                      interval={2}
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
