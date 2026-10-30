package tv.own.owntv.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.runtime.Composable
import tv.own.owntv.ui.stage.stageGlass
import tv.own.owntv.ui.theme.mpx
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.tv.material3.Text
import kotlinx.coroutines.delay

/**
 * A small in-app toast: a transient message in the top-right notice stack (see [TvNotices]), nicer than a
 * system [android.widget.Toast] on a TV (legible app font, theme colors).
 *
 * Usage: `val toast = rememberInAppToast()` near the top of a screen; call `toast.show("…")` from a click
 * lambda; render [InAppToast] once as a sibling overlay (it stacks like the long-press menus). Emits nothing
 * while idle, so it costs nothing and never intercepts D-pad focus when there's no message.
 */
@Stable
class InAppToastState {
    internal var message by mutableStateOf<String?>(null)
        private set
    internal var tick by mutableStateOf(0L)
        private set
    internal var durationMs by mutableStateOf(DEFAULT_DURATION_MS)
        private set

    /** Posts to the top-right notice stack, the one look every message on the TV shares. */
    fun show(text: String, durationMs: Long = DEFAULT_DURATION_MS) {
        tv.own.owntv.ui.components.TvNotices.show(text, null, durationMs)
    }

    internal fun clear() {
        message = null
    }

    companion object {
        const val DEFAULT_DURATION_MS = 2_200L
    }
}

@Composable
fun rememberInAppToast(): InAppToastState = remember { InAppToastState() }

/** Kept so screens still place it; the message itself is drawn by the notice stack in the shell. */
@Composable
fun InAppToast(state: InAppToastState) {
    state.clear()
}
