package tv.own.owntv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.rememberLottieComposition
import tv.own.owntv.R

/**
 * The profile avatars: [OwnTVAvatars.COUNT] animated people (res/raw/avatar_1…7.json, vector Lottie,
 * IconScout — see docs/third-party/ui-icons.md), each cut to the same circle on one shared backdrop. An id outside the set wraps into it,
 * so a profile saved with an older, larger set still shows one of them.
 */
object OwnTVAvatars {
    const val COUNT = 7
}

private val AvatarFiles = listOf(
    R.raw.avatar_1, R.raw.avatar_2, R.raw.avatar_3, R.raw.avatar_4,
    R.raw.avatar_5, R.raw.avatar_6, R.raw.avatar_7,
)

@Composable
fun OwnTVAvatar(avatarId: Int, modifier: Modifier = Modifier, imagePath: String = "") {
    // avatarId -1 = "no avatar" → show the Rank 1 ProfileIcon as a default silhouette.
    if (avatarId == -1 && imagePath.isBlank()) {
        ProfileIcon(color = Color(0xFF54F2E2), modifier = modifier.padding(4.dp))
        return
    }
    val i = ((avatarId % OwnTVAvatars.COUNT) + OwnTVAvatars.COUNT) % OwnTVAvatars.COUNT
    Box(modifier = modifier.clip(CircleShape).background(if (avatarId != -1) Backdrop else Color.Transparent)) {
        // The person stays underneath the picture rather than being replaced by it: it fills the gap
        // while the file is being read, and it is what the user sees if the picture has gone (cleaned
        // up with the app's storage), with no file-existence check on every composition.
        if (avatarId != -1) {
            val composition by rememberLottieComposition(LottieCompositionSpec.RawRes(AvatarFiles[i]))
            // The animations are drawn on a wide stage, each person in a circle of its own size: Crop
            // drops the empty sides, the scale takes every circle past the avatar's edge, and the clip
            // above cuts them all to one circle, so no person looks bigger than the next.
            LottieAnimation(
                composition = composition,
                iterations = LottieConstants.IterateForever,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize().graphicsLayer { scaleX = PersonScale; scaleY = PersonScale },
            )
        }
        if (imagePath.isNotBlank()) {
            AsyncImage(
                model = java.io.File(imagePath),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize().clip(CircleShape),
            )
        }
    }
}

/** How much the person is enlarged so their own circle reaches past the avatar's edge. */
private const val PersonScale = 1.85f

/** The light blue of the animations' own circles, behind every person. */
private val Backdrop = Color(0xFFD3E6F7)
