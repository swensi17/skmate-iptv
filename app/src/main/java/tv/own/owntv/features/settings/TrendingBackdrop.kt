package tv.own.owntv.features.settings

import tv.own.owntv.core.home.TrendingHomeItem

/** The wide picture of a trending item, as the glass-effect page's sample shows it. */
internal fun backdropOf(item: TrendingHomeItem): String? =
    tv.own.owntv.core.metadata.MetadataImages.backdrop(item.snapshot.backdropPath, size = "w780")
        ?: when (item) {
            is TrendingHomeItem.Movie -> item.movie.backdropUrl ?: item.movie.posterUrl
            is TrendingHomeItem.Series -> item.series.backdropUrl ?: item.series.posterUrl
        }
