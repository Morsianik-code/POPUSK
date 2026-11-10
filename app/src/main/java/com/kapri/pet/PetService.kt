package com.kapri.pet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.graphics.Point
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowManager
import kotlin.math.abs

/**
 * Держит питомца на экране: маленькое окно поверх всех приложений, которое двигается
 * вслед за физикой. Кадры идут через Choreographer и останавливаются при выключенном экране.
 */
class PetService : Service(), Choreographer.FrameCallback,
    SharedPreferences.OnSharedPreferenceChangeListener {

    private lateinit var wm: WindowManager
    private lateinit var prefs: SharedPreferences
    private val engine = PetEngine()
    private var petView: PetView? = null
    private var sensorView: View? = null
    private var debugView: DebugView? = null
    private var showPlatforms = false
    private lateinit var lp: WindowManager.LayoutParams

    private var active = false
    private var lastFrame = 0L
    private var hubVersion = -1
    private var usePlatforms = true
    private var quietOption = true
    private var fullscreen = false
    private var baseAlpha = 0.9f
    private var shownAlpha = 0.9f
    private var wasHidden = false

    // перетаскивание
    private var tracker: VelocityTracker? = null
    private var downX = 0f
    private var downY = 0f
    private var grabDx = 0f
    private var grabDy = 0f
    private var moved = false

    private val reloadSkin = Runnable { loadSkin() }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_OFF -> pause()
                Intent.ACTION_SCREEN_ON -> resume()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs.of(this)
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        if (!startInForeground()) {
            stopSelf()
            return
        }

        if (!Settings.canDrawOverlays(this)) {
            prefs.edit().putBoolean(Prefs.ENABLED, false).apply()
            stopSelf()
            return
        }

        engine.density = resources.displayMetrics.density
        engine.randomAppear = prefs.getBoolean(Prefs.RANDOM_APPEAR, true)
        engine.frequency = prefs.getInt(Prefs.FREQUENCY, Prefs.FREQ_DEFAULT)
        engine.resize(sizePx())
        applyBounds()

        val view = PetView(this, engine)
        view.setOnTouchListener { _, ev -> onTouch(ev) }
        lp = WindowManager.LayoutParams(
            PetView.windowWidth(engine.size),
            PetView.windowHeight(engine.size),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.LEFT
        if (Build.VERSION.SDK_INT >= 30) {
            lp.fitInsetsTypes = 0
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        } else if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        placeWindow()
        try {
            wm.addView(view, lp)
        } catch (e: Exception) {
            prefs.edit().putBoolean(Prefs.ENABLED, false).apply()
            stopSelf()
            return
        }
        petView = view
        view.visibility = View.GONE
        addFullscreenSensor()

        applySettings()
        loadSkin()
        prefs.registerOnSharedPreferenceChangeListener(this)
        registerReceiver(screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        })

        running = true
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (pm.isInteractive) resume()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            prefs.edit().putBoolean(Prefs.ENABLED, false).apply()
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        pause()
        if (petView != null) {
            prefs.unregisterOnSharedPreferenceChangeListener(this)
            try {
                unregisterReceiver(screenReceiver)
            } catch (e: Exception) {
            }
        }
        petView?.let { runCatching { wm.removeView(it) } }
        sensorView?.let { runCatching { wm.removeView(it) } }
        debugView?.let { runCatching { wm.removeView(it) } }
        debugView = null
        petView = null
        sensorView = null
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (petView == null) return
        engine.density = resources.displayMetrics.density
        applyBounds()
    }

    // ---------- уведомление ----------

    private fun startInForeground(): Boolean {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW)
                .apply { setShowBadge(false) }
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, PetService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_pet)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.notif_stop), stop).build())
            .build()
        // Система может запретить запуск из фона (например, при перезапуске без разрешений).
        return try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    // ---------- экран и настройки ----------

    private fun sizePx() =
        prefs.getInt(Prefs.SIZE_DP, Prefs.SIZE_DEFAULT) * resources.displayMetrics.density

    @Suppress("DEPRECATION")
    private fun applyBounds() {
        val width: Int
        val height: Int
        var bottomInset: Int
        if (Build.VERSION.SDK_INT >= 30) {
            val metrics = wm.maximumWindowMetrics
            width = metrics.bounds.width()
            height = metrics.bounds.height()
            bottomInset = metrics.windowInsets
                .getInsetsIgnoringVisibility(WindowInsets.Type.navigationBars()).bottom
        } else {
            val p = Point()
            wm.defaultDisplay.getRealSize(p)
            width = p.x
            height = p.y
            val id = resources.getIdentifier("navigation_bar_height", "dimen", "android")
            bottomInset = if (id != 0 && height > width) resources.getDimensionPixelSize(id) else 0
        }
        if (bottomInset > height / 4) bottomInset = 0
        engine.setBounds(width.toFloat(), (height - bottomInset).toFloat(), 0f)
    }

    private fun applySettings() {
        val view = petView ?: return
        engine.speedFactor = prefs.getInt(Prefs.SPEED_PCT, Prefs.SPEED_DEFAULT) / 100f
        engine.randomAppear = prefs.getBoolean(Prefs.RANDOM_APPEAR, true)
        engine.frequency = prefs.getInt(Prefs.FREQUENCY, Prefs.FREQ_DEFAULT)
        baseAlpha = prefs.getInt(Prefs.ALPHA_PCT, Prefs.ALPHA_DEFAULT) / 100f
        quietOption = prefs.getBoolean(Prefs.QUIET_FULLSCREEN, true)
        usePlatforms = prefs.getBoolean(Prefs.PLATFORMS, true)
        view.skinFps = prefs.getInt(Prefs.SKIN_FPS, Prefs.FPS_DEFAULT)

        val size = sizePx()
        if (size != engine.size) {
            engine.resize(size)
            lp.width = PetView.windowWidth(size)
            lp.height = PetView.windowHeight(size)
            placeWindow()
            runCatching { wm.updateViewLayout(view, lp) }
        }
        applyQuiet()
        showPlatforms = prefs.getBoolean(Prefs.SHOW_PLATFORMS, false) && usePlatforms
        updateDebugLayer()
        PlatformHub.wanted = wantPlatforms()
        hubVersion = -1
        view.invalidate()
    }

    private fun applyQuiet() {
        val view = petView ?: return
        val quiet = quietOption && fullscreen
        view.quiet = quiet
        shownAlpha = if (quiet) baseAlpha * 0.35f else baseAlpha
        view.alpha = shownAlpha * engine.presence
        view.invalidate()
    }

    private fun loadSkin() {
        val view = petView ?: return
        view.frames = if (prefs.getBoolean(Prefs.SKIN_ON, false)) {
            SkinStore.load(this, (engine.size * 1.5f).toInt().coerceAtLeast(64))
        } else {
            emptyMap()
        }
        // Со своим скином образ «только лицо» показываем, только если для него есть кадры.
        engine.faceAllowed = view.frames.isEmpty() || view.frames.containsKey("face")
        view.invalidate()
    }

    override fun onSharedPreferenceChanged(sp: SharedPreferences?, key: String?) {
        when (key) {
            Prefs.SKIN_ON, Prefs.SKIN_VERSION -> loadSkin()
            Prefs.SIZE_DP -> {
                applySettings()
                // Ползунок шлёт десятки значений подряд — кадры скина перечитываем один раз в конце.
                petView?.let {
                    it.removeCallbacks(reloadSkin)
                    if (prefs.getBoolean(Prefs.SKIN_ON, false)) it.postDelayed(reloadSkin, 400L)
                }
            }
            else -> applySettings()
        }
    }

    /**
     * Узкое невидимое окно на всю высоту экрана: по его отступам видно, спрятана ли
     * строка состояния, то есть открыто ли что-то во весь экран (например, видео).
     */
    @Suppress("DEPRECATION")
    private fun addFullscreenSensor() {
        val sensor = View(this)
        sensor.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        val p = WindowManager.LayoutParams(
            1, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        )
        p.gravity = Gravity.TOP or Gravity.LEFT
        // Полностью прозрачное окно: Android 12+ иначе блокирует касания под чужими оверлеями.
        p.alpha = 0f
        if (Build.VERSION.SDK_INT >= 30) {
            sensor.setOnApplyWindowInsetsListener { _, insets ->
                setFullscreen(!insets.isVisible(WindowInsets.Type.statusBars()))
                insets
            }
        } else {
            sensor.setOnSystemUiVisibilityChangeListener { flags ->
                setFullscreen(flags and View.SYSTEM_UI_FLAG_FULLSCREEN != 0)
            }
        }
        try {
            wm.addView(sensor, p)
            sensorView = sensor
        } catch (e: Exception) {
        }
    }

    private fun setFullscreen(value: Boolean) {
        if (fullscreen == value) return
        fullscreen = value
        applyQuiet()
    }

    // ---------- кадры ----------

    private fun resume() {
        if (active || petView == null) return
        active = true
        wasHidden = engine.state == PetEngine.State.HIDDEN
        lastFrame = 0L
        PlatformHub.wanted = wantPlatforms()
        hubVersion = -1
        Choreographer.getInstance().postFrameCallback(this)
    }

    private fun pause() {
        if (!active) return
        active = false
        Choreographer.getInstance().removeFrameCallback(this)
        PlatformHub.wanted = false
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!active) return
        val view = petView ?: return
        val dt = if (lastFrame == 0L) 0.016f else (frameTimeNanos - lastFrame) / 1_000_000_000f
        lastFrame = frameTimeNanos

        val v = PlatformHub.version
        if (v != hubVersion) {
            hubVersion = v
            val list = if (usePlatforms) PlatformHub.platforms else emptyList()
            engine.setPlatforms(list)
            debugView?.show(list.filter { engine.usable(it) })
        }

        engine.update(dt)

        val hidden = engine.state == PetEngine.State.HIDDEN
        if (hidden != wasHidden) {
            wasHidden = hidden
            // Пока питомца нет, окно убрано совсем: не ловит касания и не рисуется.
            view.visibility = if (hidden) View.GONE else View.VISIBLE
            PlatformHub.wanted = wantPlatforms()
            hubVersion = -1
        }
        if (!hidden) {
            val oldX = lp.x
            val oldY = lp.y
            placeWindow()
            if (lp.x != oldX || lp.y != oldY) runCatching { wm.updateViewLayout(view, lp) }
            view.alpha = shownAlpha * engine.presence
            view.invalidate()
        }

        // Пока питомца нет на экране, хватает четырёх проверок в секунду; спящему — десятка кадров.
        if (hidden) {
            Choreographer.getInstance().postFrameCallbackDelayed(this, 250L)
        } else if (engine.state == PetEngine.State.SLEEP) {
            Choreographer.getInstance().postFrameCallbackDelayed(this, 90L)
        } else {
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    private fun wantPlatforms() =
        active && usePlatforms && (showPlatforms || engine.state != PetEngine.State.HIDDEN)

    /** Проверочный слой на весь экран; касания сквозь него проходят. */
    private fun updateDebugLayer() {
        if (showPlatforms && debugView == null) {
            val view = DebugView(this)
            val p = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            )
            p.gravity = Gravity.TOP or Gravity.LEFT
            // Полупрозрачное окно: Android 12+ пропускает касания только под такими оверлеями.
            p.alpha = 0.6f
            if (Build.VERSION.SDK_INT >= 30) {
                p.fitInsetsTypes = 0
                p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            } else if (Build.VERSION.SDK_INT >= 28) {
                p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            try {
                wm.addView(view, p)
                debugView = view
            } catch (e: Exception) {
            }
        } else if (!showPlatforms && debugView != null) {
            debugView?.let { runCatching { wm.removeView(it) } }
            debugView = null
        }
    }

    private fun placeWindow() {
        lp.x = (engine.x - engine.size * PetView.PAD_SIDE).toInt()
        lp.y = (engine.y - engine.size * PetView.PAD_TOP).toInt()
    }

    // ---------- касания ----------

    private fun onTouch(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = ev.rawX
                downY = ev.rawY
                grabDx = ev.rawX - engine.x
                grabDy = ev.rawY - engine.y
                moved = false
                tracker?.recycle()
                tracker = VelocityTracker.obtain()
                track(ev)
            }
            MotionEvent.ACTION_MOVE -> {
                track(ev)
                if (!moved) {
                    val slop = ViewConfiguration.get(this).scaledTouchSlop
                    if (abs(ev.rawX - downX) > slop || abs(ev.rawY - downY) > slop) {
                        moved = true
                        engine.startDrag()
                    }
                }
                if (moved) engine.dragTo(ev.rawX - grabDx, ev.rawY - grabDy)
            }
            MotionEvent.ACTION_UP -> {
                track(ev)
                if (moved) {
                    val t = tracker
                    t?.computeCurrentVelocity(1000)
                    engine.release(t?.xVelocity ?: 0f, t?.yVelocity ?: 0f)
                } else {
                    engine.onTap()
                }
                endTouch()
            }
            MotionEvent.ACTION_CANCEL -> {
                if (moved) engine.release(0f, 0f)
                endTouch()
            }
        }
        return true
    }

    // Окно двигается вместе с пальцем, поэтому скорость считаем по экранным координатам.
    private fun track(ev: MotionEvent) {
        val copy = MotionEvent.obtain(ev)
        copy.offsetLocation(ev.rawX - ev.x, ev.rawY - ev.y)
        tracker?.addMovement(copy)
        copy.recycle()
    }

    private fun endTouch() {
        tracker?.recycle()
        tracker = null
        moved = false
    }

    companion object {
        private const val CHANNEL = "pet"
        private const val NOTIFICATION_ID = 1
        const val ACTION_STOP = "com.kapri.pet.STOP"

        @Volatile
        var running = false
            private set

        fun start(context: Context) {
            context.startForegroundService(Intent(context, PetService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PetService::class.java))
        }
    }
}
