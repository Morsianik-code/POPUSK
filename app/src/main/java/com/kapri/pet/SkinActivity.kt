package com.kapri.pet

import android.app.Activity
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

/** Экран своего скина: кадры для каждой анимации и скорость их смены. */
class SkinActivity : Activity() {

    private class Row(val anim: String, val thumb: ImageView, val count: TextView)

    private lateinit var prefs: SharedPreferences
    private val rows = ArrayList<Row>()

    private val titles = mapOf(
        "walk" to R.string.anim_walk,
        "sit" to R.string.anim_sit,
        "climb" to R.string.anim_climb,
        "fall" to R.string.anim_fall,
        "drag" to R.string.anim_drag,
        "sleep" to R.string.anim_sleep
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_skin)
        prefs = Prefs.of(this)

        val skinSwitch = findViewById<Switch>(R.id.skin_switch)
        skinSwitch.isChecked = prefs.getBoolean(Prefs.SKIN_ON, false)
        skinSwitch.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean(Prefs.SKIN_ON, checked).apply()
        }

        val fpsLabel = findViewById<TextView>(R.id.fps_label)
        val fpsSeek = findViewById<SeekBar>(R.id.fps_seek)
        val fps = prefs.getInt(Prefs.SKIN_FPS, Prefs.FPS_DEFAULT).coerceIn(Prefs.FPS_MIN, Prefs.FPS_MAX)
        fpsSeek.max = Prefs.FPS_MAX - Prefs.FPS_MIN
        fpsSeek.progress = fps - Prefs.FPS_MIN
        fpsLabel.text = getString(R.string.skin_fps, fps)
        fpsSeek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                val v = progress + Prefs.FPS_MIN
                fpsLabel.text = getString(R.string.skin_fps, v)
                if (fromUser) prefs.edit().putInt(Prefs.SKIN_FPS, v).apply()
            }

            override fun onStartTrackingTouch(bar: SeekBar) = Unit
            override fun onStopTrackingTouch(bar: SeekBar) = Unit
        })

        val container = findViewById<LinearLayout>(R.id.anims)
        SkinStore.ANIMS.forEachIndexed { index, anim ->
            val view = layoutInflater.inflate(R.layout.item_skin_row, container, false)
            view.findViewById<TextView>(R.id.skin_name).setText(titles.getValue(anim))
            val row = Row(anim, view.findViewById(R.id.skin_thumb), view.findViewById(R.id.skin_count))
            view.findViewById<Button>(R.id.skin_pick).setOnClickListener { pick(index) }
            view.findViewById<Button>(R.id.skin_clear).setOnClickListener {
                SkinStore.clear(this, anim)
                changed()
                refresh(row)
            }
            rows.add(row)
            container.addView(view)
            refresh(row)
        }
    }

    private fun pick(index: Int) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("image/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(intent, index)
        } catch (e: Exception) {
            Toast.makeText(this, R.string.cant_open, Toast.LENGTH_LONG).show()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data == null || requestCode !in rows.indices) return
        val uris = ArrayList<Uri>()
        val clip = data.clipData
        if (clip != null) {
            for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }
        } else {
            data.data?.let { uris.add(it) }
        }
        if (uris.isEmpty()) return
        val row = rows[requestCode]
        // Копирование и перекодирование — в фоне, чтобы экран не зависал.
        Thread {
            val saved = SkinStore.import(applicationContext, row.anim, uris)
            runOnUiThread {
                if (saved > 0) {
                    changed()
                    Toast.makeText(this, getString(R.string.skin_saved, saved), Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, R.string.skin_failed, Toast.LENGTH_LONG).show()
                }
                if (!isDestroyed) refresh(row)
            }
        }.start()
    }

    /** Сообщает сервису питомца, что кадры поменялись. */
    private fun changed() {
        prefs.edit().putInt(Prefs.SKIN_VERSION, prefs.getInt(Prefs.SKIN_VERSION, 0) + 1).apply()
    }

    private fun refresh(row: Row) {
        val n = SkinStore.count(this, row.anim)
        row.count.text = if (n > 0) getString(R.string.skin_count, n) else getString(R.string.skin_none)
        row.thumb.setImageBitmap(if (n > 0) SkinStore.firstFrame(this, row.anim, 160) else null)
    }
}
