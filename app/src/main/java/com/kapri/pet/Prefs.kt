package com.kapri.pet

import android.content.Context
import android.content.SharedPreferences

/** Все настройки лежат в одном файле; сервис питомца слушает его изменения и применяет их на лету. */
object Prefs {
    private const val FILE = "kapri"

    const val ENABLED = "enabled"
    const val SIZE_DP = "size_dp"
    const val SPEED_PCT = "speed_pct"
    const val ALPHA_PCT = "alpha_pct"
    const val PLATFORMS = "platforms"
    const val QUIET_FULLSCREEN = "quiet_fullscreen"
    const val RANDOM_APPEAR = "random_appear"
    const val FREQUENCY = "frequency"
    const val SKIN_ON = "skin_on"
    const val SKIN_FPS = "skin_fps"
    const val SKIN_VERSION = "skin_version"

    const val SIZE_MIN = 40
    const val SIZE_MAX = 160
    const val SIZE_DEFAULT = 72
    const val SPEED_MIN = 50
    const val SPEED_MAX = 200
    const val SPEED_DEFAULT = 100
    const val ALPHA_MIN = 20
    const val ALPHA_MAX = 100
    const val ALPHA_DEFAULT = 90
    const val FREQ_MIN = 1
    const val FREQ_MAX = 10
    const val FREQ_DEFAULT = 6
    const val FPS_MIN = 1
    const val FPS_MAX = 30
    const val FPS_DEFAULT = 8

    fun of(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
