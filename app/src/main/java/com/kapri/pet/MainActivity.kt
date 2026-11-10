package com.kapri.pet

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity(), SharedPreferences.OnSharedPreferenceChangeListener {

    private class Perm(
        val title: Int,
        val desc: Int,
        val granted: () -> Boolean,
        val request: () -> Unit
    ) {
        lateinit var button: Button
    }

    private lateinit var prefs: SharedPreferences
    private lateinit var petSwitch: Switch
    private var updating = false
    private var askedNotifications = false

    private val perms by lazy {
        listOf(
            Perm(R.string.perm_overlay_title, R.string.perm_overlay_desc, { Settings.canDrawOverlays(this) }) {
                open(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageUri()))
            },
            Perm(R.string.perm_acc_title, R.string.perm_acc_desc, ::accessibilityEnabled) {
                open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            },
            Perm(R.string.perm_notif_title, R.string.perm_notif_desc, ::notificationsEnabled, ::requestNotifications),
            Perm(R.string.perm_battery_title, R.string.perm_battery_desc, ::batteryUnrestricted) {
                open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri()))
            }
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        prefs = Prefs.of(this)

        petSwitch = findViewById(R.id.pet_switch)
        petSwitch.setOnCheckedChangeListener { _, checked ->
            if (!updating) togglePet(checked)
        }

        val container = findViewById<LinearLayout>(R.id.perms)
        for (perm in perms) {
            val row = layoutInflater.inflate(R.layout.item_permission, container, false)
            row.findViewById<TextView>(R.id.perm_title).setText(perm.title)
            row.findViewById<TextView>(R.id.perm_desc).setText(perm.desc)
            perm.button = row.findViewById(R.id.perm_button)
            perm.button.setOnClickListener { perm.request() }
            container.addView(row)
        }

        bindSeek(R.id.size_seek, R.id.size_label, Prefs.SIZE_DP,
            Prefs.SIZE_MIN, Prefs.SIZE_MAX, Prefs.SIZE_DEFAULT, R.string.size_label)
        bindSeek(R.id.speed_seek, R.id.speed_label, Prefs.SPEED_PCT,
            Prefs.SPEED_MIN, Prefs.SPEED_MAX, Prefs.SPEED_DEFAULT, R.string.speed_label)
        bindSeek(R.id.alpha_seek, R.id.alpha_label, Prefs.ALPHA_PCT,
            Prefs.ALPHA_MIN, Prefs.ALPHA_MAX, Prefs.ALPHA_DEFAULT, R.string.alpha_label)

        bindSeek(R.id.freq_seek, R.id.freq_label, Prefs.FREQUENCY,
            Prefs.FREQ_MIN, Prefs.FREQ_MAX, Prefs.FREQ_DEFAULT, R.string.freq_label)

        bindCheck(R.id.random_check, Prefs.RANDOM_APPEAR)
        bindCheck(R.id.platforms_check, Prefs.PLATFORMS)
        bindCheck(R.id.quiet_check, Prefs.QUIET_FULLSCREEN)

        findViewById<Button>(R.id.skin_button).setOnClickListener {
            startActivity(Intent(this, SkinActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        prefs.registerOnSharedPreferenceChangeListener(this)
        // Питомец был включён, но сервис убит системой — поднимаем обратно.
        if (prefs.getBoolean(Prefs.ENABLED, false) && !PetService.running) {
            if (Settings.canDrawOverlays(this)) PetService.start(this)
            else prefs.edit().putBoolean(Prefs.ENABLED, false).apply()
        }
        refresh()
    }

    override fun onPause() {
        prefs.unregisterOnSharedPreferenceChangeListener(this)
        super.onPause()
    }

    override fun onSharedPreferenceChanged(sp: SharedPreferences?, key: String?) {
        if (key == Prefs.ENABLED) refresh()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
    }

    private fun refresh() {
        updating = true
        petSwitch.isChecked = prefs.getBoolean(Prefs.ENABLED, false)
        updating = false
        for (perm in perms) {
            val ok = perm.granted()
            perm.button.isEnabled = !ok
            perm.button.setText(if (ok) R.string.granted else R.string.grant)
        }
    }

    private fun togglePet(on: Boolean) {
        if (on) {
            if (!Settings.canDrawOverlays(this)) {
                Toast.makeText(this, R.string.need_overlay, Toast.LENGTH_LONG).show()
                refresh()
                perms[0].request()
                return
            }
            prefs.edit().putBoolean(Prefs.ENABLED, true).apply()
            PetService.start(this)
        } else {
            prefs.edit().putBoolean(Prefs.ENABLED, false).apply()
            PetService.stop(this)
        }
    }

    // ---------- настройки ----------

    private fun bindSeek(seekId: Int, labelId: Int, key: String, min: Int, max: Int, def: Int, format: Int) {
        val seek = findViewById<SeekBar>(seekId)
        val label = findViewById<TextView>(labelId)
        val value = prefs.getInt(key, def).coerceIn(min, max)
        seek.max = max - min
        seek.progress = value - min
        label.text = getString(format, value)
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                val v = progress + min
                label.text = getString(format, v)
                if (fromUser) prefs.edit().putInt(key, v).apply()
            }

            override fun onStartTrackingTouch(bar: SeekBar) = Unit
            override fun onStopTrackingTouch(bar: SeekBar) = Unit
        })
    }

    private fun bindCheck(id: Int, key: String) {
        val box = findViewById<CheckBox>(id)
        box.isChecked = prefs.getBoolean(key, true)
        box.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean(key, checked).apply()
        }
    }

    // ---------- разрешения ----------

    private fun packageUri() = Uri.parse("package:$packageName")

    private fun open(intent: Intent) {
        try {
            startActivity(intent)
        } catch (e: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri()))
            } catch (e2: Exception) {
                Toast.makeText(this, R.string.cant_open, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun accessibilityEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?: return false
        val me = ComponentName(this, PlatformService::class.java)
        return enabled.split(':').any { ComponentName.unflattenFromString(it) == me }
    }

    private fun notificationsEnabled(): Boolean =
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()

    private fun requestNotifications() {
        val canAsk = Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
                (!askedNotifications || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))
        if (canAsk) {
            askedNotifications = true
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        } else {
            open(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            )
        }
    }

    private fun batteryUnrestricted(): Boolean =
        (getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)
}
