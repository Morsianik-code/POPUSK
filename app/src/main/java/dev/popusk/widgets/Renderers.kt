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
    fun rings(ctx: Context, sizeDp: Float, progress: FloatArray): Bitmap {
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
            val color = RING_COLORS[i % RING_COLORS.size]
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

    private fun withAlpha(color: Int, alpha: Int) =
        Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))
}
