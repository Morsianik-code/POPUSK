package com.kapri.pet

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlin.math.abs
import kotlin.math.max

/**
 * Читает координаты видимых элементов текущего приложения и отдаёт их питомцу как «платформы».
 * Берутся только прямоугольники: тексты, содержимое и события нигде не сохраняются
 * и никуда не передаются. Пока питомец выключен, экран не читается вообще.
 */
class PlatformService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private var pending = false
    private var lastScan = 0L
    private val scanTask = Runnable {
        pending = false
        scan()
    }

    override fun onServiceConnected() {
        PlatformHub.requestScan = { schedule(0L) }
        if (PlatformHub.wanted) schedule(0L)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!PlatformHub.wanted || event == null) return
        if (event.packageName?.toString() == packageName) return
        schedule(120L)
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        handler.removeCallbacks(scanTask)
        PlatformHub.requestScan = null
        PlatformHub.publish(emptyList())
        super.onDestroy()
    }

    /** Не чаще одного чтения в SCAN_INTERVAL мс, но последнее событие всегда доводится до чтения. */
    private fun schedule(delay: Long) {
        if (pending) return
        pending = true
        val sinceLast = SystemClock.uptimeMillis() - lastScan
        handler.postDelayed(scanTask, max(delay, SCAN_INTERVAL - sinceLast))
    }

    private fun scan() {
        lastScan = SystemClock.uptimeMillis()
        if (!PlatformHub.wanted) return
        val found = try {
            collect()
        } catch (e: Exception) {
            emptyList()
        }
        PlatformHub.publish(found)
    }

    private fun collect(): List<Rect> {
        val root = rootInActiveWindow ?: return emptyList()
        val pkg = root.packageName?.toString() ?: ""
        if (pkg == packageName) return emptyList()
        // В Telegram платформы — строки списков: сообщения в чате и чаты в списке.
        val listItemsOnly = pkg in TELEGRAM_PACKAGES

        val dm = resources.displayMetrics
        val d = dm.density
        val minW = (36 * d).toInt()
        val minH = (20 * d).toInt()
        val maxH = (dm.heightPixels * 0.5f).toInt()
        val topLimit = (28 * d).toInt()

        val found = ArrayList<Rect>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        val inList = ArrayDeque<Boolean>()
        queue.add(root)
        inList.add(false)
        val r = Rect()
        var visited = 0
        while (queue.isNotEmpty() && visited < MAX_NODES) {
            val node = queue.removeFirst()
            val listItem = inList.removeFirst()
            visited++
            if (!node.isVisibleToUser) continue
            val scrollable = node.isScrollable
            if (visited > 1 && !scrollable) {
                node.getBoundsInScreen(r)
                val interesting = listItem || (!listItemsOnly && (node.isClickable || node.isLongClickable ||
                        !node.text.isNullOrEmpty() || !node.contentDescription.isNullOrEmpty()))
                if (interesting && r.width() >= minW && r.height() in minH..maxH && r.top > topLimit) {
                    found.add(Rect(r))
                }
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                queue.add(child)
                inList.add(scrollable)
            }
        }

        // Убираем дубли: вложенные элементы с тем же верхним краем.
        found.sortWith(compareBy({ it.top }, { -it.width() }))
        val merge = (8 * d).toInt()
        val out = ArrayList<Rect>()
        for (rect in found) {
            val dup = out.any { abs(it.top - rect.top) < merge && it.left < rect.right && rect.left < it.right }
            if (!dup) out.add(rect)
            if (out.size >= MAX_PLATFORMS) break
        }
        return out
    }

    private companion object {
        const val SCAN_INTERVAL = 200L
        const val MAX_NODES = 600
        const val MAX_PLATFORMS = 48
        val TELEGRAM_PACKAGES = setOf(
            "org.telegram.messenger",
            "org.telegram.messenger.web",
            "org.telegram.messenger.beta"
        )
    }
}
