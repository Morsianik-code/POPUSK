package com.kapri.pet

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileOutputStream

/** Кадры своего скина: лежат во внутреннем хранилище, в папке skin/<анимация>/NNN.png. */
object SkinStore {

    val ANIMS = listOf("walk", "sit", "climb", "fall", "drag", "sleep", "face")

    private const val MAX_FRAMES = 60
    private const val MAX_SIDE = 512

    private fun dir(context: Context, anim: String) = File(context.filesDir, "skin/$anim")

    private fun files(context: Context, anim: String): List<File> =
        dir(context, anim).listFiles { f -> f.name.endsWith(".png") }?.sortedBy { it.name } ?: emptyList()

    fun count(context: Context, anim: String) = files(context, anim).size

    fun clear(context: Context, anim: String) {
        dir(context, anim).deleteRecursively()
    }

    fun firstFrame(context: Context, anim: String, maxSide: Int): Bitmap? =
        files(context, anim).firstOrNull()?.let { decodeFile(it, maxSide) }

    /** Заменяет кадры анимации выбранными картинками. Возвращает, сколько кадров сохранено. */
    fun import(context: Context, anim: String, uris: List<Uri>): Int {
        val decoded = ArrayList<Bitmap>()
        for (uri in uris.take(MAX_FRAMES)) {
            decodeUri(context, uri)?.let { decoded.add(it) }
        }
        if (decoded.isEmpty()) return 0
        clear(context, anim)
        val target = dir(context, anim)
        target.mkdirs()
        decoded.forEachIndexed { i, bmp ->
            FileOutputStream(File(target, "%03d.png".format(i))).use {
                bmp.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            bmp.recycle()
        }
        return decoded.size
    }

    /** Все кадры, уменьшенные под размер питомца. Анимации без кадров в карту не попадают. */
    fun load(context: Context, maxSide: Int): Map<String, List<Bitmap>> {
        val out = HashMap<String, List<Bitmap>>()
        for (anim in ANIMS) {
            val list = files(context, anim).mapNotNull { decodeFile(it, maxSide) }
            if (list.isNotEmpty()) out[anim] = list
        }
        return out
    }

    private fun sample(w: Int, h: Int, maxSide: Int): Int {
        var n = 1
        while (w / (n * 2) >= maxSide || h / (n * 2) >= maxSide) n *= 2
        return n
    }

    private fun decodeFile(file: File, maxSide: Int): Bitmap? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample(bounds.outWidth, bounds.outHeight, maxSide)
        }
        BitmapFactory.decodeFile(file.path, opts)
    } catch (e: Exception) {
        null
    } catch (e: OutOfMemoryError) {
        null
    }

    private fun decodeUri(context: Context, uri: Uri): Bitmap? = try {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample(bounds.outWidth, bounds.outHeight, MAX_SIDE)
        }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
    } catch (e: Exception) {
        null
    } catch (e: OutOfMemoryError) {
        null
    }
}
