package tv.own.owntv.features.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.layout.layout
import kotlin.math.roundToInt
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import tv.own.owntv.R
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.live.LiveKey
import tv.own.owntv.core.parser.XtEpgEntry
import tv.own.owntv.features.live.LiveRailItem
import tv.own.owntv.features.live.LiveViewModel
import tv.own.owntv.features.live.displayLabel
import tv.own.owntv.features.shell.components.CategoryContextMenu
import tv.own.owntv.features.shell.components.TvBoxCategoryColumn
import tv.own.owntv.features.shell.components.TvBoxChannelPanel

/**
 * The TV-box player's ◀ panels, kept out of [OwnTVShell] (whose body is already at the size the
 * Android verifier accepts): the channel panel, with the categories column beside it when open, and
 * a category's options on a long OK. Back after previewing other channels returns to the one that was on.
 */
@Composable
internal fun TvBoxPlayerPanels(
    liveVm: LiveViewModel,
    previewChannel: ChannelEntity?,
    zapChannels: List<ChannelEntity>,
    title: String,
    categoryKey: LiveKey?,
    nowProgrammes: Map<Long, XtEpgEntry>,
    railItems: List<LiveRailItem>,
    railCounts: Map<LiveKey, Int>,
    categoriesOpen: Boolean,
    inset: Dp,
    categoriesWidth: Dp,
    dockProgress: () -> Float,
    onClose: () -> Unit,
    onOpenMenu: () -> Unit,
) {
    // The channel that was on when the panel opened, while the panel previews others.
    var startChannel by remember { mutableStateOf<ChannelEntity?>(null) }
    var categoryMenu by remember { mutableStateOf<LiveRailItem?>(null) }
    if (zapChannels.isNotEmpty()) {
        val playingGuide by liveVm.nowNext.collectAsStateWithLifecycle()
        val loading by liveVm.previewEngine.buffering.collectAsStateWithLifecycle()
        TvBoxChannelPanel(
            channels = zapChannels,
            currentId = previewChannel?.id,
            title = title,
            nowProgrammes = nowProgrammes,
            scheduleFor = liveVm::scheduleFor,
            playingGuide = playingGuide,
            onSelect = { liveVm.ensurePlaying(it); startChannel = null; onClose() },
            onDismiss = {
                startChannel?.let { start -> if (start.id != previewChannel?.id) liveVm.ensurePlaying(start) }
                startChannel = null
                onClose()
            },
            onOpenCategories = { liveVm.showCategories() },
            onPreview = { ch -> if (startChannel == null) startChannel = previewChannel; liveVm.ensurePlaying(ch) },
            inset = inset,
            active = !categoriesOpen,
            loading = loading,
            dockProgress = dockProgress,
            modifier = Modifier.fillMaxSize().slideInFromLeft(Unit),
        )
    }
    if (categoriesOpen) {
        TvBoxCategoryColumn(
            modifier = Modifier.slideInFromLeft(categoriesOpen),
            railItems = railItems,
            railCounts = railCounts,
            currentKey = categoryKey,
            onSelect = { key -> liveVm.loadChannelsForCategory(key) },
            onDismiss = { liveVm.hideCategoryBrowser() },
            width = categoriesWidth,
            onLongSelect = { categoryMenu = it },
            paused = categoryMenu != null,
            onOpenMenu = {
                liveVm.hideCategoryBrowser()
                startChannel = null
                onOpenMenu()
            },
        )
        categoryMenu?.let { item ->
            CategoryContextMenu(
                categoryName = item.displayLabel(),
                canHide = item.key is LiveKey.Folder || item.key is LiveKey.Custom,
                canMove = false,
                onHide = { liveVm.hideCategory(item.key); categoryMenu = null },
                onMove = {},
                resetLabel = stringResource(if (item.key is LiveKey.Custom) R.string.content_category_restore_custom else R.string.content_category_restore_playlist),
                onReset = { liveVm.restoreCategory(item.key); categoryMenu = null },
                onDismiss = { categoryMenu = null },
            )
        }
    }
}

/**
 * The one entrance of every panel that opens over the picture (the guide, the channels, the recently watched):
 * it fades in while sliding a few dozen pixels from the edge it belongs to, over the same time and curve, so
 * they all arrive the same way instead of cutting in. The first frame (where the panel is built, the costly
 * one) passes before the motion starts, so the motion itself is not what drops frames. Off with Animations off.
 * [startAlpha] above zero is for a panel that replaces a screen instead of lying over one: the old screen is gone at once,
 * so starting from nothing would leave an empty page for a few frames.
 */
@Composable
internal fun PanelEnter(fromX: Float = 0f, fromY: Float = 0f, startAlpha: Float = 0f, content: @Composable () -> Unit) {
    val duration = tv.own.owntv.ui.theme.MotionPrefs.dur(PANEL_ENTER_MS)
    val progress = androidx.compose.runtime.remember { androidx.compose.animation.core.Animatable(if (duration == 0) 1f else 0f) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (duration == 0) return@LaunchedEffect
        androidx.compose.runtime.withFrameNanos { }
        progress.animateTo(1f, androidx.compose.animation.core.tween(duration, easing = androidx.compose.animation.core.FastOutSlowInEasing))
    }
    val density = androidx.compose.ui.platform.LocalDensity.current.density
    Box(
        Modifier.fillMaxSize().graphicsLayer {
            val left = 1f - progress.value
            alpha = startAlpha + (1f - startAlpha) * progress.value
            translationX = left * fromX * density
            translationY = left * fromY * density
        },
    ) { content() }
}

