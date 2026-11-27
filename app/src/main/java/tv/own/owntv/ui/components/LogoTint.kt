package tv.own.owntv.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.Color
import coil3.SingletonImageLoader
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Each logo's colour, worked out once: a recent channel's card is read again after every zap. */
private val logoTints = android.util.LruCache<String, Int>(LOGO_TINT_CACHE)

/**
 * The colour a channel's logo is mostly drawn in, darkened enough for white text on it; null until it is known or
 * when the logo has none (all white or black). Read from a 16-pixel copy of the logo, off the main thread, once
 * per logo.
 */
@Composable
fun rememberLogoTint(url: String?): Color? {
    val context = LocalPlatformContext.current
    val known = url?.let { logoTints.get(it) }
    val tint by produceState(known?.let(::Color), url) {
        if (url == null || known != null) return@produceState
        val argb = withContext(Dispatchers.IO) {
            runCatching {
                val request = ImageRequest.Builder(context).data(url).size(LOGO_TINT_SIZE).allowHardware(false).build()
                val bitmap = SingletonImageLoader.get(context).execute(request).image?.toBitmap()
                bitmap?.let(::logoTint)
            }.getOrNull()
        } ?: return@produceState
        logoTints.put(url, argb)
        value = Color(argb)
    }
    return tint
}

/** The logo's pixels weighted by how coloured and how opaque they are, then darkened for white text. */
private fun logoTint(bitmap: android.graphics.Bitmap): Int? {
    var r = 0.0; var g = 0.0; var b = 0.0; var weight = 0.0; var opaque = 0
    val hsv = FloatArray(3)
    for (y in 0 until bitmap.height) for (x in 0 until bitmap.width) {
        val p = bitmap.getPixel(x, y)
        val alpha = android.graphics.Color.alpha(p) / 255.0
        if (alpha < MIN_ALPHA) continue
        opaque++
        android.graphics.Color.colorToHSV(p, hsv)
        val w = alpha * hsv[1] * hsv[2]
        if (w <= 0.0) continue
        r += android.graphics.Color.red(p) * w; g += android.graphics.Color.green(p) * w; b += android.graphics.Color.blue(p) * w
        weight += w
    }
    if (weight < MIN_WEIGHT) return null
    android.graphics.Color.RGBToHSV((r / weight).toInt(), (g / weight).toInt(), (b / weight).toInt(), hsv)
    // Matte: some of the colour taken out and kept dark, so the card is calm and the white text reads.
    hsv[1] = hsv[1] * MATTE_SATURATION
    // A mark on a clear ground (a yellow star alone) would vanish on a card of its own colour: only a hint of it then.
    val plate = opaque.toFloat() / (bitmap.width * bitmap.height) >= PLATE_COVER
    hsv[2] = hsv[2].coerceAtMost(if (plate) MAX_VALUE else MARK_VALUE)
    return android.graphics.Color.HSVToColor(hsv)
}

private const val LOGO_TINT_CACHE = 300
private const val LOGO_TINT_SIZE = 16
private const val MIN_ALPHA = 0.5
private const val MIN_WEIGHT = 2.0
private const val MAX_VALUE = 0.36f
private const val MARK_VALUE = 0.14f
private const val PLATE_COVER = 0.6f
private const val MATTE_SATURATION = 0.6f
