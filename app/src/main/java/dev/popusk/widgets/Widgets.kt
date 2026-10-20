package dev.popusk.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import kotlin.concurrent.thread

abstract class BaseWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        WidgetUpdater.updateAsync(this, ctx, forceWeather = false)
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, options: Bundle) {
        WidgetUpdater.render(ctx)
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == ACTION_REFRESH) {
            WidgetUpdater.updateAsync(this, ctx, forceWeather = true)
        } else {
            super.onReceive(ctx, intent)
        }
    }

    companion object {
        const val ACTION_REFRESH = "dev.popusk.widgets.REFRESH"
    }
}

class ClockWidget : BaseWidget()
class ActivityWidget : BaseWidget()
class WeatherWidget : BaseWidget()

object WidgetUpdater {
    private fun ids(ctx: Context, cls: Class<*>): IntArray =
        AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, cls))

    /** Перерисовать все виджеты из кэша — быстро, без сети и датчиков. */
    fun render(ctx: Context) {
        val mgr = AppWidgetManager.getInstance(ctx)
        ids(ctx, ClockWidget::class.java).forEach { mgr.updateAppWidget(it, WidgetViews.clock(ctx)) }
        ids(ctx, ActivityWidget::class.java).forEach { mgr.updateAppWidget(it, WidgetViews.activity(ctx)) }
        ids(ctx, WeatherWidget::class.java).forEach { mgr.updateAppWidget(it, WidgetViews.weather(ctx)) }
    }

    /** Обновить данные (датчик шагов, погода) и перерисовать. Блокирующий вызов. */
    fun refresh(ctx: Context, forceWeather: Boolean) {
        render(ctx)
        val needsWeather = ids(ctx, ClockWidget::class.java).isNotEmpty() ||
            ids(ctx, WeatherWidget::class.java).isNotEmpty()
        if (ids(ctx, ActivityWidget::class.java).isNotEmpty()) StepTracker.refresh(ctx)
        if (needsWeather) WeatherRepository.refresh(ctx, forceWeather)
        render(ctx)
    }

    fun updateAsync(receiver: AppWidgetProvider, ctx: Context, forceWeather: Boolean) {
        val pending = receiver.goAsync()
        val app = ctx.applicationContext
        thread {
            try {
                refresh(app, forceWeather)
            } finally {
                pending.finish()
            }
        }
    }
}
