package dev.popusk.widgets

import android.content.Context

/** Все настройки и кэши приложения в одном месте. */
class Prefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("popusk", Context.MODE_PRIVATE)

    var theme: WidgetTheme
        get() = WidgetTheme.fromKey(sp.getString("theme", null))
        set(v) = sp.edit().putString("theme", v.key).apply()

    var style: WidgetStyle
        get() = WidgetStyle.fromKey(sp.getString("style", null))
        set(v) = sp.edit().putString("style", v.key).apply()

    var stepGoal: Int
        get() = sp.getInt("goal_steps", 8000)
        set(v) = sp.edit().putInt("goal_steps", v).apply()

    var calorieGoal: Int
        get() = sp.getInt("goal_calories", 400)
        set(v) = sp.edit().putInt("goal_calories", v).apply()

    var activeGoal: Int
        get() = sp.getInt("goal_active", 30)
        set(v) = sp.edit().putInt("goal_active", v).apply()

    // --- место ---
    var useGps: Boolean
        get() = sp.getBoolean("use_gps", true)
        set(v) = sp.edit().putBoolean("use_gps", v).apply()

    var cityName: String?
        get() = sp.getString("city", null)
        set(v) = sp.edit().putString("city", v).apply()

    val lat: Double? get() = sp.getString("lat", null)?.toDoubleOrNull()
    val lon: Double? get() = sp.getString("lon", null)?.toDoubleOrNull()

    fun setLocation(lat: Double, lon: Double) {
        sp.edit().putString("lat", lat.toString()).putString("lon", lon.toString()).apply()
    }

    // --- кэш погоды ---
    var weatherJson: String?
        get() = sp.getString("weather_json", null)
        set(v) = sp.edit().putString("weather_json", v).apply()

    var weatherTime: Long
        get() = sp.getLong("weather_time", 0L)
        set(v) = sp.edit().putLong("weather_time", v).apply()

    // --- шаги ---
    var stepDay: String?
        get() = sp.getString("step_day", null)
        set(v) = sp.edit().putString("step_day", v).apply()

    var stepsToday: Int
        get() = sp.getInt("steps_today", 0)
        set(v) = sp.edit().putInt("steps_today", v).apply()

    var activeMinutes: Int
        get() = sp.getInt("active_minutes", 0)
        set(v) = sp.edit().putInt("active_minutes", v).apply()

    var lastCounter: Float
        get() = sp.getFloat("last_counter", -1f)
        set(v) = sp.edit().putFloat("last_counter", v).apply()

    var lastReadingTime: Long
        get() = sp.getLong("last_reading", 0L)
        set(v) = sp.edit().putLong("last_reading", v).apply()
}
