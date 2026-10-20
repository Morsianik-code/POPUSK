package dev.popusk.widgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.provider.AlarmClock
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.widget.RemoteViews
import java.util.Locale

/** Собирает RemoteViews для каждого виджета. Используется и лаунчером, и превью в приложении. */
object WidgetViews {

    private val IOS_RINGS = intArrayOf(0xFFFA114F.toInt(), 0xFF92E82A.toInt(), 0xFF00D7F6.toInt())

    // ---------------------------------------------------------------- часы

    fun clock(ctx: Context): RemoteViews {
        val p = Prefs(ctx)
        val t = p.theme
        val s = p.style
        val v = RemoteViews(ctx.packageName, s.clockLayout)
        v.setInt(R.id.root, "setBackgroundResource", s.background(t))
        v.setTextColor(R.id.clock_time, t.primary)
        v.setTextColor(R.id.clock_weather, t.primary)

        val w = WeatherRepository.cached(ctx)
        val sun = w?.sunState()
        val sunTime = if (w != null && sun != null) w.formatTime(sun.time) else "--:--"
        val sunLabel = if (sun?.isSunrise == false) "Закат" else "Восход"

        when (s) {
            WidgetStyle.ORIGIN -> {
                v.setTextColor(R.id.clock_date, t.primary)
                v.setTextColor(R.id.clock_sun_time, t.secondary)
                v.setTextColor(R.id.clock_sun_label, t.tertiary)
                v.setTextViewText(R.id.clock_weather, w?.let { "${it.temp}°C ${it.description}" } ?: "—°C")
                v.setTextViewText(R.id.clock_sun_time, sunTime)
                v.setTextViewText(R.id.clock_sun_label, if (sun?.isSunrise == false) "Закат" else "Восход солнца")
                v.setImageViewBitmap(R.id.clock_sun_arc, Renderers.sunArc(ctx, 150f, 64f, sun?.progress, t.arcTrack))
            }
            WidgetStyle.IOS -> {
                v.setTextColor(R.id.clock_desc, t.primary)
                v.setTextColor(R.id.clock_sun_time, t.secondary)
                v.setTextViewText(R.id.clock_icon, w?.emoji ?: "🌡️")
                v.setTextViewText(R.id.clock_weather, w?.let { "${it.temp}°" } ?: "—°")
                v.setTextViewText(R.id.clock_desc, w?.description ?: "Нет данных")
                v.setTextViewText(R.id.clock_sun_time, "$sunLabel $sunTime")
            }
            WidgetStyle.POPUSK -> {
                v.setTextColor(R.id.clock_date, t.secondary)
                v.setTextColor(R.id.clock_desc, t.secondary)
                v.setTextColor(R.id.clock_sun_time, t.secondary)
                v.setTextColor(R.id.clock_sun_label, t.secondary)
                v.setTextViewText(R.id.clock_icon, w?.emoji ?: "🌡️")
                v.setTextViewText(R.id.clock_weather, w?.let { "${it.temp}°" } ?: "—°")
                v.setTextViewText(R.id.clock_desc, w?.description ?: "Нет данных")
                val rise = w?.sunrises?.firstOrNull()
                val set = w?.sunsets?.firstOrNull()
                v.setTextViewText(R.id.clock_sun_time, if (w != null && rise != null) w.formatTime(rise) else "--:--")
                v.setTextViewText(R.id.clock_sun_label, if (w != null && set != null) w.formatTime(set) else "--:--")
                v.setImageViewBitmap(R.id.clock_sun_arc, Renderers.dayBar(ctx, 300f, 12f, sun?.progress, t.accent, t.arcTrack))
            }
            WidgetStyle.MONO -> {
                val ink = monoInk(t)
                val dim = withAlpha(ink, 0x80)
                v.setTextColor(R.id.clock_time, ink)
                v.setTextColor(R.id.clock_weather, ink)
                v.setTextColor(R.id.clock_desc, ink)
                v.setTextColor(R.id.clock_date, dim)
                v.setTextColor(R.id.clock_sun_time, dim)
                v.setInt(R.id.clock_hair, "setBackgroundColor", withAlpha(ink, 0x30))
                v.setTextViewText(R.id.clock_weather, w?.let { "${it.temp}°" } ?: "—°")
                v.setTextViewText(R.id.clock_desc, w?.description ?: "Нет данных")
                val rise = w?.sunrises?.firstOrNull()
                val set = w?.sunsets?.firstOrNull()
                v.setTextViewText(
                    R.id.clock_sun_time,
                    if (w != null && rise != null && set != null) "↑ ${w.formatTime(rise)}   ↓ ${w.formatTime(set)}" else "",
                )
                v.setImageViewBitmap(R.id.clock_sun_arc, monoRuler(ctx, w, 320f, 12f, ink, withAlpha(ink, 0x40)))
            }
            WidgetStyle.GOTHIC -> {
                val g = gothic(t)
                v.setTextColor(R.id.clock_time, g.ink)
                v.setTextColor(R.id.clock_date, g.gold)
                v.setTextColor(R.id.clock_weather, g.ink)
                v.setTextColor(R.id.clock_sun_time, g.ink)
                v.setTextColor(R.id.clock_sun_label, g.gold)
                v.setTextViewText(R.id.clock_weather, w?.let { "${it.temp}° · ${it.description}" } ?: "—°")
                v.setTextViewText(R.id.clock_sun_time, sunTime)
                v.setTextViewText(R.id.clock_sun_label, sunLabel.lowercase())
                v.setImageViewBitmap(R.id.clock_sun_arc, Renderers.pointedArch(ctx, 120f, 66f, sun?.progress, withAlpha(g.gold, 0x70), g.gold, g.blood))
            }
            WidgetStyle.FOG -> {
                val f = fog(t)
                v.setTextColor(R.id.clock_time, f.ink)
                v.setTextColor(R.id.clock_date, f.dim)
                v.setTextColor(R.id.clock_weather, f.dim)
                v.setTextColor(R.id.clock_sun_time, f.ink)
                v.setTextColor(R.id.clock_sun_label, f.dim)
                v.setTextViewText(R.id.clock_weather, w?.let { "† ${it.temp}° ${it.description.lowercase()}" } ?: "† —°")
                v.setTextViewText(R.id.clock_sun_time, sunTime)
                v.setTextViewText(R.id.clock_sun_label, sunLabel.lowercase())
                v.setImageViewBitmap(R.id.clock_sun_arc, Renderers.sunArc(ctx, 130f, 64f, sun?.progress, withAlpha(f.ink, 0x40), f.ink, crossMarker = true))
            }
        }

        v.setOnClickPendingIntent(R.id.clock_time, alarmsIntent(ctx))
        v.setOnClickPendingIntent(R.id.root, openAppIntent(ctx))
        return v
    }