private const val PANEL_ENTER_MS = 260

/** The guide over the full-screen picture, which keeps playing behind it. Back closes it. */
@Composable
internal fun TvBoxGuideOverlay(liveVm: LiveViewModel, focusChannelId: Long?, onClose: () -> Unit) {
    androidx.compose.runtime.CompositionLocalProvider(
        tv.own.owntv.ui.theme.LocalStagePalette provides tv.own.owntv.ui.theme.StagePalette.Dark,
        tv.own.owntv.ui.theme.LocalStageAccentOverride provides tv.own.owntv.ui.theme.StageAccent(tv.own.owntv.ui.brand.SkMateBlue, Color.White, Color.White),
    ) {
        // The guide's own handlers, composed after, go first.
        BackHandler { onClose() }
        Box(Modifier.fillMaxSize().background(GuideScrim)) {
            tv.own.owntv.features.epg.EpgScreen(
                onPlayChannel = { ch, _ -> liveVm.watchFromGuide(ch); onClose() },
                onPlayCatchup = { ch, prog -> liveVm.playCatchupProgramme(ch, prog); onClose() },
                previewEnabled = false,
                liveMode = true,
                overlay = true,
                focusChannelId = focusChannelId,
                onListView = onClose,
                restoreFocus = true,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** Behind the guide drawn over the playing picture: dark enough to read, light enough to see through. */
private val GuideScrim = Color(0xC7000000)

/**
 * The full-screen picture's layout while the channel panel is open: laid out at the in-between size from
 * the whole screen to the panel's corner ([progress] 0 → 1), moved right by the categories column when
 * [besideCategories] (animated in [inset], which the panel reads for its own window). A SurfaceView
 * ignores layer scaling, so the size itself is animated.
 */
@Composable
internal fun rememberVideoDock(
    docked: Boolean,
    besideCategories: Boolean,
    progress: androidx.compose.animation.core.Animatable<Float, androidx.compose.animation.core.AnimationVector1D>,
    inset: androidx.compose.animation.core.Animatable<Dp, androidx.compose.animation.core.AnimationVector1D>,
): Modifier {
    val spec = androidx.compose.animation.core.tween<Float>(DockAnimMs, easing = androidx.compose.animation.core.FastOutSlowInEasing)
    androidx.compose.runtime.LaunchedEffect(besideCategories) {
        inset.animateTo(
            if (besideCategories) CategoriesColumnWidth else Dp(0f),
            androidx.compose.animation.core.tween(DockAnimMs, easing = androidx.compose.animation.core.FastOutSlowInEasing),
        )
    }
    androidx.compose.runtime.LaunchedEffect(docked) { progress.animateTo(if (docked) 1f else 0f, spec) }
    return Modifier.fillMaxSize().layout { measurable, constraints ->
        val w = constraints.maxWidth
        val h = constraints.maxHeight
        val t = progress.value
        if (t <= 0f) {
            val p = measurable.measure(androidx.compose.ui.unit.Constraints.fixed(w, h))
            layout(w, h) { p.place(0, 0) }
        } else {
            fun lerp(a: Float, b: Float) = a + (b - a) * t
            val dock = tv.own.owntv.features.shell.components.TvBoxDock
            val dockW = dock.width(w.toDp(), inset.value)
            val dw = lerp(w.toFloat(), dockW.toPx()).roundToInt().coerceAtLeast(1)
            val dh = lerp(h.toFloat(), (dockW * 9f / 16f).toPx()).roundToInt().coerceAtLeast(1)
            val p = measurable.measure(androidx.compose.ui.unit.Constraints.fixed(dw, dh))
            layout(w, h) { p.place(lerp(0f, (dock.Left + inset.value).toPx()).roundToInt(), lerp(0f, dock.Top.toPx()).roundToInt()) }
        }
    }
}


/** The picture moving into the panel's corner, and back. */
private val DockAnimMs: Int get() = if (tv.own.owntv.ui.theme.MotionPrefs.smooth) tv.own.owntv.ui.theme.MotionPrefs.ms(220) else 0

/**
 * A panel over the picture slides in from the left when it appears (and again when [key] changes), at the one
 * motion setting the side menu and a channel opening use; at once when that setting is off.
 */
@Composable
private fun Modifier.slideInFromLeft(key: Any): Modifier {
    val smooth = tv.own.owntv.ui.theme.MotionPrefs.smooth
    val shift = androidx.compose.runtime.remember(key) { androidx.compose.animation.core.Animatable(if (smooth) 1f else 0f) }
    androidx.compose.runtime.LaunchedEffect(shift) {
        shift.animateTo(0f, androidx.compose.animation.core.tween(tv.own.owntv.ui.theme.MotionPrefs.ms(240), easing = androidx.compose.animation.core.FastOutSlowInEasing))
    }
    return graphicsLayer { translationX = -shift.value * size.width * 0.25f; alpha = 1f - shift.value }
}
