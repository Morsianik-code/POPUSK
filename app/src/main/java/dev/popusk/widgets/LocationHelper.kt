package dev.popusk.widgets

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import java.util.Locale

object LocationHelper {
    fun hasPermission(ctx: Context): Boolean =
        ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    fun lastKnown(ctx: Context): Location? {
        if (!hasPermission(ctx)) return null
        val lm = ctx.getSystemService(LocationManager::class.java) ?: return null
        return lm.getProviders(true)
            .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .maxByOrNull { it.time }
    }

    /** Свежая точка (до 15 секунд ожидания), иначе последняя известная. Колбэк — на главном потоке. */
    @SuppressLint("MissingPermission")
    fun requestFresh(ctx: Context, callback: (Location?) -> Unit) {
        val lm = ctx.getSystemService(LocationManager::class.java)
        if (lm == null || !hasPermission(ctx)) return callback(null)
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
            ?: return callback(lastKnown(ctx))

        var done = false
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                if (done) return
                done = true
                lm.removeUpdates(this)
                callback(location)
            }

            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}

            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        }
        lm.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
        Handler(Looper.getMainLooper()).postDelayed({
            if (!done) {
                done = true
                lm.removeUpdates(listener)
                callback(lastKnown(ctx))
            }
        }, 15_000)
    }

    /** Название города по координатам. Блокирующий вызов — только из фонового потока. */
    @Suppress("DEPRECATION")
    fun cityName(ctx: Context, lat: Double, lon: Double): String? = runCatching {
        Geocoder(ctx, Locale.getDefault()).getFromLocation(lat, lon, 1)
            ?.firstOrNull()
            ?.let { it.locality ?: it.subAdminArea ?: it.adminArea }
    }.getOrNull()
}
