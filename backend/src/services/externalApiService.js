const axios = require('axios');
const ExternalData = require('../models/ExternalData');

const WEATHER_KEY = process.env.OPENWEATHER_API_KEY;
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;

/**
 * Fetch weather data from OpenWeatherMap.
 * Falls back to last stored record if API fails.
 */
async function fetchWeather(location = 'New York') {
  try {
    if (!WEATHER_KEY) throw new Error('No API key');
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${WEATHER_KEY}&units=metric`;
    const { data } = await axios.get(url, { timeout: 5000 });

    const record = await ExternalData.create({
      type: 'weather',
      location,
      temperature: data.main.temp,
      weatherCondition: data.weather[0].main,
      humidity: data.main.humidity,
      rawData: data
    });
    return record;
  } catch (err) {
    console.warn('Weather API failed, using cached data:', err.message);
    const cached = await ExternalData.findOne({ type: 'weather' }).sort({ timestamp: -1 });
    if (cached) return { ...cached.toObject(), fromCache: true };
    // Absolute fallback — neutral weather
    return { temperature: 20, weatherCondition: 'Clear', humidity: 50, fromCache: true, synthetic: true };
  }
}

/**
 * Fetch market trend from Alpha Vantage (retail sentiment proxy).
 * Falls back gracefully.
 */
async function fetchMarketTrend(symbol = 'XRT') {
  try {
    if (!AV_KEY) throw new Error('No API key');
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_KEY}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) throw new Error('Invalid AV response');

    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['10. change percent']?.replace('%', '') || 0);
    // Normalize to 0-100 trend score
    const trendScore = Math.min(100, Math.max(0, 50 + change * 5));

    const record = await ExternalData.create({
      type: 'market_trend',
      symbol,
      trendScore,
      rawData: quote
    });
    return record;
  } catch (err) {
    console.warn('Market API failed, using cached data:', err.message);
    const cached = await ExternalData.findOne({ type: 'market_trend' }).sort({ timestamp: -1 });
    if (cached) return { ...cached.toObject(), fromCache: true };
    return { trendScore: 50, fromCache: true, synthetic: true };
  }
}

module.exports = { fetchWeather, fetchMarketTrend };
