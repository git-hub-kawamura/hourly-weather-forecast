import { 
  Sun, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog, 
  Wind, Droplets, Thermometer, Clock, MapPin, AlertCircle,
  ChevronRight, Calendar
} from 'lucide-react';

export const getWeatherIcon = (code: number) => {
  if (code === 0) return <Sun className="w-6 h-6 text-yellow-400" />;
  if (code >= 1 && code <= 3) return <Cloud className="w-6 h-6 text-gray-400" />;
  if (code >= 45 && code <= 48) return <CloudFog className="w-6 h-6 text-gray-300" />;
  if (code >= 51 && code <= 67) return <CloudRain className="w-6 h-6 text-blue-400" />;
  if (code >= 71 && code <= 77) return <CloudSnow className="w-6 h-6 text-blue-100" />;
  if (code >= 80 && code <= 82) return <CloudRain className="w-6 h-6 text-blue-500" />;
  if (code >= 85 && code <= 86) return <CloudSnow className="w-6 h-6 text-blue-200" />;
  if (code >= 95 && code <= 99) return <CloudLightning className="w-6 h-6 text-purple-500" />;
  return <Cloud className="w-6 h-6 text-gray-400" />;
};

export const getWeatherDescription = (code: number) => {
  const descriptions: Record<number, string> = {
    0: '快晴',
    1: '晴れ',
    2: '時々曇り',
    3: '曇り',
    45: '霧',
    48: '着氷性の霧',
    51: '霧雨 (弱)',
    53: '霧雨 (中)',
    55: '霧雨 (強)',
    61: '雨 (小)',
    63: '雨 (中)',
    65: '雨 (大)',
    71: '雪 (小)',
    73: '雪 (中)',
    75: '雪 (大)',
    80: 'にわか雨 (小)',
    81: 'にわか雨 (中)',
    82: 'にわか雨 (大)',
    95: '雷雨',
  };
  return descriptions[code] || '不明';
};
