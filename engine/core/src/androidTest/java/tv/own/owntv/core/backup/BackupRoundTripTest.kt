package tv.own.owntv.core.backup

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import tv.own.owntv.core.database.OwnTVDatabase
import tv.own.owntv.core.database.entity.ProfileEntity
import tv.own.owntv.core.database.entity.ProfileSourceCrossRef
import tv.own.owntv.core.database.entity.SourceEntity
import tv.own.owntv.core.database.ownTVTestDatabase
import tv.own.owntv.core.i18n.LocaleStore
import tv.own.owntv.core.model.SourceType
import tv.own.owntv.core.settings.SettingsRepository

/**
 * The whole promise of a backup, end to end on a real database: write the file, lose everything,
 * read the file back, and have the profile, its PIN, the playlist and its password again. The sealed
 * variant must also refuse a wrong passphrase and leave the database alone when it does.
 */
@RunWith(AndroidJUnit4::class)
class BackupRoundTripTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var db: OwnTVDatabase
    private lateinit var manager: BackupManager
    private lateinit var folder: File

    @Before
    fun setUp(): Unit = runBlocking {
        db = ownTVTestDatabase()
        val settings = SettingsRepository(context, LocaleStore.from(context))
        folder = File(context.cacheDir, "backup-roundtrip").apply { deleteRecursively(); mkdirs() }
        manager = BackupManager(
            profileDao = db.profileDao(),
            sourceDao = db.sourceDao(),
            settings = settings,
            customize = tv.own.owntv.core.customize.CustomizationStore(context),
            userData = UserDataResolver(
                context, db.channelDao(), db.movieDao(), db.seriesDao(), db.profileDao(), db.favoriteDao(), db.historyDao(),
                db.progressDao(), db.contentOrderDao(), db.customCategoryDao(), db.seriesSortOrderDao(), db.tombstoneDao(), db,
            ),
            epgSources = tv.own.owntv.core.epg.EpgSourceStore(context),
            forceMpvStore = tv.own.owntv.core.player.ForceMpvStore(context, db.playbackQuirkDao()),
            vodEngineStore = tv.own.owntv.core.player.VodEngineStore(context, db.playbackQuirkDao()),
            db = db,
            tmdbOverrides = tv.own.owntv.core.metadata.MetadataOverrideStore(context),
            metadataDao = db.metadataDao(),
            openSubAuth = tv.own.owntv.core.subtitles.OpenSubtitlesAuthStore(context),
            backgroundsDir = File(folder, "backgrounds"),
            subtitlesDir = File(folder, "subtitles"),
            avatarStore = tv.own.owntv.core.profile.ProfileAvatarStore(context),
        )
        val pid = db.profileDao().insert(ProfileEntity(name = "Семья", avatarColor = 0x112233, avatarId = 3, pinHash = "pin-hash-1234"))
        val sid = db.sourceDao().insert(
            SourceEntity(name = "Мой плейлист", type = SourceType.XTREAM, url = "http://example.test:8080", username = "user1", password = "s3cret-pass"),
        )
        db.sourceDao().link(ProfileSourceCrossRef(pid, sid))
    }

    @After
    fun tearDown() {
        db.close()
        folder.deleteRecursively()
    }

    private suspend fun wipe() {
        db.sourceDao().getAllOnce().forEach { db.sourceDao().delete(it) }
        db.profileDao().deleteAll()
        assertTrue(db.profileDao().getAllOnce().isEmpty())
    }

    @Test
    fun sealedBackupRestoresProfilePinAndPlaylistPassword(): Unit = runBlocking {
        val path = manager.export(folder, backupPassword = "кодовая фраза").getOrThrow()
        assertTrue(File(path).length() > 0)
        wipe()

        manager.import(File(path), backupPassword = "кодовая фраза").getOrThrow()

        val profile = db.profileDao().getAllOnce().single()
        assertEquals("Семья", profile.name)
        assertEquals(3, profile.avatarId)
        assertEquals("pin-hash-1234", profile.pinHash)
        val source = db.sourceDao().getAllOnce().single()
        assertEquals("Мой плейлист", source.name)
        assertEquals("user1", source.username)
        assertEquals("s3cret-pass", source.password)
        assertEquals(listOf(source.id), db.sourceDao().allLinks().filter { it.profileId == profile.id }.map { it.sourceId })
    }

    @Test
    fun wrongPassphraseIsRefusedAndTouchesNothing(): Unit = runBlocking {
        val path = manager.export(folder, backupPassword = "right").getOrThrow()
        wipe()
        val result = manager.import(File(path), backupPassword = "wrong")
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is BackupManager.WrongPasswordException)
        assertTrue(db.profileDao().getAllOnce().isEmpty())
        assertTrue(db.sourceDao().getAllOnce().isEmpty())
    }

    @Test
    fun backupWithoutPassphraseLeavesTheSecretsOut(): Unit = runBlocking {
        val path = manager.export(folder, backupPassword = null).getOrThrow()
        val bytes = File(path).readBytes().toString(Charsets.ISO_8859_1)
        assertFalse("the playlist password must not be written in the clear", bytes.contains("s3cret-pass"))
        wipe()
        manager.import(File(path)).getOrThrow()
        val source = db.sourceDao().getAllOnce().single()
        assertEquals("user1", source.username)
        assertTrue("without a passphrase the password is not carried", source.password.isNullOrEmpty())
        assertNotNull(db.profileDao().getAllOnce().singleOrNull())
    }
}
