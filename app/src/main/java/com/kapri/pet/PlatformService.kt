package com.kapri.pet

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.os.Handler
import android.os.HandlerThread
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

    // Дерево элементов читается в отдельном потоке, чтобы не тормозить анимацию питомца.
    private val scanThread = HandlerThread("kapri-scan").apply { start() }
    private val scanHandler = Handler(scanThread.looper)

    @Volatile
    private var pending = false

    @Volatile
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
        if (event.packageName?.toString() == packageName) {
            // Открылся наш собственный экран — платформы прошлого приложения надо сбросить.
            if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) schedule(120L)
            return
        }
        schedule(120L)
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        scanHandler.removeCallbacks(scanTask)
        scanThread.quitSafely()
        PlatformHub.requestScan = null
        PlatformHub.publish(emptyList())
        super.onDestroy()
    }

    /** Не чаще одного чтения в SCAN_INTERVAL мс, но последнее событие всегда доводится до чтения. */
    private fun schedule(delay: Long) {
        if (pending) return
        pending = true
        val sinceLast = SystemClock.uptimeMillis() - lastScan
        scanHandler.postDelayed(scanTask, max(delay, SCAN_INTERVAL - sinceLast))
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

        val listRows = ArrayList<Rect>()
        val others = ArrayList<Rect>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        val inList = ArrayDeque<Boolean>()
        // Видимая область ближайшего списка-предка: строки, уехавшие под шапку, не считаются.
        val clipTop = ArrayDeque<Int>()
        val clipBottom = ArrayDeque<Int>()
        queue.add(root)
        inList.add(false)
        clipTop.add(0)
        clipBottom.add(dm.heightPixels * 2)
        val r = Rect()
        var visited = 0
        while (queue.isNotEmpty() && visited < MAX_NODES) {
            val node = queue.removeFirst()
            val listItem = inList.removeFirst()
            var top = clipTop.removeFirst()
            var bottom = clipBottom.removeFirst()
            visited++
            if (!node.isVisibleToUser) continue
            // Список считается списком и тогда, когда прокручивать нечего (короткий чат):
            // в этом случае isScrollable ложно, поэтому смотрим ещё и на класс.
            val container = node.isScrollable || isListClass(node.className)
            node.getBoundsInScreen(r)
            if (container) {
                top = max(top, r.top)
                bottom = minOf(bottom, r.bottom)
            }
            if (visited > 1 && !container) {
                if (r.width() >= minW && r.height() in minH..maxH && r.top > topLimit &&
                    r.top >= top && r.top < bottom
                ) {
                    if (listItem) {
                        listRows.add(Rect(r))
                    } else if (node.isClickable || node.isLongClickable ||
                        !node.text.isNullOrEmpty() || !node.contentDescription.isNullOrEmpty()
                    ) {
                        others.add(Rect(r))
                    }
                }
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                queue.add(child)
                inList.add(container)
                clipTop.add(top)
                clipBottom.add(bottom)
            }
        }
        // В Telegram берём только строки списков; если их не нашлось — всё остальное.
        val found = if (listItemsOnly && listRows.isNotEmpty()) listRows else {
            listRows.addAll(others)
            listRows
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

    private fun isListClass(name: CharSequence?): Boolean {
        val n = name?.toString() ?: return false
        return n.endsWith("RecyclerView") || n.endsWith("ListView") || n.endsWith("GridView")
    }

    private companion object {
        const val SCAN_INTERVAL = 200L
        const val MAX_NODES = 900
        const val MAX_PLATFORMS = 48
        val TELEGRAM_PACKAGES = setOf(
            "org.telegram.messenger",
            "org.telegram.messenger.web",
            "org.telegram.messenger.beta"
        )
    }
}
