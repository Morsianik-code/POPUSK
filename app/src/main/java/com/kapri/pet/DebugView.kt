package com.kapri.pet

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.view.View

/** Проверочный слой: подсвечивает верхние края элементов, на которые питомец может сесть. */
class DebugView(context: Context) : View(context) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF5CF6FF.toInt()
        strokeWidth = 3f * resources.displayMetrics.density
        strokeCap = Paint.Cap.ROUND
    }
    private var rects: List<Rect> = emptyList()

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun show(list: List<Rect>) {
        rects = list
        invalidate()
    }

    override fun onDraw(c: Canvas) {
        for (r in rects) {
            c.drawLine(r.left.toFloat(), r.top.toFloat(), r.right.toFloat(), r.top.toFloat(), paint)
        }
    }
}
