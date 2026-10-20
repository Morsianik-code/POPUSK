package dev.popusk.widgets

import android.Manifest
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.RemoteViews
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var prefs: Prefs
    private lateinit var themeButtons: Map<WidgetTheme, TextView>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs(this)

        click(R.id.btn_add_clock) { pin(ClockWidget::class.java) }
        click(R.id.btn_add_activity) { pin(ActivityWidget::class.java) }
        click(R.id.btn_add_weather) { pin(WeatherWidget::class.java) }

        themeButtons = mapOf(
            WidgetTheme.LIGHT to findViewById(R.id.theme_light),
            WidgetTheme.DARK to findViewById(R.id.theme_dark),
            WidgetTheme.GLASS to findViewById(R.id.theme_glass),
        )
        themeButtons.forEach { (theme, button) ->
            button.setOnClickListener {
                prefs.theme = theme
                applyChanges()
            }
        }

        val city = findViewById<EditText>(R.id.edit_city)
        click(R.id.btn_city_search) { searchCity(city.text.toString()) }
        city.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_SEARCH) searchCity(city.text.toString())
            action == EditorInfo.IME_ACTION_SEARCH
        }
        click(R.id.btn_city_gps) { useGps() }

        click(R.id.btn_perm_steps) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                requestPermissions(arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), REQ_STEPS)
            }
        }

        findViewById<EditText>(R.id.goal_steps).setText(prefs.stepGoal.toString())
        findViewById<EditText>(R.id.goal_calories).setText(prefs.calorieGoal.toString())
        findViewById<EditText>(R.id.goal_active).setText(prefs.activeGoal.toString())
        click(R.id.btn_save_goals) { saveGoals() }
    }

    override fun onResume() {
        super.onResume()
        renderScreen()
        background {
            StepTracker.refresh(this)
            WeatherRepository.refresh(this)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        when (requestCode) {
            REQ_STEPS -> background { StepTracker.refresh(this) }
            REQ_LOCATION -> if (granted) useGps() else toast("Без доступа к геолокации — выберите город вручную")
        }
    }

    // --- действия ---

    private fun pin(cls: Class<*>) {
        val mgr = getSystemService(AppWidgetManager::class.java)
        if (mgr != null && mgr.isRequestPinAppWidgetSupported) {
            mgr.requestPinAppWidget(ComponentName(this, cls), null, null)
        } else {
            toast("Лаунчер не умеет добавлять сам: зажмите пустое место на рабочем столе → Виджеты → Popusk Widgets")
        }
    }

    private fun searchCity(query: String) {
        val name = query.trim()
        if (name.isEmpty()) return toast("Введите название города")
        toast("Ищу «$name»…")
        thread {
            val place = runCatching { WeatherRepository.searchCity(name) }.getOrNull()
            if (place == null) {
                runOnUiThread { toast("Город не найден или нет интернета") }
                return@thread
            }
            prefs.useGps = false
            prefs.cityName = place.name
            prefs.setLocation(place.lat, place.lon)
            WeatherRepository.refresh(this, force = true)
            WidgetUpdater.render(this)
            runOnUiThread { if (!isDestroyed) renderScreen() }
        }
    }

    private fun useGps() {
        if (!LocationHelper.hasPermission(this)) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION), REQ_LOCATION)
            return
        }
        toast("Определяю местоположение…")
        LocationHelper.requestFresh(this) { loc ->
            if (loc == null) {
                toast("Не удалось определить — включите геолокацию или введите город")
                return@requestFresh
            }
            thread {
                prefs.useGps = true
                prefs.setLocation(loc.latitude, loc.longitude)
                prefs.cityName = LocationHelper.cityName(this, loc.latitude, loc.longitude)
                WeatherRepository.refresh(this, force = true)
                WidgetUpdater.render(this)
                runOnUiThread { if (!isDestroyed) renderScreen() }
            }
        }
    }

    private fun saveGoals() {
        fun read(id: Int, fallback: Int) =
            findViewById<EditText>(id).text.toString().toIntOrNull()?.takeIf { it > 0 } ?: fallback
        prefs.stepGoal = read(R.id.goal_steps, prefs.stepGoal)
        prefs.calorieGoal = read(R.id.goal_calories, prefs.calorieGoal)
        prefs.activeGoal = read(R.id.goal_active, prefs.activeGoal)
        applyChanges()
        toast("Цели сохранены")
    }

    // --- отображение ---

    private fun applyChanges() {
        WidgetUpdater.render(this)
        renderScreen()
    }

    private fun renderScreen() {
        put(R.id.preview_clock, WidgetViews.clock(this))
        put(R.id.preview_activity, WidgetViews.activity(this))
        put(R.id.preview_weather, WidgetViews.weather(this))

        themeButtons.forEach { (theme, button) ->
            val selected = theme == prefs.theme
            button.setBackgroundResource(if (selected) R.drawable.ui_button_primary else R.drawable.ui_button)
            button.setTextColor(if (selected) 0xFF111111.toInt() else getColor(R.color.ui_text))
        }

        findViewById<TextView>(R.id.status_location).text = when {
            prefs.lat == null -> "Место не выбрано — найдите город или включите геолокацию"
            prefs.useGps -> "По геолокации: ${prefs.cityName ?: "моё место"}"
            else -> "Город: ${prefs.cityName}"
        }

        val stepsOk = StepTracker.hasPermission(this)
        findViewById<TextView>(R.id.status_steps).text = when {
            !StepTracker.isSupported(this) -> "В телефоне нет датчика шагов"
            !stepsOk -> "Нужно разрешение «Физическая активность»"
            else -> "Шаги считаются с момента установки. Сегодня: ${StepTracker.today(this).steps}"
        }
        findViewById<TextView>(R.id.btn_perm_steps).visibility =
            if (stepsOk || !StepTracker.isSupported(this)) android.view.View.GONE else android.view.View.VISIBLE
    }

    private fun put(containerId: Int, views: RemoteViews) {
        val container = findViewById<FrameLayout>(containerId)
        container.removeAllViews()
        container.addView(
            views.apply(this, container),
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT),
        )
    }

    private fun background(work: () -> Unit) {
        thread {
            work()
            WidgetUpdater.render(this)
            runOnUiThread { if (!isDestroyed) renderScreen() }
        }
    }

    private fun click(id: Int, action: () -> Unit) = findViewById<TextView>(id).setOnClickListener { action() }

    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_LONG).show()

    companion object {
        private const val REQ_STEPS = 1
        private const val REQ_LOCATION = 2
    }
}
