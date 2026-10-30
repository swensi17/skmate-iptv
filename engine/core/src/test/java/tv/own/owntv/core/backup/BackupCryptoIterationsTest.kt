package tv.own.owntv.core.backup

import org.json.JSONObject
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class BackupCryptoIterationsTest {
    private fun block(iterations: Int) = BackupCrypto.cryptoBlock(BackupCrypto.newSalt()).put("iterations", iterations)

    @Test fun hugeIterationCountIsRejected() {
        assertNull(BackupCrypto.deriveKey("pass", block(2_000_000_000)))
    }

    @Test fun tinyIterationCountIsRejected() {
        assertNull(BackupCrypto.deriveKey("pass", block(1)))
    }

    @Test fun defaultIterationCountIsAccepted() {
        assertNotNull(BackupCrypto.deriveKey("pass", block(BackupCrypto.ITERATIONS)))
    }

    @Test fun headerWithoutSaltIsRejected() {
        assertNull(BackupCrypto.deriveKey("pass", JSONObject()))
    }
}
