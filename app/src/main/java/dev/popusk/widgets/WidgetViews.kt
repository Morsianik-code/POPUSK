package dev.popusk.widgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.widget.RemoteViews
import java.util.Locale

/** Собирает RemoteViews для каждого виджета. Используется и лаунчером, и превью в приложении. */
object WidgetViews {

    fun clock(ctx: Context): RemoteViews {
        val t = Prefs(ctx).theme
        val v = RemoteViews(ctx.packageName, R.layout.widget_clock)
        v.setInt(R.id.root, "setBackgroundResource", t.background)
        v.setTextColor(R.id.clock_time, t.primary)
        v.setTextColor(R.id.clock_date, t.primary)
        v.setTextColor(R.id.clock_weather, t.primary)
        v.setTextColor(R.id.clock_sun_time, t.secondary)
        v.setTextColor(R.id.clock_sun_label, t.tertiary)

        val w = WeatherRepository.cached(ctx)
        v.setTextViewText(R.id.clock_weather, w?.let { "${it.temp}°C ${it.description}" } ?: "—°C")

        val sun = w?.sunState()
        v.setTextViewText(R.id.clock_sun_time, if (w != null && sun != null) w.formatTime(sun.time) else "--:--")
        v.setTextViewText(R.id.clock_sun_label, if (sun?.isSunrise == false) "Закат" else "Восход солнца")
        v.setImageViewBitmap(R.id.clock_sun_arc, Renderers.sunArc(ctx, 150f, 64f, sun?.progress, t.arcTrack))

        v.setOnClickPendingIntent(R.id.clock_time, alarmsIntent(ctx))
        v.setOnClickPendingIntent(R.id.root, openAppIntent(ctx))
        return v
    }

    fun activity(ctx: Context): RemoteViews {
        val p = Prefs(ctx)
        val t = p.theme
        val a = StepTracker.today(ctx)
        val v = RemoteViews(ctx.packageName, R.layout.widget_activity)
        v.setInt(R.id.root, "setBackgroundResource", t.background)

        v.setTextViewText(R.id.act_steps, line("Шаги ${a.steps}", "${p.stepGoal} шаг.", t))
        v.setTextViewText(R.id.act_calories, line("Калории ${a.calories}", "${p.calorieGoal} ккал", t))
        v.setTextViewText(R.id.act_active, line("Тренировка ${a.activeMinutes}", "${p.activeGoal} мин", t))

        val chip = when {
            !StepTracker.isSupported(ctx) -> "Нет датчика шагов"
            !StepTracker.hasPermission(ctx) -> "Нажмите, чтобы разрешить шаги"
            else -> String.format(Locale.getDefault(), "Дистанция %.2f км", a.distanceKm)
        }
        v.setTextViewText(R.id.act_chip, chip)
        v.setTextColor(R.id.act_chip, t.secondary)
        v.setInt(R.id.act_chip, "setBackgroundResource", t.chip)

        val progress = floatArrayOf(
            ratio(a.steps, p.stepGoal),
            ratio(a.calories, p.calorieGoal),
            ratio(a.activeMinutes, p.activeGoal),
        )
        v.setImageViewBitmap(R.id.act_rings, Renderers.rings(ctx, 120f, progress))

        v.setOnClickPendingIntent(
            R.id.root,
            if (StepTracker.hasPermission(ctx)) refreshIntent(ctx, ActivityWidget::class.java) else openAppIntent(ctx),
        )
        return v
    }

    fun weather(ctx: Context): RemoteViews {
        val p = Prefs(ctx)
        val t = p.theme
        val v = RemoteViews(ctx.packageName, R.layout.widget_weather)
        v.setInt(R.id.root, "setBackgroundResource", t.background)
        v.setTextColor(R.id.w_city, t.secondary)
        v.setTextColor(R.id.w_temp, t.primary)
        v.setTextColor(R.id.w_desc, t.primary)
        v.setTextColor(R.id.w_range, t.secondary)
        v.setTextColor(R.id.w_sun, t.secondary)

        val w = WeatherRepository.cached(ctx)
        v.setTextViewText(R.id.w_city, p.cityName ?: if (p.lat == null) "Выберите город" else "Моё место")
        if (w == null) {
            v.setTextViewText(R.id.w_icon, "🌡️")
            v.setTextViewText(R.id.w_temp, "—°")
            v.setTextViewText(R.id.w_desc, "Нет данных")
            v.setTextViewText(R.id.w_range, "")
            v.setTextViewText(R.id.w_sun, "")
        } else {
            v.setTextViewText(R.id.w_icon, w.emoji)
            v.setTextViewText(R.id.w_temp, "${w.temp}°")
            v.setTextViewText(R.id.w_desc, w.description)
            v.setTextViewText(R.id.w_range, "↑${w.max}°  ↓${w.min}°")
            val rise = w.sunrises.firstOrNull()
            val set = w.sunsets.firstOrNull()
            v.setTextViewText(
                R.id.w_sun,
                if (rise != null && set != null) "☀ ${w.formatTime(rise)} – ${w.formatTime(set)}" else "",
            )
        }
        v.setOnClickPendingIntent(R.id.root, refreshIntent(ctx, WeatherWidget::class.java))
        return v
    }

    private fun ratio(value: Int, goal: Int) = if (goal <= 0) 0f else value.toFloat() / goal

    private fun line(main: String, goal: String, t: WidgetTheme): CharSequence =
        SpannableStringBuilder()
            .append(main, ForegroundColorSpan(t.primary), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            .append(" / $goal", ForegroundColorSpan(t.secondary), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)

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
