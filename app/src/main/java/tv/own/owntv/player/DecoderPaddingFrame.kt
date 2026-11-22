package tv.own.owntv.player

import android.content.Context
import android.view.View
import android.widget.FrameLayout

/**
 * Holds the video [SurfaceView][android.view.SurfaceView] and hides the rows a hardware decoder pads a
 * picture with. A 1080-line stream comes out of most decoders 1088 lines tall; where the display does
 * not apply the decoder's crop (seen on Haier), those 8 rows showed as a green bar under the picture.
 *
 * With [extra] above 1 the surface is laid out that much taller from the top, and this frame clips
 * what falls below its own bottom edge, the padding rows.
 */
internal class DecoderPaddingFrame(context: Context) : FrameLayout(context) {
    var extra: Float = 1f
        set(value) {
            if (field != value) {
                field = value
                requestLayout()
            }
        }

    init {
        clipChildren = true
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        val childH = (h * extra).toInt()
        for (i in 0 until childCount) {
            getChildAt(i).measure(
                MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(childH, MeasureSpec.EXACTLY),
            )
        }
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        for (i in 0 until childCount) {
            val child: View = getChildAt(i)
            child.layout(0, 0, child.measuredWidth, child.measuredHeight)
        }
    }

    companion object {
        private const val BLOCK = 16

        /** How much taller the decoder's buffer is than [height] lines, or 1 when it needs no padding. */
        fun paddingRatio(height: Int): Float {
            if (height <= 0 || height % BLOCK == 0) return 1f
            val coded = (height + BLOCK - 1) / BLOCK * BLOCK
            return coded.toFloat() / height
        }
    }
}
