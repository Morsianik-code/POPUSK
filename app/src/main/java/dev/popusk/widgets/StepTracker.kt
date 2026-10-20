package dev.popusk.widgets

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import java.time.LocalDate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

data class DayActivity(
    val steps: Int,
    val calories: Int,
    val activeMinutes: Int,
    val distanceKm: Double,
)

/**
 * Шаги считаются по аппаратному датчику TYPE_STEP_COUNTER (счётчик с момента загрузки).
 * При каждом обновлении виджета берём разницу с прошлым значением и копим её за текущий день.
 */
object StepTracker {
    private const val KCAL_PER_STEP = 0.04
    private const val KM_PER_STEP = 0.00075
    private const val STEPS_PER_ACTIVE_MINUTE = 100
    private const val MIN_WALK_STEPS = 400

    fun hasPermission(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ctx.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

    fun isSupported(ctx: Context): Boolean =
        ctx.getSystemService(SensorManager::class.java)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

    /** Блокирующее чтение датчика — только из фонового потока. */
    fun refresh(ctx: Context) {
        if (!hasPermission(ctx)) return
        readCounter(ctx)?.let { record(Prefs(ctx), it) }
    }

    fun today(ctx: Context): DayActivity {
        val p = Prefs(ctx)
        val sameDay = p.stepDay == LocalDate.now().toString()
        val steps = if (sameDay) p.stepsToday else 0
        val active = if (sameDay) p.activeMinutes else 0
        return DayActivity(
            steps = steps,
            calories = (steps * KCAL_PER_STEP).toInt(),
            activeMinutes = active,
            distanceKm = steps * KM_PER_STEP,
        )
    }

    private fun readCounter(ctx: Context, timeoutMs: Long = 2500): Float? {
        val sm = ctx.getSystemService(SensorManager::class.java) ?: return null
        val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return null
        val latch = CountDownLatch(1)
        var value: Float? = null
        val thread = HandlerThread("steps").apply { start() }
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                value = event.values[0]
                latch.countDown()
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        try {
            sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, Handler(thread.looper))
            latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        } finally {
            sm.unregisterListener(listener)
            thread.quitSafely()
        }
        return value
    }

    @Synchronized
    private fun record(p: Prefs, counter: Float) {
        val today = LocalDate.now().toString()
        if (p.stepDay != today) {
            p.stepDay = today
            p.stepsToday = 0
            p.activeMinutes = 0
        }
        val last = p.lastCounter
        if (last >= 0f) {
            // Счётчик меньше прошлого — телефон перезагружали, считаем с нуля.
            val delta = (if (counter >= last) counter - last else counter).toInt()
            p.stepsToday += delta
            if (delta >= MIN_WALK_STEPS) p.activeMinutes += delta / STEPS_PER_ACTIVE_MINUTE
        }
        p.lastCounter = counter
        p.lastReadingTime = System.currentTimeMillis()
    }
}