    // ---------------------------------------------------------- активность

    fun activity(ctx: Context): RemoteViews {
        val p = Prefs(ctx)
        val t = p.theme
        val s = p.style
        val a = StepTracker.today(ctx)
        val v = RemoteViews(ctx.packageName, s.activityLayout)

        val progress = floatArrayOf(
            ratio(a.steps, p.stepGoal),
            ratio(a.calories, p.calorieGoal),
            ratio(a.activeMinutes, p.activeGoal),
        )
        val status = when {
            !StepTracker.isSupported(ctx) -> "Нет датчика шагов"
            !StepTracker.hasPermission(ctx) -> "Нажмите, чтобы разрешить шаги"
            else -> null
        }

        when (s) {
            WidgetStyle.ORIGIN -> {
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextViewText(R.id.act_steps, line("Шаги ${a.steps}", "${p.stepGoal} шаг.", t))
                v.setTextViewText(R.id.act_calories, line("Калории ${a.calories}", "${p.calorieGoal} ккал", t))
                v.setTextViewText(R.id.act_active, line("Тренировка ${a.activeMinutes}", "${p.activeGoal} мин", t))
                v.setTextViewText(R.id.act_chip, status ?: String.format(Locale.getDefault(), "Дистанция %.2f км", a.distanceKm))
                v.setTextColor(R.id.act_chip, t.secondary)
                v.setInt(R.id.act_chip, "setBackgroundResource", s.chip(t))
                v.setImageViewBitmap(R.id.act_rings, Renderers.rings(ctx, 120f, progress))
            }
            WidgetStyle.IOS -> {
                // Как «Фитнес» в iOS: всегда чёрная карточка, кольца красное/зелёное/голубое.
                v.setInt(R.id.root, "setBackgroundResource", if (t == WidgetTheme.GLASS) R.drawable.bg_ios_glass else R.drawable.bg_ios_black)
                v.setTextViewText(R.id.act_calories, "${a.calories}/${p.calorieGoal} ККАЛ")
                v.setTextViewText(R.id.act_active, "${a.activeMinutes}/${p.activeGoal} МИН")
                v.setTextViewText(R.id.act_steps, status ?: "${a.steps}/${p.stepGoal}")
                val iosProgress = floatArrayOf(progress[1], progress[2], progress[0])
                v.setImageViewBitmap(R.id.act_rings, Renderers.rings(ctx, 118f, iosProgress, IOS_RINGS))
            }
            WidgetStyle.POPUSK -> {
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextColor(R.id.act_big, t.primary)
                v.setTextColor(R.id.act_chip, t.secondary)
                v.setTextViewText(R.id.act_big, String.format(Locale.getDefault(), "%,d", a.steps).replace(',', ' '))
                v.setTextViewText(
                    R.id.act_chip,
                    status ?: String.format(Locale.getDefault(), "%.2f км · %d ккал", a.distanceKm, a.calories),
                )
                val rows = listOf(
                    Triple(R.id.act_steps, "Шаги", "${a.steps} / ${p.stepGoal}"),
                    Triple(R.id.act_calories, "Калории", "${a.calories} / ${p.calorieGoal}"),
                    Triple(R.id.act_active, "Тренировка", "${a.activeMinutes} / ${p.activeGoal} мин"),
                )
                val bars = intArrayOf(R.id.act_steps_bar, R.id.act_calories_bar, R.id.act_active_bar)
                val colors = intArrayOf(t.accent, Renderers.RING_COLORS[0], Renderers.RING_COLORS[2])
                rows.forEachIndexed { i, (id, label, value) ->
                    v.setTextViewText(id, line(label, value, t, flip = true))
                    v.setImageViewBitmap(bars[i], Renderers.bar(ctx, 140f, 5f, progress[i], colors[i], withAlpha(t.secondary, 0x40)))
                }
            }
            WidgetStyle.MONO -> {
                val ink = monoInk(t)
                val dim = withAlpha(ink, 0x80)
                val hair = withAlpha(ink, 0x30)
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                intArrayOf(R.id.act_hair1, R.id.act_hair2, R.id.act_hair3).forEach { v.setInt(it, "setBackgroundColor", hair) }
                val cols = listOf(
                    Triple(R.id.act_steps, a.steps, p.stepGoal),
                    Triple(R.id.act_calories, a.calories, p.calorieGoal),
                    Triple(R.id.act_active, a.activeMinutes, p.activeGoal),
                )
                val labels = intArrayOf(R.id.act_steps_label, R.id.act_calories_label, R.id.act_active_label)
                val goals = intArrayOf(R.id.act_steps_goal, R.id.act_calories_goal, R.id.act_active_goal)
                val bars = intArrayOf(R.id.act_steps_bar, R.id.act_calories_bar, R.id.act_active_bar)
                cols.forEachIndexed { i, (id, value, goal) ->
                    v.setTextColor(id, ink)
                    v.setTextColor(labels[i], dim)
                    v.setTextColor(goals[i], dim)
                    v.setTextViewText(id, value.toString())
                    v.setTextViewText(goals[i], "/ $goal")
                    v.setImageViewBitmap(bars[i], Renderers.dots(ctx, 80f, 5f, progress[i], ink, withAlpha(ink, 0x38)))
                }
                v.setTextColor(R.id.act_chip, dim)
                v.setTextViewText(
                    R.id.act_chip,
                    status ?: String.format(Locale.getDefault(), "%.2f км · обновлено %tR", a.distanceKm, System.currentTimeMillis()),
                )
            }
            WidgetStyle.GOTHIC -> {
                val g = gothic(t)
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextColor(R.id.act_big, g.ink)
                v.setTextViewText(R.id.act_big, a.steps.toString())
                listOf(
                    Triple(R.id.act_steps, "Шаги", "${a.steps} / ${p.stepGoal}"),
                    Triple(R.id.act_calories, "Калории", "${a.calories} / ${p.calorieGoal}"),
                    Triple(R.id.act_active, "Тренировка", "${a.activeMinutes} / ${p.activeGoal} мин"),
                ).forEach { (id, label, value) ->
                    v.setTextViewText(
                        id,
                        SpannableStringBuilder()
                            .append("† ", ForegroundColorSpan(g.blood), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            .append("$label ", ForegroundColorSpan(g.gold), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            .append(value, ForegroundColorSpan(g.ink), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE),
                    )
                }
                v.setTextColor(R.id.act_chip, g.gold)
                v.setTextViewText(R.id.act_chip, status ?: String.format(Locale.getDefault(), "%.2f км", a.distanceKm))
                v.setImageViewBitmap(
                    R.id.act_rings,
                    Renderers.roseRings(ctx, 116f, progress, intArrayOf(g.blood, g.gold, g.ink), withAlpha(g.ink, 0x22)),
                )
            }
            WidgetStyle.FOG -> {
                val f = fog(t)
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextColor(R.id.act_big, f.ink)
                v.setTextColor(R.id.act_chip, f.dim)
                v.setTextViewText(R.id.act_big, a.steps.toString())
                v.setTextViewText(
                    R.id.act_chip,
                    status ?: String.format(Locale.getDefault(), "%.2f км · %d ккал · %d мин", a.distanceKm, a.calories, a.activeMinutes),
                )
                val ids = intArrayOf(R.id.act_steps, R.id.act_calories, R.id.act_active)
                val bars = intArrayOf(R.id.act_steps_bar, R.id.act_calories_bar, R.id.act_active_bar)
                val values = intArrayOf(a.steps, a.calories, a.activeMinutes)
                for (i in 0..2) {
                    v.setTextColor(ids[i], f.dim)
                    v.setTextViewText(ids[i], values[i].toString())
                    v.setImageViewBitmap(bars[i], Renderers.crossBar(ctx, 30f, 78f, progress[i], f.ink, withAlpha(f.ink, 0x30)))
                }
            }
        }

        v.setOnClickPendingIntent(
            R.id.root,
            if (StepTracker.hasPermission(ctx)) refreshIntent(ctx, ActivityWidget::class.java) else openAppIntent(ctx),
        )
        return v
    }

    // -------------------------------------------------------------- погода

    fun weather(ctx: Context): RemoteViews {
        val p = Prefs(ctx)
        val t = p.theme
        val s = p.style
        val v = RemoteViews(ctx.packageName, s.weatherLayout)
        val w = WeatherRepository.cached(ctx)
        val city = p.cityName ?: if (p.lat == null) "Выберите город" else "Моё место"

        when (s) {
            WidgetStyle.IOS -> {
                // Как в iOS: синее небо днём, тёмно-синее ночью; текст всегда белый.
                v.setInt(
                    R.id.root, "setBackgroundResource",
                    when {
                        t == WidgetTheme.GLASS -> R.drawable.bg_ios_glass
                        w?.isDay == false -> R.drawable.bg_ios_weather_night
                        else -> R.drawable.bg_ios_weather_day
                    },
                )
            }
            WidgetStyle.MONO -> {
                val ink = monoInk(t)
                val dim = withAlpha(ink, 0x80)
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setInt(R.id.w_hair, "setBackgroundColor", withAlpha(ink, 0x30))
                v.setTextColor(R.id.w_city, dim)
                v.setTextColor(R.id.w_temp, ink)
                v.setTextColor(R.id.w_desc, ink)
                v.setTextColor(R.id.w_range, dim)
            }
            WidgetStyle.GOTHIC -> {
                val g = gothic(t)
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextColor(R.id.w_city, g.gold)
                v.setTextColor(R.id.w_temp, g.ink)
                v.setTextColor(R.id.w_desc, g.ink)
                v.setTextColor(R.id.w_range, g.dim)
                v.setTextColor(R.id.w_sun, g.gold)
            }
            WidgetStyle.FOG -> {
                val f = fog(t)
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextColor(R.id.w_city, f.dim)
                v.setTextColor(R.id.w_temp, f.ink)
                v.setTextColor(R.id.w_desc, f.ink)
                v.setTextColor(R.id.w_range, f.dim)
                v.setTextColor(R.id.w_sun, f.dim)
            }
            else -> {
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextColor(R.id.w_city, t.secondary)
                v.setTextColor(R.id.w_temp, t.primary)
                v.setTextColor(R.id.w_desc, t.primary)
                v.setTextColor(R.id.w_range, t.secondary)
            }
        }

        v.setTextViewText(
            R.id.w_city,
            when (s) {
                WidgetStyle.GOTHIC -> "✠ $city"
                WidgetStyle.FOG -> "† ${city.lowercase()}"
                else -> city
            },
        )
        if (s in setOf(WidgetStyle.ORIGIN, WidgetStyle.IOS, WidgetStyle.POPUSK)) v.setTextViewText(R.id.w_icon, w?.emoji ?: "🌡️")
        v.setTextViewText(R.id.w_temp, w?.let { "${it.temp}°" } ?: "—°")
        v.setTextViewText(R.id.w_desc, (w?.description ?: "Нет данных").let { if (s == WidgetStyle.FOG) it.lowercase() else it })
        v.setTextViewText(
            R.id.w_range,
            when {
                w == null -> ""
                s == WidgetStyle.IOS -> "Макс.: ${w.max}°, мин.: ${w.min}°"
                else -> "↑${w.max}°  ↓${w.min}°"
            },
        )

        val rise = w?.sunrises?.firstOrNull()
        val set = w?.sunsets?.firstOrNull()
        when (s) {
            WidgetStyle.ORIGIN -> {
                v.setTextColor(R.id.w_sun, t.secondary)
                v.setTextViewText(
                    R.id.w_sun,
                    if (w != null && rise != null && set != null) "☀ ${w.formatTime(rise)} – ${w.formatTime(set)}" else "",
                )
            }
            WidgetStyle.POPUSK -> {
                v.setImageViewBitmap(R.id.w_daybar, Renderers.dayBar(ctx, 200f, 12f, w?.sunState()?.progress, t.accent, t.arcTrack))
            }
            WidgetStyle.MONO -> {
                val ink = monoInk(t)
                v.setImageViewBitmap(R.id.w_daybar, monoRuler(ctx, w, 200f, 12f, ink, withAlpha(ink, 0x40)))
            }
            WidgetStyle.GOTHIC, WidgetStyle.FOG -> {
                v.setTextViewText(
                    R.id.w_sun,
                    if (w != null && rise != null && set != null) "† ${w.formatTime(rise)} — ${w.formatTime(set)}" else "",
                )
            }
            WidgetStyle.IOS -> Unit
        }

        v.setOnClickPendingIntent(R.id.root, refreshIntent(ctx, WeatherWidget::class.java))
        return v
    }

    // ------------------------------------------------------------ helpers

    private fun ratio(value: Int, goal: Int) = if (goal <= 0) 0f else value.toFloat() / goal

    /** «main / goal»; flip = true — «main      goal» без разделителя (подпись слева, значение справа). */
    private fun line(main: String, goal: String, t: WidgetTheme, flip: Boolean = false): CharSequence =
        SpannableStringBuilder()
            .append(main, ForegroundColorSpan(if (flip) t.secondary else t.primary), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            .append(
                if (flip) "   $goal" else " / $goal",
                ForegroundColorSpan(if (flip) t.primary else t.secondary),
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )

    private class Gothic(val ink: Int, val gold: Int, val blood: Int, val dim: Int)
    private fun gothic(t: WidgetTheme) = if (t == WidgetTheme.LIGHT) {
        Gothic(0xFF2A1F22.toInt(), 0xFF8E6F22.toInt(), 0xFF8B1E2B.toInt(), 0xFF7A6E62.toInt())
    } else {
        Gothic(0xFFE8E0D0.toInt(), 0xFFB8963E.toInt(), 0xFFB3283A.toInt(), 0xFF9A8F80.toInt())
    }

    private class Fog(val ink: Int, val dim: Int)
    private fun fog(t: WidgetTheme) = if (t == WidgetTheme.LIGHT) {
        Fog(0xFF2E3236.toInt(), 0xFF6A7076.toInt())
    } else {
        Fog(0xFFE3E5E8.toInt(), 0xFFC4C8CC.toInt())
    }

    private fun monoInk(t: WidgetTheme) = if (t == WidgetTheme.LIGHT) 0xFF111111.toInt() else 0xFFFFFFFF.toInt()

    /** Линейка суток для стиля Mono: «сейчас» и светлое время — в часовом поясе места. */
    private fun monoRuler(ctx: Context, w: Weather?, widthDp: Float, heightDp: Float, ink: Int, dim: Int): android.graphics.Bitmap {
        val zone = w?.zone ?: java.time.ZoneId.systemDefault()
        val now = java.time.ZonedDateTime.now(zone)
        fun frac(millis: Long?): Float? = millis?.let {
            val t = java.time.Instant.ofEpochMilli(it).atZone(zone)
            (t.hour * 60 + t.minute) / 1440f
        }
        val nowF = (now.hour * 60 + now.minute) / 1440f
        return Renderers.ruler(ctx, widthDp, heightDp, nowF, frac(w?.sunrises?.firstOrNull()), frac(w?.sunsets?.firstOrNull()), ink, dim)
    }

    private fun withAlpha(color: Int, alpha: Int) =
        Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))

    private fun openAppIntent(ctx: Context): PendingIntent = PendingIntent.getActivity(
        ctx, 0,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun alarmsIntent(ctx: Context): PendingIntent = PendingIntent.getActivity(
        ctx, 1,
        Intent(AlarmClock.ACTION_SHOW_ALARMS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun refreshIntent(ctx: Context, cls: Class<*>): PendingIntent = PendingIntent.getBroadcast(
        ctx, cls.name.hashCode(),
        Intent(ctx, cls).setAction(BaseWidget.ACTION_REFRESH),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
