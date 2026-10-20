package dev.popusk.widgets

import android.content.Context
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

data class Weather(
    val temp: Int,
    val code: Int,
    val isDay: Boolean,
    val max: Int,
    val min: Int,
    val sunrises: List<Long>,
    val sunsets: List<Long>,
    val zone: ZoneId,
) {
    val description: String get() = WeatherRepository.describe(code, isDay)
    val emoji: String get() = WeatherRepository.emoji(code, isDay)

    fun formatTime(millis: Long): String =
        DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.ofEpochMilli(millis))

    /** Что показывать на дуге: следующий восход или закат, и положение солнца (null — ночь). */
    fun sunState(now: Long = System.currentTimeMillis()): SunState? {
        val rise = sunrises.firstOrNull() ?: return null
        val set = sunsets.firstOrNull() ?: return null
        return when {
            now < rise -> SunState(rise, isSunrise = true, progress = null)
            now < set -> SunState(set, isSunrise = false, progress = (now - rise).toFloat() / (set - rise))
            else -> sunrises.getOrNull(1)?.let { SunState(it, isSunrise = true, progress = null) }
        }
    }
}

data class SunState(val time: Long, val isSunrise: Boolean, val progress: Float?)

data class Place(val name: String, val lat: Double, val lon: Double)

/** Погода и восход/закат с open-meteo.com — бесплатно и без ключа. */
object WeatherRepository {
    private const val TTL = 30 * 60 * 1000L

    fun cached(ctx: Context): Weather? =
        Prefs(ctx).weatherJson?.let { runCatching { parse(it) }.getOrNull() }

    /** Блокирующий вызов — только из фонового потока. */
    fun refresh(ctx: Context, force: Boolean = false): Weather? {
        val p = Prefs(ctx)
        var mustFetch = force
        if (p.useGps) {
            LocationHelper.lastKnown(ctx)?.let { loc ->
                val oldLat = p.lat
                val oldLon = p.lon
                if (oldLat == null || oldLon == null ||
                    abs(oldLat - loc.latitude) > 0.05 || abs(oldLon - loc.longitude) > 0.05
                ) {
                    p.setLocation(loc.latitude, loc.longitude)
                    LocationHelper.cityName(ctx, loc.latitude, loc.longitude)?.let { p.cityName = it }
                    mustFetch = true
                }
            }
        }
        val lat = p.lat ?: return cached(ctx)
        val lon = p.lon ?: return cached(ctx)
        val fresh = System.currentTimeMillis() - p.weatherTime < TTL
        if (!mustFetch && fresh && p.weatherJson != null) return cached(ctx)

        val url = String.format(
            Locale.US,
            "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f" +
                "&current=temperature_2m,weather_code,is_day" +
                "&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min" +
                "&timezone=auto&forecast_days=2",
            lat, lon,
        )
        return try {
            val body = Http.get(url)
            val weather = parse(body)
            p.weatherJson = body
            p.weatherTime = System.currentTimeMillis()
            weather
        } catch (e: Exception) {
            cached(ctx)
        }
    }

    /** Поиск города по названию. Блокирующий вызов. */
    fun searchCity(name: String): Place? {
        val url = "https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=" +
            Locale.getDefault().language + "&name=" + URLEncoder.encode(name, "UTF-8")
        val results = JSONObject(Http.get(url)).optJSONArray("results") ?: return null
        if (results.length() == 0) return null
        val r = results.getJSONObject(0)
        return Place(r.getString("name"), r.getDouble("latitude"), r.getDouble("longitude"))
    }

    fun parse(json: String): Weather {
        val o = JSONObject(json)
        val zone = runCatching { ZoneId.of(o.getString("timezone")) }.getOrDefault(ZoneId.systemDefault())
        val current = o.getJSONObject("current")
        val daily = o.getJSONObject("daily")
        fun times(key: String): List<Long> {
            val a = daily.getJSONArray(key)
            return (0 until a.length()).map {
                LocalDateTime.parse(a.getString(it)).atZone(zone).toInstant().toEpochMilli()
            }
        }
        return Weather(
            temp = current.getDouble("temperature_2m").roundToInt(),
            code = current.getInt("weather_code"),
            isDay = current.optInt("is_day", 1) == 1,
            max = daily.getJSONArray("temperature_2m_max").getDouble(0).roundToInt(),
            min = daily.getJSONArray("temperature_2m_min").getDouble(0).roundToInt(),
            sunrises = times("sunrise"),
            sunsets = times("sunset"),
            zone = zone,
        )
    }

    fun describe(code: Int, isDay: Boolean): String = when (code) {
        0 -> if (isDay) "Солнечно" else "Ясно"
        1 -> "Малооблачно"
        2 -> "Переменная облачность"
        3 -> "Пасмурно"
        45, 48 -> "Туман"
        51, 53, 55 -> "Морось"
        56, 57 -> "Ледяная морось"
        61 -> "Небольшой дождь"
        63 -> "Дождь"
        65 -> "Сильный дождь"
        66, 67 -> "Ледяной дождь"
        71 -> "Небольшой снег"
        73 -> "Снег"
        75 -> "Сильный снег"
        77 -> "Снежная крупа"
        80, 81, 82 -> "Ливень"
        85, 86 -> "Снегопад"
        95 -> "Гроза"
        96, 99 -> "Гроза с градом"
        else -> "—"
    }

    fun emoji(code: Int, isDay: Boolean): String = when (code) {
        0 -> if (isDay) "☀️" else "🌙"
        1, 2 -> if (isDay) "⛅" else "☁️"
        3 -> "☁️"
        45, 48 -> "🌫️"
        51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> "🌧️"
        71, 73, 75, 77, 85, 86 -> "❄️"
        95, 96, 99 -> "⛈️"
        else -> "🌡️"
    }
}
