export interface WeatherData {
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  current_weather?: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
    time: string;
  };
}

export interface ForecastPoint {
  time: Date;
  temp: number;
  precip: number;
  code: number;
  label: string;
}

export interface Location {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isCurrent?: boolean;
}
