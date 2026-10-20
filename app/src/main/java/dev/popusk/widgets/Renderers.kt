package dev.popusk.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Рисует то, чего нет в RemoteViews: кольца активности и дугу солнца. */
object Renderers {
    val RING_COLORS = intArrayOf(0xFF4D8BF5.toInt(), 0xFFF5A245.toInt(), 0xFF5CC779.toInt())

    private fun dp(ctx: Context, v: Float) = v * ctx.resources.displayMetrics.density

    /** Концентрические кольца: [0] — внешнее. */
    fun rings(ctx: Context, sizeDp: Float, progress: FloatArray, colors: IntArray = RING_COLORS): Bitmap {
        val size = dp(ctx, sizeDp).toInt()
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val stroke = size * 0.095f
        val gap = stroke * 0.32f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = stroke
            strokeCap = Paint.Cap.ROUND
        }
        val center = size / 2f
        progress.forEachIndexed { i, p ->
            val color = colors[i % colors.size]
            val r = center - stroke / 2f - i * (stroke + gap)
            val rect = RectF(center - r, center - r, center + r, center + r)
            paint.color = withAlpha(color, 0x45)
            c.drawCircle(center, center, r, paint)
            val sweep = 360f * p.coerceIn(0f, 1f)
            if (sweep > 0f) {
                paint.color = color
                c.drawArc(rect, -90f, sweep, false, paint)
            }
        }
        return bmp
    }

    /** Дуга над подписью восхода/заката. progress = null — солнце за горизонтом. */
    fun sunArc(ctx: Context, widthDp: Float, heightDp: Float, progress: Float?, track: Int): Bitmap {
        val w = dp(ctx, widthDp)
        val h = dp(ctx, heightDp)
        val bmp = Bitmap.createBitmap(w.toInt(), h.toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val stroke = h * 0.1f
        val startAngle = 200f
        val sweepAngle = 140f
        val r = min((h - stroke) / 0.66f, (w / 2f - stroke) / 0.94f)
        val cx = w / 2f
        val cy = stroke / 2f + r
        val rect = RectF(cx - r, cy - r, cx + r, cy + r)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = stroke
            strokeCap = Paint.Cap.ROUND
            color = track
        }
        c.drawArc(rect, startAngle, sweepAngle, false, paint)

        if (progress != null) {
            val p = progress.coerceIn(0f, 1f)
            paint.color = 0xFFF5A245.toInt()
            c.drawArc(rect, startAngle, sweepAngle * p, false, paint)
            val a = Math.toRadians((startAngle + sweepAngle * p).toDouble())
            val sx = cx + r * cos(a).toFloat()
            val sy = cy + r * sin(a).toFloat()
            val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
            c.drawCircle(sx, sy, stroke * 0.95f, fill)
            fill.color = 0xFFF5A245.toInt()
            c.drawCircle(sx, sy, stroke * 0.6f, fill)
        }
        return bmp
    }

    /** Горизонтальная полоска прогресса со скруглёнными концами. */
    fun bar(ctx: Context, widthDp: Float, heightDp: Float, progress: Float, color: Int, track: Int): Bitmap {
        val w = dp(ctx, widthDp)
        val h = dp(ctx, heightDp)
        val bmp = Bitmap.createBitmap(w.toInt(), h.toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = track }
        c.drawRoundRect(RectF(0f, 0f, w, h), h / 2f, h / 2f, paint)
        val p = progress.coerceIn(0f, 1f)
        if (p > 0f) {
            paint.color = color
            c.drawRoundRect(RectF(0f, 0f, (w * p).coerceAtLeast(h), h), h / 2f, h / 2f, paint)
        }
        return bmp
    }

    /** «Линия дня»: от восхода до заката, с маркером солнца. progress = null — ночь. */
    fun dayBar(ctx: Context, widthDp: Float, heightDp: Float, progress: Float?, accent: Int, track: Int): Bitmap {
        val w = dp(ctx, widthDp)
        val h = dp(ctx, heightDp)
        val bmp = Bitmap.createBitmap(w.toInt(), h.toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val lineH = h * 0.28f
        val cy = h / 2f
        val r = h / 2f
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = track }
        c.drawRoundRect(RectF(r, cy - lineH / 2f, w - r, cy + lineH / 2f), lineH, lineH, paint)
        if (progress != null) {
            val p = progress.coerceIn(0f, 1f)
            val x = r + (w - 2 * r) * p
            paint.color = accent
            c.drawRoundRect(RectF(r, cy - lineH / 2f, x.coerceAtLeast(r + lineH), cy + lineH / 2f), lineH, lineH, paint)
            paint.color = Color.WHITE
            c.drawCircle(x, cy, r, paint)
            paint.color = accent
            c.drawCircle(x, cy, r * 0.62f, paint)
        }
        return bmp
    }

    /** Линейка суток: 24 штриха, до «сейчас» — яркие, после — тусклые; светлое время выше. */
    fun ruler(ctx: Context, widthDp: Float, heightDp: Float, now: Float, rise: Float?, set: Float?, ink: Int, dim: Int): Bitmap {
        val w = dp(ctx, widthDp)
        val h = dp(ctx, heightDp)
        val bmp = Bitmap.createBitmap(w.toInt(), h.toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = dp(ctx, 1f); strokeCap = Paint.Cap.ROUND }
        val n = 48
        val inset = dp(ctx, 1f)
        for (i in 0..n) {
            val f = i.toFloat() / n
            val x = inset + (w - 2 * inset) * f
            val daylight = rise != null && set != null && f >= rise && f <= set
            val major = i % 12 == 0
            val len = when {
                major -> h
                daylight -> h * 0.62f
                else -> h * 0.35f
            }
            paint.color = if (f <= now) ink else dim
            c.drawLine(x, h, x, h - len, paint)
        }
        // маркер «сейчас»
        val x = inset + (w - 2 * inset) * now.coerceIn(0f, 1f)
        paint.color = ink
        paint.strokeWidth = dp(ctx, 2f)
        c.drawLine(x, h, x, 0f, paint)
        return bmp
    }

    /** Шкала из точек: заполненные — выполненная часть. */
    fun dots(ctx: Context, widthDp: Float, heightDp: Float, progress: Float, ink: Int, dim: Int, count: Int = 10): Bitmap {
        val w = dp(ctx, widthDp)
        val h = dp(ctx, heightDp)
        val bmp = Bitmap.createBitmap(w.toInt(), h.toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val r = h / 2f
        val step = (w - h) / (count - 1)
        val filled = Math.round(progress.coerceIn(0f, 1f) * count)
        for (i in 0 until count) {
            paint.color = if (i < filled) ink else dim
            c.drawCircle(r + step * i, r, r, paint)
        }
        return bmp
    }

    private fun withAlpha(color: Int, alpha: Int) =
        Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))
}
