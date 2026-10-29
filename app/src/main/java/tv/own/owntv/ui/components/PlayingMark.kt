package tv.own.owntv.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.size
import tv.own.owntv.ui.brand.SkMateBlue
import tv.own.owntv.ui.theme.mpx

/** The one "this channel is playing" mark, wherever a list shows it: a still, blue pause-style icon from the icon pack. */
@Composable
fun PlayingMark(modifier: Modifier = Modifier) {
    OwnTVIcon(OwnTVIcon.PAUSE, SkMateBlue, modifier.size(30.mpx), filled = true)
}
