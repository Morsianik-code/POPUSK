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
            else -> {
                v.setInt(R.id.root, "setBackgroundResource", s.background(t))
                v.setTextColor(R.id.w_city, t.secondary)
                v.setTextColor(R.id.w_temp, t.primary)
                v.setTextColor(R.id.w_desc, t.primary)
                v.setTextColor(R.id.w_range, t.secondary)
            }
        }

        v.setTextViewText(R.id.w_city, city)
        v.setTextViewText(R.id.w_icon, w?.emoji ?: "🌡️")
        v.setTextViewText(R.id.w_temp, w?.let { "${it.temp}°" } ?: "—°")
        v.setTextViewText(R.id.w_desc, w?.description ?: "Нет данных")
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
