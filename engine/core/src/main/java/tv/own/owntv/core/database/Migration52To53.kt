package tv.own.owntv.core.database

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.execSQL

/**
 * v52 → v53: the four name indexes (`channels_fts`, `movies_fts`, `series_fts`, `episodes_fts`) are
 * rebuilt with the unicode61 tokenizer. The default tokenizer folds case for ASCII only, so a search
 * for "первый" never found "ПЕРВЫЙ КАНАЛ", and it keeps accents, so "ё" and "е" were different letters.
 * An index is a cache of its content table: dropping and rebuilding it loses nothing. The rebuild
 * reads every name once (a few seconds for 300k rows), which is why it is a migration and not
 * something done on every open. Last hop, so it carries [OwnTVDatabase.healSchema] (standing rule).
 */
val MIGRATION_52_53 = object : Migration(52, 53) {
    override fun migrate(connection: SQLiteConnection) {
        OwnTVDatabase.EXPECTED_FTS_TABLES.forEach { (name, createSql) ->
            connection.execSQL("DROP TABLE IF EXISTS `$name`")
            connection.execSQL(createSql)
            connection.execSQL("INSERT INTO `$name`(`$name`) VALUES('rebuild')")
        }
        OwnTVDatabase.healSchema(connection)
    }
}
