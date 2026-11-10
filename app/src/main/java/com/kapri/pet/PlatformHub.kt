package com.kapri.pet

import android.graphics.Rect

/**
 * Мост между сервисом специальных возможностей и сервисом питомца.
 * Живёт только в памяти: список прямоугольников перезаписывается при каждом обновлении экрана.
 */
object PlatformHub {
    /** Питомец на экране и хочет платформы. Пока false, экран не читается вообще. */
    @Volatile
    var wanted = false
        set(value) {
            field = value
            if (value) requestScan?.invoke() else publish(emptyList())
        }

    @Volatile
    var platforms: List<Rect> = emptyList()
        private set

    @Volatile
    var version = 0
        private set

    /** Ставит сервис специальных возможностей, когда он подключён. */
    @Volatile
    var requestScan: (() -> Unit)? = null

    @Synchronized
    fun publish(list: List<Rect>) {
        if (list.isEmpty() && platforms.isEmpty()) return
        platforms = list
        version++
    }
}
