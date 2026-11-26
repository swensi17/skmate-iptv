package tv.own.owntv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import kotlinx.coroutines.delay
import tv.own.owntv.core.metadata.ProgrammeArt
import tv.own.owntv.core.metadata.ProgrammeArtLookup
import tv.own.owntv.ui.theme.mpx

/**
 * The TMDB poster and description of the programme titled [title], once focus has rested on it a moment:
 * a held key passing channels asks nothing. Null while it is looked up, and for anything that is not a
 * film or a series TMDB knows.
 */
@Composable
fun rememberProgrammeArt(title: String?): ProgrammeArt? {
    val lookup = org.koin.compose.koinInject<ProgrammeArtLookup>()
    // Asked again in the app's new language when it changes: TMDB's title, description and poster follow it.
    val language by org.koin.compose.koinInject<tv.own.owntv.core.i18n.LocaleStore>().currentTag
        .collectAsState()
    val art by produceState<ProgrammeArt?>(initialValue = null, title, language) {
        value = null
        if (title.isNullOrBlank()) return@produceState
        delay(ART_SETTLE_MS)
        value = runCatching { lookup.lookup(title) }.getOrNull()
    }
    return art
}

/** A programme's poster, [width] wide at the poster's own 2:3, softly rounded; nothing fades in. */
@Composable
fun programmePoster(url: String, width: Dp, modifier: Modifier = Modifier) {
    AsyncImage(
        model = ImageRequest.Builder(LocalPlatformContext.current).data(url).build(),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(width, width * POSTER_RATIO)
            .clip(RoundedCornerShape(POSTER_RADIUS.mpx))
            .background(Color.White.copy(alpha = POSTER_BACK_ALPHA)),
    )
}

/** The same poster large, for a whole-screen look ([programmePoster] keeps the light one for lists). */
fun ProgrammeArt.largePosterUrl(): String = posterUrl.replace("/$SMALL_SIZE/", "/$LARGE_SIZE/")

private const val SMALL_SIZE = "w342"
private const val LARGE_SIZE = "w780"
private const val ART_SETTLE_MS = 450L
private const val POSTER_RATIO = 1.5f
private const val POSTER_RADIUS = 10
private const val POSTER_BACK_ALPHA = 0.06f

/**
 * A programme's poster over the whole screen, centred and as tall as the screen allows: the poster already
 * shown appears at once and the large one draws over it when it arrives, so opening never waits. A short
 * fade and grow when animations are on, none otherwise. OK or Back closes it.
 */
@Composable
fun programmePosterViewer(art: ProgrammeArt, onClose: () -> Unit) {
    val focus = androidx.compose.runtime.remember { androidx.compose.ui.focus.FocusRequester() }
    val smooth = tv.own.owntv.ui.theme.MotionPrefs.smooth
    val shown = androidx.compose.runtime.remember { androidx.compose.animation.core.Animatable(if (smooth) 0f else 1f) }
    // Back reaches the app as the system's back, not as a key: without this the panel under the poster took it
    // and closed itself together with the poster.
    androidx.activity.compose.BackHandler { onClose() }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        runCatching { focus.requestFocus() }
        if (smooth) {
            shown.animateTo(1f, androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.ms(VIEWER_MS)))
        }
    }
    androidx.compose.foundation.layout.BoxWithConstraints(
        Modifier.fillMaxSize()
            .graphicsLayer { alpha = shown.value }
            .background(VIEWER_SCRIM)
            .focusRequester(focus)
            .onPreviewKeyEvent { e ->
                val closes = e.key in CLOSE_KEYS && e.key != Key.Back
                if (closes && e.type == KeyEventType.KeyDown) onClose()
                e.key != Key.Back // nothing behind it moves while it is open; Back goes on to the BackHandler
            }
            .focusable(),
        contentAlignment = Alignment.Center,
    ) {
        val height = maxHeight * VIEWER_HEIGHT
        val shape = RoundedCornerShape(VIEWER_RADIUS.mpx)
        Box(
            Modifier.size(height / POSTER_RATIO, height)
                .graphicsLayer { val k = VIEWER_FROM + (1f - VIEWER_FROM) * shown.value; scaleX = k; scaleY = k }
                .clip(shape),
        ) {
            val context = LocalPlatformContext.current
            AsyncImage(
                model = ImageRequest.Builder(context).data(art.posterUrl).build(),
                contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
            )
            AsyncImage(
                model = ImageRequest.Builder(context).data(art.largePosterUrl()).build(),
                contentDescription = art.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

private val CLOSE_KEYS = setOf(Key.Back, Key.DirectionCenter, Key.Enter, Key.NumPadEnter)
private val VIEWER_SCRIM = Color(VIEWER_SCRIM_ARGB)
private const val VIEWER_SCRIM_ARGB = 0xE6000000
private const val VIEWER_HEIGHT = 0.86f
private const val VIEWER_RADIUS = 18
private const val VIEWER_FROM = 0.94f
private const val VIEWER_MS = 180
