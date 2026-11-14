/**
 * Weather Engine for GreenMaster AI
 * Connects to Open-Meteo (free, zero API key required, high-precision global agronomic weather)
 * Calculates rain probability, precipitation amount, and smart sprinkler skip recommendations.
 */
const WeatherEngine = {
  // Default coordinates (e.g. Brisbane/Sydney temperate or auto-detected)
  defaultCoords: { lat: -27.4698, lon: 153.0251, city: 'Brisbane' },

  async getCurrentWeather(coords = null) {
    const lat = coords?.lat || this.defaultCoords.lat;
    const lon = coords?.lon || this.defaultCoords.lon;
    
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather fetch failed');
      const data = await res.json();
      return this.parseWeatherData(data);
    } catch (e) {
      console.warn('Weather fetch error, using agronomy fallback:', e);
      return this.getFallbackWeather();
    }
  },

  async detectLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(this.defaultCoords);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            city: 'My Location'
          });
        },
        () => resolve(this.defaultCoords),
        { timeout: 5000 }
      );
    });
  },

  parseWeatherData(data) {
    const current = data.current || {};
    const daily = data.daily || {};

    const todayPrecip = daily.precipitation_sum?.[0] || 0;
    const tomorrowPrecip = daily.precipitation_sum?.[1] || 0;
    const maxProbToday = daily.precipitation_probability_max?.[0] || 0;
    const maxProbTomorrow = daily.precipitation_probability_max?.[1] || 0;

    const totalUpcomingRain = todayPrecip + tomorrowPrecip;
    const shouldSkipSprinklers = totalUpcomingRain >= 5 || maxProbToday >= 65 || maxProbTomorrow >= 65;

    let rainVerdict = '☀️ Dry & clear — Great window to mow or spray.';
    if (shouldSkipSprinklers) {
      rainVerdict = `🌧️ ${Math.round(totalUpcomingRain)}mm rain forecast (${Math.max(maxProbToday, maxProbTomorrow)}%) — Turn OFF sprinklers!`;
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const sevenDays = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(now);
      d.setDate(now.getDate() + idx);
      const dayLabel = idx === 0 ? 'Today' : idx === 1 ? 'Tmrw' : dayNames[d.getDay()];
      const rain = daily.precipitation_sum?.[idx] ?? 0;
      const prob = daily.precipitation_probability_max?.[idx] ?? 10;
      const maxTemp = Math.round(daily.temperature_2m_max?.[idx] ?? 25);
      const minTemp = Math.round(daily.temperature_2m_min?.[idx] ?? 16);
      return {
        day: idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : dayLabel,
        shortDay: dayLabel,
        maxTemp,
        minTemp,
        rain,
        prob
      };
    });

    const currentAirTemp = Math.round(current.temperature_2m || 24);
    const estSoilTemp = Math.max(10, Math.round(currentAirTemp * 0.84 + 1));

    return {
      currentTemp: currentAirTemp,
      soilTemp: estSoilTemp,
      humidity: Math.round(current.relative_humidity_2m || 60),
      todayRain: todayPrecip,
      tomorrowRain: tomorrowPrecip,
      totalUpcomingRain,
      maxProb: Math.max(maxProbToday, maxProbTomorrow),
      shouldSkipSprinklers,
      rainVerdict,
      forecastDays: sevenDays
    };
  },

  getFallbackWeather() {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const sevenDays = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(now);
      d.setDate(now.getDate() + idx);
      const dayLabel = idx === 0 ? 'Today' : idx === 1 ? 'Tmrw' : dayNames[d.getDay()];
      return {
        day: idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : dayLabel,
        shortDay: dayLabel,
        maxTemp: 25 + (idx % 3),
        minTemp: 17 + (idx % 2),
        rain: idx === 3 ? 6 : 0,
        prob: idx === 3 ? 70 : 15
      };
    });
    return {
      currentTemp: 24,
      soilTemp: 21,
      humidity: 58,
      todayRain: 0,
      tomorrowRain: 0,
      totalUpcomingRain: 0,
      maxProb: 15,
      shouldSkipSprinklers: false,
      rainVerdict: '☀️ Dry & clear — Great window to mow or spray.',
      forecastDays: sevenDays
    };
  }
};
