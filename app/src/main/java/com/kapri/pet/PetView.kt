package com.kapri.pet

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

/** Окошко питомца: рисует либо встроенного духа, либо кадры своего скина. */
class PetView(context: Context, private val engine: PetEngine) : View(context) {

    private val renderer = SpiritRenderer()
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val dst = RectF()

    /** Кадры своего скина по названию анимации; пусто — рисуем встроенного духа. */
    var frames: Map<String, List<Bitmap>> = emptyMap()
    var skinFps = Prefs.FPS_DEFAULT

    /** Режим «не мешать»: питомец рисуется меньше. */
    var quiet = false

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    override fun onDraw(c: Canvas) {
        if (engine.state == PetEngine.State.HIDDEN) return
        val s = engine.size
        c.save()
        c.translate(s * PAD_SIDE, s * PAD_TOP)
        // Появляется и исчезает, как картинка на старом экране: схлопывается в полоску.
        val p = engine.presence
        if (p < 1f) c.scale(1f + (1f - p) * 0.7f, (p * p).coerceAtLeast(0.03f), s / 2f, s / 2f)
        if (quiet) c.scale(QUIET_SCALE, QUIET_SCALE, s / 2f, s)
        val list = pickFrames()
        if (list != null) {
            drawSkin(c, s, list)
        } else {
            renderer.draw(
                c, s, engine.state, engine.animTime, engine.facing,
                engine.wallSide, engine.onPlatform, engine.isReacting
            )
        }
        c.restore()
    }

    private fun pickFrames(): List<Bitmap>? {
        if (frames.isEmpty()) return null
        return frames[engine.animKey] ?: frames["walk"] ?: frames.values.first()
    }

    private fun drawSkin(c: Canvas, s: Float, list: List<Bitmap>) {
        val bmp = list[((engine.animTime * skinFps).toInt() % list.size + list.size) % list.size]
        if (bmp.width == 0 || bmp.height == 0) return
        val k = minOf(s / bmp.width, s / bmp.height)
        val w = bmp.width * k
        val h = bmp.height * k
        dst.set((s - w) / 2f, s - h, (s + w) / 2f, s)
        // Кадры нарисованы лицом вправо, «лезет» — у левой стены; в другую сторону отражаем.
        val mirror = if (engine.state == PetEngine.State.CLIMB) engine.wallSide > 0 else engine.facing < 0
        c.save()
        if (mirror) c.scale(-1f, 1f, s / 2f, s / 2f)
        c.drawBitmap(bmp, null, dst, bitmapPaint)
        c.restore()
    }

    companion object {
        // Запас вокруг квадрата питомца под свечение, антенну и свисающие ножки.
        const val PAD_SIDE = 0.25f
        const val PAD_TOP = 0.25f
        const val PAD_BOTTOM = 0.35f
        const val QUIET_SCALE = 0.6f

        fun windowWidth(size: Float) = (size * (1f + 2f * PAD_SIDE)).toInt()
        fun windowHeight(size: Float) = (size * (1f + PAD_TOP + PAD_BOTTOM)).toInt()
    }
}
