/**
 * @file Реализация обработки запроса на погоду
 * @author Vladimir Barinov <veselcraft@icloud.com>
 */

const xmlbuilder = require('xmlbuilder')
const config = require('../../../config')
const fs = require('node:fs/promises');

function convertCloudCode(code) {
  const baseCode = code.slice(0, 2);

  const codes = {
    '01': { agentCode: 1, description: "ясно" },
    '02': { agentCode: 2, description: "малооблачно" },
    '03': { agentCode: 4, description: "переменная облачность" },
    '04': { agentCode: 8, description: "пасмурно" },
    '09': { agentCode: 8, description: "пасмурно" },
    '10': { agentCode: 8, description: "пасмурно" },
    '13': { agentCode: 8, description: "пасмурно" },
    '11': { agentCode: 9, description: "неба не видно" },
    '50': { agentCode: 10, description: "полупрозрачная облачность" }
  }

  return codes[baseCode] || { agentCode: 0, description: "" }
}

function convertWeatherCode(code) {
  const codes = {
    200: { agentCode: 91, description: "слабый дождь, гроза" },
    201: { agentCode: 17, description: "гроза" },
    202: { agentCode: 92, description: "сильный дождь, гроза" },
    210: { agentCode: 17, description: "гроза" },
    211: { agentCode: 17, description: "гроза" },
    212: { agentCode: 97, description: "сильная гроза" },
    221: { agentCode: 17, description: "гроза" },
    230: { agentCode: 91, description: "слабый дождь, гроза" },
    231: { agentCode: 17, description: "гроза" },
    232: { agentCode: 92, description: "сильный дождь, гроза" },
    300: { agentCode: 51, description: "слабая морось" },
    301: { agentCode: 53, description: "морось" },
    302: { agentCode: 55, description: "сильная морось" },
    310: { agentCode: 58, description: "слабая морось с дождем" },
    311: { agentCode: 58, description: "слабая морось с дождем" },
    312: { agentCode: 59, description: "сильная морось с дождем" },
    313: { agentCode: 21, description: "дождь" },
    314: { agentCode: 59, description: "сильная морось с дождем" },
    321: { agentCode: 53, description: "морось" },
    500: { agentCode: 61, description: "слабый дождь" },
    501: { agentCode: 21, description: "дождь" },
    502: { agentCode: 65, description: "сильный дождь" },
    503: { agentCode: 65, description: "сильный дождь" },
    504: { agentCode: 65, description: "сильный дождь" },
    511: { agentCode: 79, description: "ледяной дождь" },
    520: { agentCode: 80, description: "слабый ливневый дождь" },
    521: { agentCode: 25, description: "ливневый дождь" },
    522: { agentCode: 81, description: "сильный ливневый дождь" },
    531: { agentCode: 25, description: "ливневый дождь" },
    600: { agentCode: 71, description: "слабый снег" },
    601: { agentCode: 22, description: "снег" },
    602: { agentCode: 75, description: "сильный снег" },
    611: { agentCode: 23, description: "дождь со снегом" },
    612: { agentCode: 83, description: "слабый ливневый дождь со снегом" },
    613: { agentCode: 26, description: "ливневый дождь со снегом" },
    615: { agentCode: 68, description: "слабый дождь со снегом" },
    616: { agentCode: 69, description: "сильный дождь со снегом" },
    620: { agentCode: 85, description: "слабый ливневый снег" },
    621: { agentCode: 86, description: "сильный ливневый снег" },
    622: { agentCode: 86, description: "сильный ливневый снег" },
    701: { agentCode: 10, description: "дымка" },
    711: { agentCode: 10, description: "дымка" },
    721: { agentCode: 5, description: "мгла" },
    731: { agentCode: 8, description: "пыльные вихри" },
    741: { agentCode: 11, description: "туман" },
    751: { agentCode: 7, description: "пыль поднятая ветром" },
    761: { agentCode: 6, description: "пыль в воздухе" },
    762: { agentCode: 6, description: "пыль в воздухе" },
    771: { agentCode: 18, description: "шквал" },
    781: { agentCode: 19, description: "смерчь" },
    800: { agentCode: 1, description: "ясно" },
    801: { agentCode: 2, description: "малооблачно" },
    802: { agentCode: 4, description: "переменная облачность" },
    803: { agentCode: 6, description: "облачно с прояснениями" },
    804: { agentCode: 8, description: "пасмурно" }
  };

  return codes[code] || { agentCode: 0, description: "" };
};

function convertWindDirection(direction) {
  if (direction === 0) {
    return { agentCode: 0, description: "шт." };
  }

  if (typeof direction !== 'number') {
    return { agentCode: 17, description: "перем." };
  }

  const sector = Math.round(direction / 22.5) % 16;

  const directions = [
    { agentCode: 1, description: "С" },
    { agentCode: 9, description: "С-СВ" },
    { agentCode: 5, description: "СВ" },
    { agentCode: 10, description: "В-СВ" },
    { agentCode: 2, description: "В" },
    { agentCode: 11, description: "В-ЮВ" },
    { agentCode: 6, description: "ЮВ" },
    { agentCode: 12, description: "Ю-ЮВ" },
    { agentCode: 3, description: "Ю" },
    { agentCode: 13, description: "Ю-ЮЗ" },
    { agentCode: 7, description: "ЮЗ" },
    { agentCode: 14, description: "З-ЮЗ" },
    { agentCode: 4, description: "З" },
    { agentCode: 15, description: "З-СЗ" },
    { agentCode: 8, description: "СЗ" },
    { agentCode: 16, description: "С-СЗ" }
  ];

  return directions[sector] || { agentCode: 0, description: "шт." };
}

