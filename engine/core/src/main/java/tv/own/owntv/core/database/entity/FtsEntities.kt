package tv.own.owntv.core.database.entity

import androidx.room.Entity
import androidx.room.Fts4
import androidx.room.FtsOptions

/*
 * External-content FTS4 tables for fast name search across the big lists. Room keeps them in sync
 * with the base tables via generated triggers; `rowid` equals the base row's id, so search joins on
 * `<table>_fts.rowid = <table>.id`. Only the name is indexed to keep the FTS small at 340k+ items.
 *
 * The unicode61 tokenizer folds case for every script (the default one only for ASCII, so "первый"
 * never found "ПЕРВЫЙ") and drops accents, so "ё" and "е", "é" and "e" are the same letter.
 */

private const val TOKENIZER = FtsOptions.TOKENIZER_UNICODE61
private const val NO_DIACRITICS = "remove_diacritics=1"

@Entity(tableName = "channels_fts")
@Fts4(contentEntity = ChannelEntity::class, tokenizer = TOKENIZER, tokenizerArgs = [NO_DIACRITICS])
data class ChannelFtsEntity(val name: String)

@Entity(tableName = "movies_fts")
@Fts4(contentEntity = MovieEntity::class, tokenizer = TOKENIZER, tokenizerArgs = [NO_DIACRITICS])
data class MovieFtsEntity(val name: String)

@Entity(tableName = "series_fts")
@Fts4(contentEntity = SeriesEntity::class, tokenizer = TOKENIZER, tokenizerArgs = [NO_DIACRITICS])
data class SeriesFtsEntity(val name: String)

@Entity(tableName = "episodes_fts")
@Fts4(contentEntity = EpisodeEntity::class, tokenizer = TOKENIZER, tokenizerArgs = [NO_DIACRITICS])
data class EpisodeFtsEntity(val name: String)
