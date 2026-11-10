package com.kapri.pet

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Встроенный персонаж — маленький неоновый кибер-дух. Целиком рисуется кодом:
 * полупрозрачный корпус со срезанным углом, тёмный визор с пиксельными глазами,
 * антенна, тонкие ножки, бегущие строки развёртки и редкий глитч.
 *
 * Начало координат холста — левый верхний угол квадрата питомца со стороной s.
 */
class SpiritRenderer {

    private val body = Path()
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val solid = Paint(Paint.ANTI_ALIAS_FLAG)
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.MONOSPACE
        color = CYAN
    }

    private var builtFor = 0f
    private var glitchEnd = 0f
    private var glitchNext = 2.5f
    private var glitchSeed = 0L

    private fun build(s: Float) {
        if (builtFor == s) return
        builtFor = s
        body.reset()
        body.moveTo(0.30f * s, 0.08f * s)
        body.lineTo(0.62f * s, 0.08f * s)
        body.lineTo(0.82f * s, 0.24f * s)
        body.lineTo(0.82f * s, 0.56f * s)
        body.quadTo(0.82f * s, 0.72f * s, 0.66f * s, 0.72f * s)
        body.lineTo(0.34f * s, 0.72f * s)
        body.quadTo(0.18f * s, 0.72f * s, 0.18f * s, 0.56f * s)
        body.lineTo(0.18f * s, 0.22f * s)
        body.quadTo(0.18f * s, 0.08f * s, 0.30f * s, 0.08f * s)
        body.close()
        fill.shader = LinearGradient(
            0f, 0.08f * s, 0f, 0.72f * s,
            0x9926E6FF.toInt(), 0x99A04DFF.toInt(), Shader.TileMode.CLAMP
        )
        glow.shader = RadialGradient(
            0.5f * s, 0.42f * s, 0.62f * s,
            intArrayOf(0x6626E6FF, 0x22B44DFF, 0x00000000), floatArrayOf(0f, 0.6f, 1f),
            Shader.TileMode.CLAMP
        )
    }

    fun draw(
        c: Canvas,
        s: Float,
        state: PetEngine.State,
        t: Float,
        facing: Int,
        wallSide: Int,
        onPlatform: Boolean,
        reacting: Boolean
    ) {
        build(s)

        if (t >= glitchNext) {
            glitchEnd = t + 0.14f
            glitchNext = t + 2f + Random.nextFloat() * 4f
            glitchSeed = Random.nextLong()
        }
        val glitching = t < glitchEnd && state != PetEngine.State.SLEEP

        val sleeping = state == PetEngine.State.SLEEP
        val sitting = state == PetEngine.State.SIT || sleeping
        val hanging = state == PetEngine.State.HANG
        val dragged = state == PetEngine.State.DRAG
        val airborne = state == PetEngine.State.FALL || state == PetEngine.State.JUMP
        val stepping = state == PetEngine.State.WALK || state == PetEngine.State.CLIMB

        c.save()
        if (state == PetEngine.State.CLIMB) c.rotate(if (wallSide < 0) 90f else -90f, s / 2f, s / 2f)
        if (facing < 0) c.scale(-1f, 1f, s / 2f, s / 2f)
        if (dragged) c.rotate(sin(t * 9f) * 7f, s / 2f, 0.1f * s)

        // На сколько корпус опущен относительно стойки.
        var dy = when {
            sitting && onPlatform -> 0.28f * s
            sitting -> 0.22f * s
            hanging -> 0.12f * s
            else -> 0f
        }
        if (state == PetEngine.State.IDLE || state == PetEngine.State.WALK) dy += sin(t * 3.2f) * 0.012f * s
        if (sleeping) dy += sin(t * 1.4f) * 0.008f * s

        c.translate(0f, dy)

        // свечение
        glow.alpha = if (sleeping) 110 else (200 + 55 * sin(t * 2.3f)).toInt()
        c.drawCircle(0.5f * s, 0.42f * s, 0.62f * s, glow)

        // ножки
        val len = 0.26f * s
        val a1: Float
        val a2: Float
        when {
            stepping -> {
                a1 = sin(t * 10f) * 0.55f
                a2 = -a1
            }
            sitting && !onPlatform -> {
                // сидит на полу — ножки вытянуты вперёд
                a1 = 1.4f + sin(t * 3f) * 0.06f
                a2 = 1.25f + sin(t * 3f + 1.5f) * 0.06f
            }
            sitting || hanging || dragged -> {
                // болтает ножками
                val k = if (sleeping) 0.08f else if (dragged) 0.7f else 0.45f
                val w = if (dragged) 9f else 4f
                a1 = sin(t * w) * k
                a2 = sin(t * w + 2.2f) * k
            }
            airborne -> {
                a1 = -0.55f + sin(t * 14f) * 0.15f
                a2 = 0.55f + sin(t * 14f + 1f) * 0.15f
            }
            else -> {
                a1 = 0f
                a2 = 0f
            }
        }
        line.color = CYAN
        line.strokeWidth = 0.035f * s
        solid.color = CYAN
        drawLeg(c, 0.40f * s, 0.71f * s, a1, len, s)
        drawLeg(c, 0.60f * s, 0.71f * s, a2, len, s)

        // руки, которыми держится за верхний край
        if (hanging) {
            val reach = sin(t * 5f) * 0.03f * s
            c.drawLine(0.28f * s, 0.14f * s, 0.24f * s + reach, -dy, line)
            c.drawLine(0.72f * s, 0.2f * s, 0.76f * s - reach, -dy, line)
        }

        // антенна
        c.drawLine(0.38f * s, 0.08f * s, 0.32f * s, -0.04f * s, line)
        solid.color = if (sin(t * 6f) > 0.2f || reacting) MAGENTA else CYAN
        c.drawCircle(0.32f * s, -0.05f * s, 0.035f * s, solid)

        // корпус
        fill.alpha = if (glitching) 150 else 255
        c.drawPath(body, fill)
        line.color = CYAN
        line.alpha = 70
        line.strokeWidth = 0.075f * s
        c.drawPath(body, line)
        line.alpha = 255
        line.strokeWidth = 0.028f * s
        c.drawPath(body, line)

        // строки развёртки
        c.save()
        c.clipPath(body)
        solid.color = 0x30FFFFFF
        val gap = 0.07f * s
        var ly = 0.08f * s + (t * 0.18f * s) % gap
        while (ly < 0.72f * s) {
            c.drawRect(0.18f * s, ly, 0.82f * s, ly + 0.012f * s, solid)
            ly += gap
        }
        c.restore()

        // визор и глаза
        solid.color = 0xC00B0B14.toInt()
        c.drawRoundRect(0.25f * s, 0.25f * s, 0.75f * s, 0.47f * s, 0.05f * s, 0.05f * s, solid)
        drawEyes(c, s, t, sleeping, reacting, dragged || airborne)

        // ядро
        val pulse = 0.045f * s * (1f + 0.25f * sin(t * (if (sleeping) 1.4f else 5f)))
        solid.color = MAGENTA
        c.save()
        c.rotate(45f, 0.5f * s, 0.59f * s)
        c.drawRect(0.5f * s - pulse, 0.59f * s - pulse, 0.5f * s + pulse, 0.59f * s + pulse, solid)
        c.restore()

        // глитч: полосы корпуса разъезжаются в стороны двумя цветами
        if (glitching) {
            val r = Random(glitchSeed)
            line.strokeWidth = 0.03f * s
            for (i in 0 until 3) {
                val top = (0.08f + r.nextFloat() * 0.5f) * s
                val h = (0.05f + r.nextFloat() * 0.1f) * s
                val shift = (r.nextFloat() - 0.5f) * 0.3f * s
                c.save()
                c.clipRect(-s, top, 2f * s, top + h)
                c.translate(shift, 0f)
                line.color = MAGENTA
                c.drawPath(body, line)
                c.translate(-shift * 1.6f, 0f)
                line.color = 0xFFFFFFFF.toInt()
                line.alpha = 180
                c.drawPath(body, line)
                c.restore()
            }
            line.alpha = 255
        }

        c.restore()

        // то, что не должно зеркалиться и вращаться
        if (sleeping) {
            text.textSize = 0.2f * s
            for (i in 0 until 2) {
                val p = (t * 0.45f + i * 0.5f) % 1f
                text.alpha = (255 * (1f - p)).toInt()
                c.drawText("z", (0.8f + 0.1f * i + p * 0.08f) * s, (0.3f - p * 0.35f) * s + dy, text)
            }
        }
        if (reacting) {
            line.color = MAGENTA
            line.strokeWidth = 0.025f * s
            for (i in 0 until 3) {
                val ang = t * 2f + i * 2.1f
                val px = 0.5f * s + cos(ang) * 0.55f * s
                val py = 0.35f * s + sin(ang) * 0.4f * s + dy
                val d = 0.04f * s
                c.drawLine(px - d, py, px + d, py, line)
                c.drawLine(px, py - d, px, py + d, line)
            }
        }
    }

    private fun drawLeg(c: Canvas, hx: Float, hy: Float, angle: Float, len: Float, s: Float) {
        val fx = hx + sin(angle) * len
        val fy = hy + cos(angle) * len
        c.drawLine(hx, hy, fx, fy, line)
        c.drawCircle(fx, fy, 0.036f * s, solid)
    }

    private fun drawEyes(c: Canvas, s: Float, t: Float, sleeping: Boolean, happy: Boolean, wide: Boolean) {
        val lx = 0.40f * s
        val rx = 0.62f * s
        val cy = 0.36f * s
        val blink = (t % 3.7f) < 0.12f
        when {
            sleeping || (blink && !happy && !wide) -> {
                line.color = WHITE
                line.strokeWidth = 0.022f * s
                c.drawLine(lx - 0.04f * s, cy, lx + 0.04f * s, cy, line)
                c.drawLine(rx - 0.04f * s, cy, rx + 0.04f * s, cy, line)
            }
            happy -> {
                line.color = WHITE
                line.strokeWidth = 0.026f * s
                for (x in floatArrayOf(lx, rx)) {
                    c.drawLine(x - 0.04f * s, cy + 0.03f * s, x, cy - 0.03f * s, line)
                    c.drawLine(x, cy - 0.03f * s, x + 0.04f * s, cy + 0.03f * s, line)
                }
            }
            wide -> {
                line.color = WHITE
                line.strokeWidth = 0.022f * s
                c.drawRect(lx - 0.045f * s, cy - 0.055f * s, lx + 0.045f * s, cy + 0.055f * s, line)
                c.drawRect(rx - 0.045f * s, cy - 0.055f * s, rx + 0.045f * s, cy + 0.055f * s, line)
            }
            else -> {
                solid.color = WHITE
                c.drawRect(lx - 0.035f * s, cy - 0.05f * s, lx + 0.035f * s, cy + 0.05f * s, solid)
                c.drawRect(rx - 0.035f * s, cy - 0.05f * s, rx + 0.035f * s, cy + 0.05f * s, solid)
            }
        }
    }

    private companion object {
        val CYAN = 0xFF5CF6FF.toInt()
        val MAGENTA = 0xFFFF4DD8.toInt()
        val WHITE = 0xFFFFFFFF.toInt()
    }
}