function convertWeatherIcon(code) {
  const codes = {
    '01d': 7,
    '02d': 6,
    '03d': 5,
    '04d': 1,
    '09d': 4,
    '10d': 12,
    '11d': 8,
    '13d': 17,
    '50d': 24,
    '01n': 19,
    '02n': 18,
    '03n': 23,
    '04n': 16,
    '09n': 21,
    '10n': 22,
    '11n': 20,
    '13n': 17,
    '50n': 62,
  }

  return codes[code] ?? 1
}

async function getProperCityName (cityId) {
    const csvFile = await fs.readFile(`${__dirname}/../../../static/citylist_ru.csv`, 'utf16le')
    const csvArray = csvFile.split(/\r?\n/)
    const found = csvArray.find((line) => line.startsWith(`${cityId},`));
    return found.substring(`${cityId},`.length)
}

async function generateXMLResponse (cityId) {
    // check cache
    if (global.__weatherTmp[cityId] !== undefined && (global.__weatherTmp[cityId].lastUpd + (60*60*1000)) > Date.now()) {
        return global.__weatherTmp[cityId].xml
    }

    const convertedCityName = await getProperCityName(cityId) 

    const apiResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?` +
                `q=${convertedCityName ?? 'Москва,Россия'}` +  //default is moscow
                `&units=metric` +
                `&lang=ru` +
                `&appid=${config.obraz.openWeatherMapApiKey}`)

    const weatherResponse = await apiResponse.json()

    const wind = convertWindDirection(weatherResponse.wind.deg)
    const weatherCode = convertWeatherCode(weatherResponse.weather[0].id)
    const cloudCode = convertCloudCode(weatherResponse.weather[0].icon)
    const cityName = weatherResponse.name
    const currentDate = (new Date).toISOString().replace(/T/, ' ').replace(/\..+/, '')

    const root = xmlbuilder.create('weather', { version: '1.0', encoding: 'UTF-8' })
            .ele('forecast', { datetime: currentDate })
                .ele('period', { code: 0 }, 'сейчас').up()
                .ele('city', { code: cityId }, cityName).up()
                .ele('temperature').txt(
                    `${weatherResponse.main.temp > 0 ? '+' : ''}${Math.floor(weatherResponse.main.temp)}`
                ).up()
                .ele('humidity').txt(
                    `${weatherResponse.main.humidity}`
                ).up()
                .ele('pressure').txt(
                    `${Math.floor(weatherResponse.main.pressure * 0.75006)}`
                ).up()
                .ele('wind', {speed: Math.floor(weatherResponse.wind.speed), direction: wind.agentCode}).txt(
                    `${wind.description}`
                ).up()
                .ele('night', {sign: ''}).up()
                .ele('icon', {number: convertWeatherIcon(weatherResponse.weather[0].icon)}).txt('http://example.com/placeholder.gif').up()
                .ele('description', {forecast_code: '0', weather_code: weatherCode.agentCode, cloud_code: cloudCode.agentCode})
                    .txt(`${cloudCode.description}`).up()
                .ele('show_popup').txt('0').up()
            .up()
            .ele('forecast', { datetime: currentDate })
                .ele('period', { code: 3 }, 'днем').up()
                .ele('city', { code: cityId }, cityName).up()
                .ele('temperature').txt(
                    `${weatherResponse.main.temp > 0 ? '+' : ''}${Math.floor(weatherResponse.main.temp)}`
                ).up()
                .ele('humidity').txt(
                    `${weatherResponse.main.humidity}`
                ).up()
                .ele('pressure').txt(
                    `${Math.floor(weatherResponse.main.pressure * 0.75006)}`
                ).up()
                .ele('wind', {speed: Math.floor(weatherResponse.wind.speed), direction: wind.agentCode}).txt(
                    `${wind.description}`
                ).up()
                .ele('night', {sign: ''}).up()
                .ele('icon', {number: '18'}).txt('http://example.com/placeholder.gif').up()
                .ele('description', {forecast_code: '0', weather_code: weatherCode.agentCode, cloud_code: cloudCode.agentCode})
                    .txt(`${cloudCode.description}`).up()
                .ele('show_popup').txt('0').up()
            .up()
            .ele('forecast', { datetime: currentDate })
                .ele('period', { code: 7 }, 'завтра').up()
                .ele('city', { code: cityId }, cityName).up()
                .ele('temperature').txt(
                    `${weatherResponse.main.temp > 0 ? '+' : ''}${Math.floor(weatherResponse.main.temp)}`
                ).up()
                .ele('humidity').txt(
                    `${weatherResponse.main.humidity}`
                ).up()
                .ele('pressure').txt(
                    `${Math.floor(weatherResponse.main.pressure * 0.75006)}`
                ).up()
                .ele('wind', {speed: Math.floor(weatherResponse.wind.speed), direction: wind.agentCode}).txt(
                    `${wind.description}`
                ).up()
                .ele('night', {sign: ''}).up()
                .ele('icon', {number: '19'}).txt('http://pogoda.mail.ru/img/new/pict_weather_big_18.gif').up()
                .ele('description', {forecast_code: '0', weather_code: weatherCode.agentCode, cloud_code: cloudCode.agentCode})
                    .txt(`${cloudCode.description}`).up()
                .ele('show_popup').txt('0').up()
            .up()

    // convert the XML tree to string
    const xml = root.end({ prettyPrint: true });

    // serve it in cache
    global.__weatherTmp[cityId] = {lastUpd: Date.now(), xml}
    return xml;
}

module.exports = { generateXMLResponse }
